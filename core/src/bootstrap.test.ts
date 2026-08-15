import { describe, it, expect, vi, afterEach } from 'vitest';
import { bootstrap } from './bootstrap.js';
import type { AppConfig } from './config/index.js';
vi.mock('./config/index.js', () => ({
  loadCoreConfig: vi.fn(async () => ({
    app: { name: 'averon', version: '0.4.0' },
    discord: { token: 'test-token', intents: ['Guilds'], register_commands: { global: false, guild: false, user: false } },
    logging: { level: 'INFO', console_color: false, file: { enabled: false } },
    crash: { max_failures: 5, fail_window_ms: 300000, watchdog: { enabled: false } },
    dev: { hot_reload: false, show_stacktrace: false },
  } satisfies AppConfig)),
  // Console tắt trong test — tránh tạo readline trên stdin thật.
  getConsoleConfig: vi.fn(() => ({ enabled: false, prompt: 'x> ', soft_stop_timeout_ms: 100 })),
}));

// Mock DiscordClient để không gọi login thật
vi.mock('./discord/index.js', () => ({
  DiscordClient: class {
    login = vi.fn().mockResolvedValue(undefined);
    registerCommand = vi.fn();
    registerEvent = vi.fn();
    hasIntent = vi.fn(() => true);
    syncCommands = vi.fn().mockResolvedValue(undefined);
    getClient = vi.fn();
  },
}));

// Mock backupConfig để không copy file config thật trong test.
// bootstrap import trực tiếp từ shared/config/backup.js (§6.6) — mock đúng module đó.
// findProjectRoot giữ hàm thật — bootstrap dùng nó để resolve project root (modules/*, config).
// EN: Mock backupConfig to avoid copying the real config file; keep the real findProjectRoot —
// bootstrap resolves the project root through it (modules/*, config).
vi.mock('../../shared/config/backup.js', () => ({
  backupConfig: vi.fn(() => 'config/backups/config-test.yml'),
  loadLatestBackupContent: vi.fn(() => null),
}));

vi.mock('../../shared/config/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/config/index.js')>();
  return {
    findProjectRoot: actual.findProjectRoot,
  };
});

afterEach(async () => {
  // Unload mọi module được bootstrap load (vd webui — HTTP server) — tránh leak handle
  // giữa các test (server giữ event loop, port bị chiếm giữa test này và test khác).
  // EN: Unload every module bootstrap loaded (e.g. webui — HTTP server) so no handles/ports
  // leak between tests.
  if (booted) {
    for (const name of [...booted.registry.getAllModules().map((m) => m.name)]) {
      await booted.manager.unload(name, { force: true }).catch(() => undefined);
    }
  }
  booted = undefined;
  vi.restoreAllMocks();
});

// Chạy bootstrap + giữ result để afterEach unload toàn bộ module (bao gồm webui).
// EN: Run bootstrap and keep the result so afterEach can unload every module (incl. webui).
let booted: Awaited<ReturnType<typeof bootstrap>> | undefined;
async function boot(): Promise<Awaited<ReturnType<typeof bootstrap>>> {
  booted = await bootstrap();
  return booted;
}

describe('bootstrap', () => {
  it('gọi pipeline khởi động: config → logger → anti-crash → registry → discord', async () => {
    const result = await boot();
    expect(result.config.app.name).toBe('averon');
    expect(result.logger).toBeDefined();
    expect(result.registry).toBeDefined();
    expect(result.discord).toBeDefined();
    expect(result.crashReporter).toBeDefined();
  });

  it('expose lifecycle/usage/manager/console sau khi bootstrap', async () => {
    const result = await boot();
    expect(result.lifecycle).toBeDefined();
    expect(result.usage).toBeDefined();
    expect(result.manager).toBeDefined();
    expect(result.console).toBeDefined();
    // Console disabled trong mock → không start (không tạo readline).
    expect(result.console.isClosed).toBe(false);
  });

  it('pipeline chạy qua module loader', async () => {
    await boot();
    // Không kiểm tra chi tiết — chỉ đảm bảo không throw
  });

  it('gắn command handler từ module ping qua discord.registerCommand', async () => {
    const result = await boot();
    // Mock DiscordClient.registerCommand là vi.fn → assert đã gọi với tên lệnh + handler function + ctx
    const registerCommand = result.discord.registerCommand as ReturnType<typeof vi.fn>;
    expect(registerCommand).toHaveBeenCalledWith('ping', expect.any(Function), expect.objectContaining({ config: expect.any(Object), moduleName: 'ping' }));
  });

  it('register toàn bộ service core cho module (manager/discord/usage/registry/root)', async () => {
    const result = await boot();
    expect(result.registry.getService('manager')).toBe(result.manager);
    expect(result.registry.getService('discord')).toBe(result.discord);
    expect(result.registry.getService('usage')).toBe(result.usage);
    expect(result.registry.getService('registry')).toBe(result.registry);
    expect(result.registry.getService('root')).toBeDefined();
  });
});