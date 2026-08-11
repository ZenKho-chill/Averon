import { describe, it, expect } from 'vitest';
import { handler } from '../commands/ping';

describe('ping command', () => {
  it('handler trả lời Pong!', async () => {
    const interaction = { reply: (msg) => msg };
    const result = await handler(interaction);
    expect(result).toBe('Pong!');
  });
});
