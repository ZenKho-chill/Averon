import { describe, it, expect } from 'vitest';
import { renderPlaceholders } from './index.js';

describe('renderPlaceholders', () => {
  it('thay thế placeholder có sẵn', () => {
    expect(renderPlaceholders('Pong! ({latency}ms)', { latency: '42' })).toBe('Pong! (42ms)');
  });

  it('thay nhiều placeholder trong cùng text', () => {
    const out = renderPlaceholders('{tag_user} — {time}', { tag_user: '<@123>', time: '12:30:00' });
    expect(out).toBe('<@123> — 12:30:00');
  });

  it('placeholder thiếu var → thay bằng chuỗi rỗng (không throw)', () => {
    expect(renderPlaceholders('x {unknown} y', {})).toBe('x  y');
  });

  it('text không có placeholder → giữ nguyên', () => {
    expect(renderPlaceholders('Pong!', {})).toBe('Pong!');
  });

  it('dấu ngoặc thường không bị đụng', () => {
    expect(renderPlaceholders('a {b} c {', { b: '1' })).toBe('a 1 c {');
  });
});
