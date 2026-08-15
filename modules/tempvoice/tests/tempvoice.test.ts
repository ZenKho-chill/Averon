import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildChannelName,
  joinedHub,
  leftChannel,
  createTempChannel,
  scheduleDeleteIfEmpty,
  markTempChannel,
  __resetTempChannels,
  type TempVoiceConfig,
  type VoiceStateLike,
} from '../src/tempvoice';
import { handler, __resetWarnedNoHub } from '../events/voiceStateUpdate';
import type { CommandContext } from '../../../core/src/registry/types.js';

function makeState(overrides: Partial<VoiceStateLike> = {}): VoiceStateLike {
  return {
    channelId: null,
    member: { user: { username: 'Tester' } },
    guild: { id: '999', channels: { create: vi.fn(), fetch: vi.fn() } },
    ...overrides,
  } as VoiceStateLike;
}

function makeCtx(config: TempVoiceConfig, registry?: { hasModule: (n: string) => boolean; getModule: (n: string) => { getConfig?: () => Record<string, unknown> } }): CommandContext {
  return {
    config: config as unknown as Record<string, unknown>,
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() } as never,
    moduleName: 'tempvoice',
    registry: registry as never,
  };
}

describe('buildChannelName', () => {
  it('template có {username} → thay tên user', () => {
    expect(buildChannelName('Alice', { channel_name_template: "{username}'s Channel" })).toBe("Alice's Channel");
  });

  it('template rỗng/không có → dùng mặc định "{username}\'s Channel"', () => {
    expect(buildChannelName('Bob', {})).toBe("Bob's Channel");
  });

  it('tên dài > 100 ký tự → cắt về 100 ký tự (giới hạn Discord)', () => {
    const name = buildChannelName('A'.repeat(150), { channel_name_template: '{username}' });
    expect(name.length).toBe(100);
  });
});

describe('joinedHub', () => {
  it('vào hub từ nơi khác → true', () => {
    const oldState = makeState({ channelId: null });
    const newState = makeState({ channelId: 'hub1' });
    expect(joinedHub(oldState, newState, 'hub1')).toBe(true);
  });

  it('đang ở hub rồi vẫn emit voiceStateUpdate (cùng kênh) → false', () => {
    const oldState = makeState({ channelId: 'hub1' });
    const newState = makeState({ channelId: 'hub1' });
    expect(joinedHub(oldState, newState, 'hub1')).toBe(false);
  });

  it('vào kênh khác (không phải hub) → false', () => {
    const oldState = makeState({ channelId: null });
    const newState = makeState({ channelId: 'other' });
    expect(joinedHub(oldState, newState, 'hub1')).toBe(false);
  });
});

describe('leftChannel', () => {
  it('rời voice hoàn toàn → trả kênh rời', () => {
    const oldState = makeState({ channelId: 'vc1' });
    const newState = makeState({ channelId: null });
    expect(leftChannel(oldState, newState)).toBe('vc1');
  });

  it('chuyển từ kênh này sang kênh khác → trả kênh rời', () => {
    const oldState = makeState({ channelId: 'vc1' });
    const newState = makeState({ channelId: 'vc2' });
    expect(leftChannel(oldState, newState)).toBe('vc1');
  });

  it('không rời kênh (cùng kênh) → null', () => {
    const oldState = makeState({ channelId: 'vc1' });
    const newState = makeState({ channelId: 'vc1' });
    expect(leftChannel(oldState, newState)).toBeNull();
  });
});

describe('createTempChannel', () => {
  it('tạo kênh voice + chuyển user vào', async () => {
    const create = vi.fn(async (options: Record<string, unknown>) => ({ id: 'newvc', name: options.name }));
    const setChannel = vi.fn(async () => {});
    const newState = makeState({ channelId: 'hub1', guild: { id: '999', channels: { create } } });
    newState.setChannel = setChannel;

    const result = await createTempChannel(newState, { channel_name_template: "{username}'s Channel" });

    expect(create).toHaveBeenCalledWith({
      name: "Tester's Channel",
      type: 2, // GuildVoice
    });
    expect(setChannel).toHaveBeenCalledWith('newvc', expect.stringContaining('tempvoice'));
    expect(result).toEqual({ id: 'newvc', name: "Tester's Channel" });
  });

  it('truyền category/bitrate/userLimit khi config có giá trị', async () => {
    const create = vi.fn(async (options: Record<string, unknown>) => ({ id: 'newvc', name: options.name }));
    const newState = makeState({ channelId: 'hub1', guild: { id: '999', channels: { create } } });

    await createTempChannel(newState, {
      channel_name_template: '{username}',
      category_id: 'cat1',
      bitrate_kbps: 96,
      max_users: 5,
    });

    expect(create).toHaveBeenCalledWith({
      name: 'Tester',
      type: 2,
      parent: 'cat1',
      bitrate: 96000,
      userLimit: 5,
    });
  });

  it('không có guild → return null, không tạo', async () => {
    const newState = makeState({ guild: null });
    expect(await createTempChannel(newState, {})).toBeNull();
  });
});

