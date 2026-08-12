import { describe, it, expect, vi, afterEach } from 'vitest';
import { bootstrap } from './bootstrap.js';
import type { AppConfig } from './config/index.js';

// Mock loadCoreConfig để trả về config giả
vi.mock('./config/index.js', () => ({
  loadCoreConfig: vi.fn(async () => ({
    app: { name: 'averon', version: '0.4.0' },
    discord: { token: 'test-token', intents: ['Guilds'], register_commands: { global: false, guild: false, user: false } },
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
    syncCommands = vi.fn().mockResolvedValue(undefined);
    getClient = vi.fn();
  },
}));

// Mock backupConfig để không copy file config thật trong test
vi.mock('../../shared/config/index.js', () => ({
  backupConfig: vi.fn(() => 'config/backups/config-test.yml'),
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

  it('gắn command handler từ module ping qua discord.registerCommand', async () => {
    const result = await bootstrap();
    // Mock DiscordClient.registerCommand là vi.fn → assert đã gọi với tên lệnh + handler function + ctx
    const registerCommand = result.discord.registerCommand as ReturnType<typeof vi.fn>;
    expect(registerCommand).toHaveBeenCalledWith('ping', expect.any(Function), expect.objectContaining({ config: expect.any(Object) }));
  });
});