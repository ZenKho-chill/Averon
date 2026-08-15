// Handler event voiceStateUpdate cho module tempvoice (CLAUDE.md §4).
// EN: voiceStateUpdate event handler for the tempvoice module.
//
// Luồng (flow):
// - User join kênh hub → tạo kênh tạm + chuyển user vào.
// - User rời kênh tạm → lên lịch xóa kênh nếu rỗng (delete_empty_delay_ms).
import type { CommandContext } from '../../../core/src/registry/types.js';
import {
  joinedHub,
  leftChannel,
  createTempChannel,
  scheduleDeleteIfEmpty,
  type TempVoiceConfig,
  type VoiceStateLike,
} from '../src/tempvoice.js';

/** Đã cảnh báo hub chưa cấu hình chưa? (tránh spam log). EN: warned hub-not-configured yet? */
let warnedNoHub = false;

/** Lấy config MỚI NHẤT từ registry (sau reload config đổi trên đĩa sẽ được nạp lại). */
function getConfig(ctx?: CommandContext): TempVoiceConfig {
  const registry = ctx?.registry;
  const entry = registry && registry.hasModule('tempvoice') ? registry.getModule('tempvoice') : undefined;
  return (entry?.getConfig?.() ?? ctx?.config ?? {}) as TempVoiceConfig;
}

export async function handler(oldState: VoiceStateLike, newState: VoiceStateLike, ctx?: CommandContext): Promise<void> {
  const config = getConfig(ctx);
  const hubChannelId = config.hub_channel_id;

  if (!hubChannelId) {
    // Chưa cấu hình hub → idle. Log WARN 1 lần để người vận hành biết (tránh spam mỗi lần có voice update).
    // EN: hub not configured → idle. One-time WARN so the operator knows (avoid spamming per voice update).
    if (!warnedNoHub) {
      ctx?.logger?.warn?.(
        'tempvoice: chưa cấu hình hub_channel_id trong config/defaults.yml — module đang idle. ' +
          'EN: tempvoice: hub_channel_id not set in config/defaults.yml — module is idle.',
      );
      warnedNoHub = true;
    }
    return;
  }

  // 1. User vào hub → tạo kênh tạm + chuyển user vào.
  if (joinedHub(oldState, newState, hubChannelId)) {
    await createTempChannel(newState, config);
    return;
  }

  // 2. User rời 1 kênh → nếu đó là kênh tạm, lên lịch xóa khi rỗng.
  const left = leftChannel(oldState, newState);
  if (left) {
    await scheduleDeleteIfEmpty(left, oldState, config);
  }
}

/** Reset cờ cảnh báo (test). EN: reset the warning flag (tests). */
export function __resetWarnedNoHub(): void {
  warnedNoHub = false;
}