import { describe, it, expect, vi, afterEach } from 'vitest';
import { bootstrap } from './bootstrap.js';
import type { AppConfig } from './config/index.js';

// Mock loadCoreConfig để trả về config giả
vi.mock('./config/index.js', () => ({
  loadCoreConfig: vi.fn(async () => ({
    app: { name: 'averon', version: '0.3.0' },
    discord: { token: 'test-token', intents: ['Guilds'] },
    logging: { level: 'INFO', console_color: false, file: { enabled: false } },
    crash: { max_failures: 5, fail_window_ms: 300000, watchdog: { enabled: false } },
    dev: { hot_reload: false, show_stacktrace: false },
  } satisfies AppConfig)),
}));

// Mock DiscordClient để không gọi login thật
vi.mock('./discord/index.js', () => ({
  DiscordClient: class {
    login = vi.fn().mockResolvedValue(undefined);
    registerCommand = vi.fn();
    registerEvent = vi.fn();
    getClient = vi.fn();
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bootstrap', () => {
  it('gọi pipeline khởi động: config → logger → anti-crash → registry → discord', async () => {
    const result = await bootstrap();
    expect(result.config.app.name).toBe('averon');
    expect(result.logger).toBeDefined();
    expect(result.registry).toBeDefined();
    expect(result.discord).toBeDefined();
    expect(result.crashReporter).toBeDefined();
  });

  it('pipeline chạy qua module loader', async () => {
    await bootstrap();
    // Không kiểm tra chi tiết — chỉ đảm bảo không throw
  });
});