describe('scheduleDeleteIfEmpty', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetTempChannels();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('kênh tạm rỗng → lên lịch xóa sau delay, trả true', async () => {
    markTempChannel('vc1');
    const deleteFn = vi.fn(async () => {});
    const fetch = vi.fn(async () => ({ id: 'vc1', name: 'x', members: { size: 0 }, delete: deleteFn }));
    const oldState = makeState({ channelId: 'vc1', guild: { id: '999', channels: { fetch } } });

    const result = await scheduleDeleteIfEmpty('vc1', oldState, { delete_empty_delay_ms: 3000 });
    expect(result).toBe(true);
    expect(deleteFn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);
    expect(deleteFn).toHaveBeenCalledWith(expect.stringContaining('tempvoice'));
  });

  it('kênh KHÔNG phải kênh tạm (không trong danh sách) → không xóa, trả false', async () => {
    const deleteFn = vi.fn(async () => {});
    const fetch = vi.fn(async () => ({ id: 'vc1', name: 'x', members: { size: 0 }, delete: deleteFn }));
    const oldState = makeState({ channelId: 'vc1', guild: { id: '999', channels: { fetch } } });

    const result = await scheduleDeleteIfEmpty('vc1', oldState, { delete_empty_delay_ms: 3000 });
    expect(result).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('kênh tạm còn người → không lên lịch xóa, trả false', async () => {
    markTempChannel('vc1');
    const deleteFn = vi.fn(async () => {});
    const fetch = vi.fn(async () => ({ id: 'vc1', name: 'x', members: { size: 2 }, delete: deleteFn }));
    const oldState = makeState({ channelId: 'vc1', guild: { id: '999', channels: { fetch } } });

    const result = await scheduleDeleteIfEmpty('vc1', oldState, { delete_empty_delay_ms: 3000 });
    expect(result).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('không có guild → return false', async () => {
    const oldState = makeState({ guild: null });
    expect(await scheduleDeleteIfEmpty('vc1', oldState, {})).toBe(false);
  });
});

describe('handler voiceStateUpdate', () => {
  beforeEach(() => {
    __resetWarnedNoHub();
    __resetTempChannels();
  });

  it('user join hub → tạo kênh tạm + chuyển user (luồng chính)', async () => {
    const create = vi.fn(async (options: Record<string, unknown>) => ({ id: 'newvc', name: options.name }));
    const setChannel = vi.fn(async () => {});
    const oldState = makeState({ channelId: null });
    const newState = makeState({ channelId: 'hub1', guild: { id: '999', channels: { create } } });
    newState.setChannel = setChannel;
    const ctx = makeCtx({ hub_channel_id: 'hub1', channel_name_template: "{username}'s Channel" });

    await handler(oldState, newState, ctx);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "Tester's Channel", type: 2 }));
    expect(setChannel).toHaveBeenCalled();
  });

  it('chưa cấu hình hub_channel_id → idle, cảnh báo 1 lần', async () => {
    const warn = vi.fn();
    const ctx = makeCtx({});
    ctx.logger = { warn } as never;

    const newState = makeState({ channelId: 'somevc', guild: { id: '999', channels: { create: vi.fn() } } });
    await handler(makeState({ channelId: null }), newState, ctx);
    await handler(makeState({ channelId: null }), newState, ctx);

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('user rời kênh tạm (đã được đánh dấu) → lên lịch xóa nếu rỗng', async () => {
    markTempChannel('vc1');
    const deleteFn = vi.fn(async () => {});
    const fetch = vi.fn(async () => ({ id: 'vc1', name: 'x', members: { size: 0 }, delete: deleteFn }));
    const oldState = makeState({ channelId: 'vc1', guild: { id: '999', channels: { fetch } } });
    const newState = makeState({ channelId: null });
    const ctx = makeCtx({ hub_channel_id: 'hub1', delete_empty_delay_ms: 3000 });

    vi.useFakeTimers();
    try {
      await handler(oldState, newState, ctx);
      await vi.advanceTimersByTimeAsync(3000);
      expect(deleteFn).toHaveBeenCalledWith(expect.stringContaining('tempvoice'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('user rời kênh thường (không phải kênh tạm) → không xóa', async () => {
    const deleteFn = vi.fn(async () => {});
    const fetch = vi.fn(async () => ({ id: 'vc1', name: 'x', members: { size: 0 }, delete: deleteFn }));
    const oldState = makeState({ channelId: 'vc1', guild: { id: '999', channels: { fetch } } });
    const newState = makeState({ channelId: null });
    const ctx = makeCtx({ hub_channel_id: 'hub1', delete_empty_delay_ms: 3000 });

    vi.useFakeTimers();
    try {
      await handler(oldState, newState, ctx);
      await vi.advanceTimersByTimeAsync(3000);
      expect(deleteFn).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
