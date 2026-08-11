/**
 * Lỗi config — ném ra với thông điệp rõ ràng (CLAUDE.md §6.4 fail-fast, không crash im lặng).
 * EN: Config error — thrown with a clear message; never fail silently.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}
