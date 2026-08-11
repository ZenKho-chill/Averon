/**
 * Merge config (CLAUDE.md §6.2).
 * EN: Config merge.
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
