/**
 * Validate config bằng JSON Schema, fail-fast (§6.4).
 * EN: Validate config against a JSON Schema, fail fast.
 */
import { readFileSync } from 'node:fs';
import { Ajv, type ValidateFunction } from 'ajv';
import YAML from 'yaml';
import { ConfigError } from './errors.js';

// addUsedSchema:false → cho phép compile lại cùng schema (cùng $id) nhiều lần.
const ajv = new Ajv({ allErrors: true, strict: false, addUsedSchema: false });

/** Load schema từ file (JSON hoặc YAML — YAML parse được cả JSON). */
export function loadSchema(filePath: string): object {
  const raw = readFileSync(filePath, 'utf8');
  const parsed = YAML.parse(raw);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigError(`Schema không hợp lệ tại ${filePath}. EN: Invalid schema at ${filePath}`);
  }
  return parsed as object;
}

/**
 * Validate config; ném ConfigError liệt kê toàn bộ lỗi (instancePath + message) kèm tên file nguồn.
 * EN: Validate config; throws ConfigError listing every error with source file names.
 */
export function validateConfig(config: unknown, schema: object, sourceFiles: string[]): void {
  const validate: ValidateFunction = ajv.compile(schema);
  if (validate(config)) return;

  const details = (validate.errors ?? [])
    .map((err) => `  - ${err.instancePath || '(root)'} ${err.message}`)
    .join('\n');
  const sources = sourceFiles.length > 0 ? sourceFiles.join(' + ') : '(inline)';
  throw new ConfigError(`Config không hợp lệ (${sources}):\n${details}`);
}
