/**
 * Test auth — session + OAuth2 state/URL.
 * EN: Auth tests — sessions and OAuth2 state/URL.
 */
import { describe, it, expect } from 'vitest';
import { AuthStore, buildAuthorizeUrl } from '../src/auth.js';

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
    expect(store.consumeOAuthState(state)).toEqual({ returnTo: '' });
    expect(store.consumeOAuthState(state)).toBeNull();
  });

  it('OAuth2 state kèm returnTo (loopback) → consume trả lại returnTo', () => {
    const store = new AuthStore();
    const state = store.createOAuthState('http://127.0.0.1:3000');
    expect(store.consumeOAuthState(state)).toEqual({ returnTo: 'http://127.0.0.1:3000' });
  });

  it('OAuth2 state sai/rỗng → fail', () => {
    const store = new AuthStore();
    expect(store.consumeOAuthState('nope')).toBeNull();
    expect(store.consumeOAuthState(null)).toBeNull();
    expect(store.consumeOAuthState(undefined)).toBeNull();
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