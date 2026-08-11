import { describe, it, expect, vi } from 'vitest';
import { handler } from '../commands/ping';
import type { CommandContext } from '../../../core/src/registry/types.js';

function makeInteraction(overrides: Record<string, unknown> = {}) {
  return {
    reply: vi.fn(),
    user: { id: '123', username: 'Tester' },
    guildId: '999',
    guild: { name: 'My Guild' },
    client: { ws: { ping: 42 } },
    ...overrides,
  };
}

function makeCtx(config: Record<string, unknown>): CommandContext {
  return { config, logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), fatal: vi.fn() } as never };
}

describe('ping command', () => {
  it('không có config → fallback Pong!', async () => {
    const interaction = makeInteraction();
    const result = await handler(interaction as never);
    expect(result).toBe('Pong!');
    expect(interaction.reply).toHaveBeenCalledWith('Pong!');
  });

  it('plain content + placeholder {latency} được thay', async () => {
    const interaction = makeInteraction();
    const ctx = makeCtx({ responses: [{ content: 'Pong! ({latency}ms)' }] });
    const result = await handler(interaction as never, ctx);
    expect(result).toBe('Pong! (42ms)');
    expect(interaction.reply).toHaveBeenCalledWith('Pong! (42ms)');
  });

  it('placeholder {tag_user} {time} {guild} thay đúng', async () => {
    const interaction = makeInteraction();
    const ctx = makeCtx({ responses: [{ content: '{tag_user} in {guild} at {time}' }] });
    const result = await handler(interaction as never, ctx);
    expect(result).toMatch(/^<@123> in My Guild at \d{2}:\d{2}:\d{2}$/);
  });

  it('embed → reply { embeds: [embed] } với placeholder đã thay', async () => {
    const interaction = makeInteraction();
    const ctx = makeCtx({
      responses: [{
        embed: {
          title: 'Pong!',
          description: 'Latency: {latency}ms | {tag_user}',
          color: '#5865F2',
          fields: [{ name: 'Guild', value: '{guild}', inline: true }],
        },
      }],
    });
    const result = await handler(interaction as never, ctx);
    expect(result).toMatch(/^embed:Pong!$/);
    const replyArg = interaction.reply.mock.calls[0][0];
    const embed = replyArg.embeds[0];
    expect(embed.data.title).toBe('Pong!');
    expect(embed.data.description).toBe('Latency: 42ms | <@123>');
    expect(embed.data.color).toBe(0x5865F2); // #5865F2 → 5794546
    expect(embed.data.fields[0].value).toBe('My Guild');
  });

  it('color hex không có # (vd "eb4034") vẫn parse đúng', async () => {
    const interaction = makeInteraction();
    const ctx = makeCtx({
      responses: [{ embed: { title: 'Pong!', description: 'x', color: 'eb4034' } }],
    });
    await handler(interaction as never, ctx);
    const replyArg = interaction.reply.mock.calls[0][0];
    expect(replyArg.embeds[0].data.color).toBe(0xeb4034);
  });

  it('random=true với nhiều responses → trả về 1 trong các câu', async () => {
    const responses = [{ content: 'A' }, { content: 'B' }, { content: 'C' }];
    const ctx = makeCtx({ random: true, responses });
    for (let i = 0; i < 30; i++) {
      const result = await handler(makeInteraction() as never, ctx);
      expect(['A', 'B', 'C']).toContain(result);
    }
  });

  it('random=false → luôn dùng response đầu tiên', async () => {
    const ctx = makeCtx({ random: false, responses: [{ content: 'First' }, { content: 'Second' }] });
    expect(await handler(makeInteraction() as never, ctx)).toBe('First');
    expect(await handler(makeInteraction() as never, ctx)).toBe('First');
  });
});
