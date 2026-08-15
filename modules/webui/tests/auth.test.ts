/**
 * Test auth — timing-safe so sánh, session, OAuth2 state/URL.
 * EN: Auth tests — timing-safe comparison, sessions, OAuth2 state/URL.
 */
import { describe, it, expect } from 'vitest';
import { AuthStore, buildAuthorizeUrl, safeEqual } from '../src/auth.js';

describe('safeEqual', () => {
  it('so sánh timing-safe: khớp → true, lệch → false, rỗng vs khác → false', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', '')).toBe(false);
    expect(safeEqual('', 'x')).toBe(false);
    // Hai chuỗi rỗng bằng nhau → true (đúng ngữ nghĩa); runtime không bao giờ gọi với rỗng.
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('AuthStore', () => {
  it('tạo + lấy + xóa session', () => {
    const store = new AuthStore();
    const s = store.createSession({ kind: 'admin' });
    expect(s.id.length).toBeGreaterThan(10);
    expect(store.getSession(s.id)?.kind).toBe('admin');
    store.destroySession(s.id);
    expect(store.getSession(s.id)).toBeUndefined();
  });

  it('getSession với null/undefined/rác → undefined', () => {
    const store = new AuthStore();
    expect(store.getSession(null)).toBeUndefined();
    expect(store.getSession(undefined)).toBeUndefined();
    expect(store.getSession('no-such')).toBeUndefined();
  });

  it('OAuth2 state: tạo → consume hợp lệ 1 lần, lần 2 fail', () => {
    const store = new AuthStore();
    const state = store.createOAuthState();
    expect(store.consumeOAuthState(state)).toBe(true);
    expect(store.consumeOAuthState(state)).toBe(false);
  });

  it('OAuth2 state sai/rỗng → fail', () => {
    const store = new AuthStore();
    expect(store.consumeOAuthState('nope')).toBe(false);
    expect(store.consumeOAuthState(null)).toBe(false);
    expect(store.consumeOAuthState(undefined)).toBe(false);
  });
});

describe('buildAuthorizeUrl', () => {
  it('dựng URL Discord authorize đúng scope+state', () => {
    const url = buildAuthorizeUrl('cid', 'http://localhost:3000/cb', 'state-1');
    expect(url.startsWith('https://discord.com/oauth2/authorize?')).toBe(true);
    expect(url).toContain('client_id=cid');
    expect(url).toContain('redirect_uri=' + encodeURIComponent('http://localhost:3000/cb'));
    expect(url).toContain('response_type=code');
    expect(url).toContain('scope=identify');
    expect(url).toContain('state=state-1');
  });
});