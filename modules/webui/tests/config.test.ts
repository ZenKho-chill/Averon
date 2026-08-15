/**
 * Test config resolver — settings hợp nhất từ module config + secret từ core config.
 * EN: Config resolver tests — merge module config + core config secrets.
 */
import { describe, it, expect } from 'vitest';
import { hasEnoughAuth, readSecrets, resolveWebSettings } from '../src/config.js';
import { makeAppConfig, makeRegistry } from './helpers.js';

describe('readSecrets', () => {
  it('đọc api_token + oauth2.client_secret từ core config (gitignored)', () => {
    const app = makeAppConfig({ webui: { api_token: 'secret-token', oauth2: { client_secret: 'client-secret-xyz' } } });
    const secrets = readSecrets(app);
    expect(secrets.apiToken).toBe('secret-token');
    expect(secrets.oauth2ClientSecret).toBe('client-secret-xyz');
  });

  it('thiếu section webui → chuỗi rỗng (không crash)', () => {
    const secrets = readSecrets(makeAppConfig());
    expect(secrets.apiToken).toBe('');
    expect(secrets.oauth2ClientSecret).toBe('');
  });
});

describe('resolveWebSettings', () => {
  const services = { config: makeAppConfig() };

  it('merge module config đầy đủ', () => {
    const registry = makeRegistry(services, {
      host: '0.0.0.0',
      port: 8080,
      static_dir: 'public',
      public_home: false,
      admin_user_ids: ['admin-1'],
      oauth2: { client_id: 'cid', redirect_uri: 'http://x/cb' },
    });
    const s = resolveWebSettings(registry);
    expect(s.host).toBe('0.0.0.0');
    expect(s.port).toBe(8080);
    expect(s.publicHome).toBe(false);
    expect(s.adminUserIds).toEqual(['admin-1']);
    expect(s.oauth2.clientId).toBe('cid');
    expect(s.oauth2.clientSecret).toBe('');
  });

  it('thiếu field → dùng default an toàn', () => {
    const registry = makeRegistry(services, {});
    const s = resolveWebSettings(registry);
    expect(s.host).toBe('127.0.0.1');
    expect(s.port).toBe(3000);
    expect(s.publicHome).toBe(true);
    expect(s.staticDir).toBe('public');
    expect(s.adminUserIds).toEqual([]);
  });
});

describe('hasEnoughAuth', () => {
  it('localhost không cần auth (dev-safe)', () => {
    const settings = {
      host: '127.0.0.1', apiToken: '', oauth2: { clientSecret: '' },
    } as never;
    expect(hasEnoughAuth(settings)).toBe(true);
  });

  it('host public + không auth → FAIL (từ chối phục vụ)', () => {
    const settings = {
      host: '0.0.0.0', apiToken: '', oauth2: { clientSecret: '' },
    } as never;
    expect(hasEnoughAuth(settings)).toBe(false);
  });

  it('host public + api_token → OK', () => {
    const settings = {
      host: '0.0.0.0', apiToken: 'x', oauth2: { clientSecret: '' },
    } as never;
    expect(hasEnoughAuth(settings)).toBe(true);
  });

  it('host public + oauth2 client_secret → OK', () => {
    const settings = {
      host: '0.0.0.0', apiToken: '', oauth2: { clientSecret: 'y' },
    } as never;
    expect(hasEnoughAuth(settings)).toBe(true);
  });
});