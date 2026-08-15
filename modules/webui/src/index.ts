/**
 * modules/webui entry — onLoad: start HTTP server; onUnload: stop (an toàn hot-reload §5.4).
 * EN: modules/webui entry — onLoad: start HTTP server; onUnload: stop (hot-reload safe §5.4).
 */
import type { RegistryLike } from '../../../core/src/registry/types.js';
import type { Logger } from '../../../shared/logger/index.js';
import { WebUiServer } from './server.js';
import { hasEnoughAuth, resolveWebSettings } from './config.js';

let server: WebUiServer | undefined;

/**
 * onLoad nhận registry từ core (core >= 3.5.0) — module đọc service qua
 * `registry.getService(key)` (manager/discord/usage/registry/root).
 * EN: onLoad receives the registry from core (core >= 3.5.0) — the module reaches services
 * via `registry.getService(key)` (manager/discord/usage/registry/root).
 */
export async function onLoad(registry?: RegistryLike): Promise<void> {
  if (!registry) {
    throw new Error(
      'webui cần core service API (registry) — yêu cầu core >= 3.5.0. ' +
        'EN: webui requires the core service API (registry) — needs core >= 3.5.0.',
    );
  }
  const logger: Logger = registry.getService('logger').child({ source: 'modules/webui', context: 'modules/webui' });
  const settings = resolveWebSettings(registry);

  if (!hasEnoughAuth(settings)) {
    throw new Error(
      'webui: host public (không phải localhost) nhưng chưa cấu hình auth — đặt webui.api_token hoặc ' +
        'oauth2.client_secret trong config/config.yml. EN: public host requires auth (webui.api_token or oauth2).',
    );
  }

  const instance = new WebUiServer({ registry, settings, logger });
  const port = await instance.start();
  logger.info(`Web UI sẵn sàng tại http://${settings.host}:${port}`, { host: settings.host, port });
  server = instance;
}

export async function onUnload(): Promise<void> {
  await server?.stop();
  server = undefined;
}