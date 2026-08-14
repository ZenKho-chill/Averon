import { describe, it, expect } from 'vitest';
import {
  UserError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  InvalidArgumentError,
  toUserMessage,
  GENERIC_ERROR_MESSAGE,
} from './index.js';

describe('shared/errors', () => {
  it('UserError → toUserMessage trả message của nó (bất kể dev/prod)', () => {
    const err = new UserError('Không thể xoá user này. EN: Cannot delete this user.');
    expect(toUserMessage(err)).toBe(err.message);
    expect(toUserMessage(err, { showStacktrace: true })).toBe(err.message);
  });

  it('NotFoundError → trả message của nó (user-safe)', () => {
    const err = new NotFoundError('Không tìm thấy thành viên. EN: Member not found.');
    expect(toUserMessage(err)).toBe('Không tìm thấy thành viên. EN: Member not found.');
  });

  it('PermissionError / RateLimitError / InvalidArgumentError đều là UserError → hiển thị message', () => {
    expect(new PermissionError('Bạn không có quyền. EN: No permission.')).toBeInstanceOf(UserError);
    expect(new RateLimitError('Quá nhanh. EN: Too fast.')).toBeInstanceOf(UserError);
    expect(new InvalidArgumentError('Đối số sai. EN: Bad argument.')).toBeInstanceOf(UserError);
  });

  it('generic Error ở prod (showStacktrace=false) → message chung an toàn, không lộ chi tiết', () => {
    const err = new Error('DB connection refused: internal-dsn/secret');
    const msg = toUserMessage(err);
    expect(msg).toBe(GENERIC_ERROR_MESSAGE);
    expect(msg).not.toContain('DB connection refused');
    expect(msg).not.toContain('internal-dsn');
  });

  it('generic Error ở dev (showStacktrace=true) → message chung + chi tiết lỗi để debug', () => {
    const err = new Error('timeout after 5000ms');
    const msg = toUserMessage(err, { showStacktrace: true });
    expect(msg).toContain(GENERIC_ERROR_MESSAGE);
    expect(msg).toContain('timeout after 5000ms');
  });

  it('throw non-Error (string) → không crash; dev hiện giá trị, prod che giấu', () => {
    expect(toUserMessage('raw boom')).toBe(GENERIC_ERROR_MESSAGE);
    expect(toUserMessage('raw boom', { showStacktrace: true })).toContain('raw boom');
  });
});
