import { describe, it, expect } from 'vitest';
import { mask } from './mask';

describe('mask', () => {
  it('returns empty string for nullish or empty input', () => {
    expect(mask('')).toBe('');
    expect(mask(null)).toBe('');
    expect(mask(undefined)).toBe('');
  });

  it('masks short values entirely (no leak)', () => {
    expect(mask('abc')).toBe('***');
  });

  it('masks a value whose length equals keepLast entirely', () => {
    expect(mask('abcd', 4)).toBe('****');
  });

  it('keeps the last 4 chars visible by default', () => {
    expect(mask('1234567890')).toBe('******7890');
  });

  it('honors a custom keepLast value', () => {
    expect(mask('abcdefghij', 4)).toBe('******ghij');
  });
});
