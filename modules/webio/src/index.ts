import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import * as crypto from 'crypto';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { backupConfig } from '../../../shared/config/backup.js';
import { validateConfig } from '../../../shared/config/validator.js';
import YAML from 'yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server: http.Server | null = null;
let wss: WebSocketServer | null = null;


// In-memory session store (sessionToken -> { userId, expiresAt })


function generateSessionToken(secret: string, userId: string): string {
    const data = `${userId}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(data);
    return `${data}.${hmac.digest('hex')}`;
}

function verifySession(token: string, secret: string): string | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 2) return null;
        const [data, signature] = parts;
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(data);
        const expectedSignature = hmac.digest('hex');
        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
            return null;
        }
        const [userId, timestampStr] = data.split(':');
        if (Date.now() - parseInt(timestampStr) > 24 * 60 * 60 * 1000) { // 24 hours expiry
             return null;
        }
        return userId;
    } catch {
        return null;
    }
}

import type { CommandContext } from '../../../core/src/registry/types.js';
export const onLoad = async (ctx?: CommandContext) => {
  if (!ctx) return;

  const { config, logger, registry } = ctx;
  const webioConfig = config as Record<string, unknown>;
  const port = webioConfig.port as number;
  const clientId = webioConfig.client_id as string;
  const clientSecret = webioConfig.client_secret as string;
  const redirectUri = webioConfig.redirect_uri as string;
  const sessionSecret = webioConfig.session_secret as string;
  const allowedUsers = webioConfig.allowed_users as string[];

  const app = express();
  server = http.createServer(app);
  wss = new WebSocketServer({ server });

  app.use(express.json());

  // Serve static files properly
  const publicPath = path.join(__dirname, '..', 'public');
  app.use(express.static(publicPath));

  // OAuth2 Routes
  app.get('/api/auth/login', (_req, res) => {
      const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify`;
      res.redirect(authUrl);
  });

  app.get('/api/auth/callback', async (req, res) => {
      const code = req.query.code as string;
      if (!code) {
          res.status(400).send('Missing code');
          return;
      }
      try {
          const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
              method: 'POST',
              body: new URLSearchParams({
                  client_id: clientId,
                  client_secret: clientSecret,
                  grant_type: 'authorization_code',
                  code: code,
                  redirect_uri: redirectUri
              }).toString(),
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          });
          const tokenData = await tokenRes.json() as Record<string, unknown>;
          if (!tokenRes.ok) {
              res.status(400).send('Failed to get token');
              return;
          }

          const userRes = await fetch('https://discord.com/api/users/@me', {
              headers: { Authorization: `Bearer ${tokenData.access_token}` }
          });
          const userData = await userRes.json() as Record<string, unknown>;
          if (!userRes.ok) {
              res.status(400).send('Failed to fetch user');
              return;
          }

          if (!allowedUsers.includes(userData.id as string)) {
              res.status(403).send('Access denied: User not in allowed_users list.');
              return;
          }

          const sessionToken = generateSessionToken(sessionSecret, userData.id as string);
          // Redirect back to dashboard with token
          res.redirect(`/?token=${encodeURIComponent(sessionToken)}`);
      } catch (err) {
          logger.error('OAuth error', { error: err });
          res.status(500).send('Internal Server Error');
      }
  });


  // Auth Middleware for API
  app.use('/api', (req, res, next) => {
    // skip auth for public endpoints
    if (req.path.startsWith('/auth/')) return next();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const providedToken = authHeader.split(' ')[1];
    const userId = verifySession(providedToken, sessionSecret);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  });

  // API Routes
  const manager = registry!.getService('manager');
  const discord = registry!.getService('discord');
  const appRegistry = registry!.getService('registry');

  app.get('/api/status', (_req, res) => {
    const dClient = discord.getClient();
    res.json({
      uptime: process.uptime(),
      discordReady: dClient.isReady(),
      discordPing: dClient.ws.ping,
      guilds: dClient.guilds.cache.size
    });
  });

  app.get('/api/modules', (_req, res) => {
    const modules = appRegistry.getAllModules();
    res.json(modules.map((m: import('../../../core/src/registry/types.js').ModuleRegistryEntry) => ({
      name: m.name,
      version: m.version,
      state: m.state,
    })));
  });

  app.post('/api/modules/:name/:action', async (req, res) => {
    const { name, action } = req.params;
    const force = req.query.force === 'true';
    try {
      let result;
      switch (action) {
        case 'load': result = await manager.load(name); break;
        case 'unload': result = await manager.unload(name, { force }); break;
        case 'reload': result = await manager.reload(name, { force }); break;
        default: return res.status(400).json({ error: 'Invalid action' });
      }
      res.json(result);
    } catch (e: unknown) {
      if (e instanceof Error) {
        res.status(500).json({ error: e.message });
      } else {
        res.status(500).json({ error: String(e) });
      }
    }
  });

  app.get('/api/config/:module', (req, res) => {
    const { module } = req.params;
    if (module === 'core') {
      res.json(registry!.getService('config'));
      return;
    }
    if (!appRegistry.hasModule(module)) return res.status(404).json({ error: 'Module not found' });
    const m = appRegistry.getModule(module);
    res.json(m.config || {});
  });

  app.post('/api/config/:module', async (req, res) => {
    const { module } = req.params;
    const newConfig = req.body;

    try {
      const rootPath = registry!.getService('root');
      let targetDir = '';
      if (module === 'core') {
         targetDir = path.join(rootPath, 'config');
         backupConfig(targetDir, { type: 'core' });
         const targetFile = path.join(targetDir, 'config.yml');
         const fileContent = fs.readFileSync(targetFile, 'utf8');
         const doc = YAML.parseDocument(fileContent);
         for(const key of Object.keys(newConfig)) {
           doc.set(key, newConfig[key]);
         }
         fs.writeFileSync(targetFile, String(doc));
         res.json({ success: true, message: 'Core config updated. Restart required.' });
      } else {
         if (!appRegistry.hasModule(module)) return res.status(404).json({ error: 'Module not found' });
         targetDir = path.join(rootPath, 'modules', module);
         const schemaPath = path.join(targetDir, 'config', 'schema.yml');
         if (fs.existsSync(schemaPath)) {
            const schemaStr = fs.readFileSync(schemaPath, 'utf8');
            const schema = YAML.parse(schemaStr);
            validateConfig(newConfig, schema, ['API update']);
         }
         backupConfig(targetDir, { type: 'module', name: module, content: YAML.stringify(newConfig) });
         const targetFile = path.join(targetDir, 'config', 'config.yml');
         if(fs.existsSync(targetFile)) {
             const fileContent = fs.readFileSync(targetFile, 'utf8');
             const doc = YAML.parseDocument(fileContent);
             for(const key of Object.keys(newConfig)) {
               doc.set(key, newConfig[key]);
             }
             fs.writeFileSync(targetFile, String(doc));
         } else {
             fs.writeFileSync(targetFile, YAML.stringify(newConfig));
         }
         res.json({ success: true, message: 'Module config updated. Reload module to apply.' });
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        res.status(500).json({ error: e.message });
      } else {
        res.status(500).json({ error: String(e) });
      }
    }
  });


  // WebSocket for Realtime logs & stats
  wss.on('connection', (ws, req) => {
    // Auth for WS
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const wToken = url.searchParams.get('token');
    if (!wToken || !verifySession(wToken, sessionSecret)) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const interval = setInterval(() => {
        if(ws.readyState !== WebSocket.OPEN) return;
        const dClient = discord.getClient();
        ws.send(JSON.stringify({
            type: 'stats',
            data: {
              uptime: process.uptime(),
              discordReady: dClient.isReady(),
              discordPing: dClient.ws.ping,
              guilds: dClient.guilds.cache.size,
              users: dClient.users?.cache?.size || 0
            }
        }));
    }, 2000);

    ws.on('close', () => clearInterval(interval));
  });

  // Monkey-patch logger.write to broadcast logs
  const realLogger = registry!.getService('logger') as unknown as Record<string, unknown>;
  if (realLogger && Array.isArray(realLogger.sinks)) {
    const sinks = realLogger.sinks;
    // Add custom sink
    const customSink = {
        write: (line: string) => {
            if (!wss) return;
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'log', data: line }));
                }
            });
        }
    };
    sinks.push(customSink);

  }

  server.listen(port, () => {
    logger.info(`Webio dashboard started on port ${port}`);
  });
};

export const onUnload = () => {
  if (server) {
    server.close();
    server = null;
  }
  if (wss) {
    wss.close();
    wss = null;
  }
};
