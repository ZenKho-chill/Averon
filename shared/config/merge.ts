/**
 * Merge & interpolate config (CLAUDE.md §6.2, §6.3).
 * EN: Merge & interpolate config.
 */

/** Merge sâu: object con được merge đệ quy; array/giá trị đơn do override thay thế hoàn toàn. */
export function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : (override as T);
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    out[key] = deepMerge(out[key], value);
  }
  return out as T;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Thay ${VAR} bằng giá trị từ env. Hỗ trợ default: ${VAR:-default}.
 * EN: Replace ${VAR} from env; supports ${VAR:-default} fallback.
 *
 * - ${VAR}      → thiếu biến là LỖI (fail-fast, §6.4)
 * - ${VAR:-x}   → thiếu biến thì dùng 'x'
 * - ${VAR:-}    → thiếu biến thì dùng chuỗi rỗng (cho secret tùy chọn)
 */
export function interpolateString(value: string, env: Record<string, string | undefined>): string {
  return value.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g,
    (_match: string, name: string, fallback?: string) => {
      const envValue = env[name];
      if (envValue !== undefined && envValue !== '') return envValue;
      if (fallback !== undefined) return fallback;
      throw new Error(
        `Thiếu biến môi trường "${name}" (được tham chiếu trong config). ` +
          `EN: Missing environment variable "${name}" referenced in config.`,
      );
    },
  );
}

/** Đệ quy interpolate toàn bộ string trong object/array. */
export function interpolateValue(
  value: unknown,
  env: Record<string, string | undefined>,
): unknown {
  if (typeof value === 'string') return interpolateString(value, env);
  if (Array.isArray(value)) return value.map((item) => interpolateValue(item, env));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = interpolateValue(item, env);
    }
    return out;
  }
  return value;
}
