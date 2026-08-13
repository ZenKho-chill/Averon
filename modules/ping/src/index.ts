// Entry point cho module ping

import { ConfigError } from '../../../../shared/config/errors.js';

/** Validate config module ping — gọi bởi core khi load module. */
export function validateConfig(config: Record<string, unknown>): void {
  const errors: string[] = [];

  if (!config.responses || !Array.isArray(config.responses)) {
    errors.push(`Thiếu field 'responses' (phải là array)`);
  } else {
    for (const [i, response] of config.responses.entries()) {
      if (typeof response !== 'object' || !response) {
        errors.push(`responses[${i}] phải là object`);
        continue;
      }
      if (!response.type || (response.type !== 'plain' && response.type !== 'embed')) {
        errors.push(`responses[${i}].type phải là 'plain' hoặc 'embed'`);
      }
      if (response.type === 'plain' && !response.content) {
        errors.push(`responses[${i}] thiếu field 'content' (type=plain)`);
      }
      if (response.type === 'embed' && !response.embed) {
        errors.push(`responses[${i}] thiếu field 'embed' (type=embed)`);
      }
    }
  }

  if (errors.length > 0) {
    throw new ConfigError(`Config module 'ping' không hợp lệ:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}

export const onLoad = () => {
  // Hook khi module được load — khởi tạo state ở đây nếu cần.
  // KHÔNG dùng console.log: nó bypass logger (§7) và lẫn vào output của operator console.
  // EN: Called when the module is loaded — init state here if needed.
  // Do NOT console.log here: it bypasses the logger (§7) and mixes into the operator console output.
};

export const onUnload = () => {
  // Hook khi module unload/hot-reload — cleanup ở đây (đóng handle, clear interval...).
  // EN: Called on unload/hot-reload — cleanup here (close handles, clear intervals...).
};
