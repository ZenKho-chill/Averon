/**
 * shared/config/module-semantic — validate ý nghĩa (semantic) của config module.
 * EN: Semantic validation for module config, run after JSON Schema validation.
 *
 * JSON Schema (`config/schema.yml`) đã tự xử lý nhiều loại lỗi (required, type, enum,
 * pattern, additionalProperties, oneOf...) — module KHÔNG cần tự viết validateConfig
 * hardcode. File này chỉ giữ các quy tắc ngữ nghĩa ngoài phạm vi schema.
 */
import { ConfigError } from './errors.js';
import type { ModuleManifest } from '../../core/src/loader/types.js';

/**
 * Validate ý nghĩa của config module (run sau JSON Schema validation).
 * @param config Config module đã merge (defaults + override)
 * @param manifest Module manifest
 * @param moduleName Tên module
 */
export function validateModuleSemantics(
  config: Record<string, unknown>,
  manifest: ModuleManifest,
  moduleName: string,
): void {
  const errors: string[] = [];

  // 1. Kiểm tra các field bắt buộc nếu module khai báo schema
  if (manifest.config?.schema) {
    // Nếu module có schema nhưng config rỗng → cảnh báo
    if (Object.keys(config).length === 0) {
      errors.push(`Module '${moduleName}' có schema nhưng config trống`);
    }
  }

  if (errors.length > 0) {
    throw new ConfigError(`Config module '${moduleName}' không hợp lệ:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}