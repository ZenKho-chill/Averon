/**
 * shared/config/module-semantic — validate ý nghĩa (semantic) của config module.
 * EN: Semantic validation for module config, run after JSON Schema validation.
 */
import { ConfigError } from './errors.js';
import type { ModuleManifest } from '../../core/src/loader/types.js';

/**
 * Validate ý nghĩa của config module.
 * @param config Config module đã merge (defaults + override)
 * @param manifest Module manifest
 * @param moduleName Tên module
 * @param moduleExports Module exports (để gọi hook validateConfig nếu có)
 */
export function validateModuleSemantics(
  config: Record<string, unknown>,
  manifest: ModuleManifest,
  moduleName: string,
  moduleExports?: any
): void {
  const errors: string[] = [];

  // 1. Kiểm tra các field bắt buộc nếu module khai báo schema
  if (manifest.config?.schema) {
    // Nếu module có schema nhưng config rỗng → cảnh báo
    if (Object.keys(config).length === 0) {
      errors.push(`Module '${moduleName}' có schema nhưng config trống`);
    }
  }

  // 2. Tự xử lý (Self-handling): Gọi hook validateConfig từ module nếu tồn tại
  if (moduleExports?.validateConfig && typeof moduleExports.validateConfig === 'function') {
    try {
      moduleExports.validateConfig(config);
    } catch (err) {
      if (err instanceof ConfigError) throw err;
      throw new ConfigError(`Module '${moduleName}' validation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (errors.length > 0) {
    throw new ConfigError(`Config module '${moduleName}' không hợp lệ:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}