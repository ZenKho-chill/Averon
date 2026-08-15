/**
 * modules/webui/auth — session + Discord OAuth2 (login duy nhất của hệ thống).
 * EN: modules/webui/auth — sessions and Discord OAuth2 (the only login method).
 *
 * - Admin: Discord OAuth2 + user nằm trong admin_user_ids (config module defaults.yml).
 * - User: Discord OAuth2 (scope identify). Session lưu in-memory (Map) — không cần DB.
 */
import { randomBytes } from 'node:crypto';

export interface SessionInfo {
  id: string;
  kind: 'admin' | 'user';
  userId?: string;
  username?: string;
  avatar?: string | null;
  createdAt: number;
}

export class AuthStore {
  private readonly sessions = new Map<string, SessionInfo>();
  /** OAuth2 `state` chống CSRF — chỉ sống vài phút. */
  private readonly oauthStates = new Map<string, number>();
  private static readonly OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

  createSession(input: Omit<SessionInfo, 'id' | 'createdAt'>): SessionInfo {
    const session: SessionInfo = { ...input, id: randomBytes(32).toString('hex'), createdAt: Date.now() };
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(id: string | null | undefined): SessionInfo | undefined {
    if (!id) return undefined;
    return this.sessions.get(id);
  }

  destroySession(id: string): void {
    this.sessions.delete(id);
  }

  /** Tạo OAuth2 state (CSRF) — ngắn hạn. */
  createOAuthState(): string {
    this.cleanupOAuthStates();
    const state = randomBytes(16).toString('hex');
    this.oauthStates.set(state, Date.now());
    return state;
  }

  /** Tiêu thụ (và xóa) OAuth2 state — trả false nếu không hợp lệ. */
  consumeOAuthState(state: string | null | undefined): boolean {
    if (!state) return false;
    const createdAt = this.oauthStates.get(state);
    this.oauthStates.delete(state);
    return createdAt !== undefined;
  }

  private cleanupOAuthStates(): void {
    const now = Date.now();
    for (const [state, createdAt] of this.oauthStates) {
      if (now - createdAt > AuthStore.OAUTH_STATE_TTL_MS) this.oauthStates.delete(state);
    }
  }
}

/** Dựng URL Discord authorize — redirect user đến Discord để đăng nhập. */
export function buildAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify',
    state,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/** Trao đổi code → access_token qua Discord OAuth2 (dùng fetch có sẵn Node 18+). */
export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
): Promise<{ accessToken: string }> {
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    throw new Error(`Discord OAuth2 token exchange failed (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Discord OAuth2 response missing access_token');
  return { accessToken: data.access_token };
}

/** Lấy user Discord từ access_token (scope identify). */
export async function fetchDiscordUser(accessToken: string): Promise<{ id: string; username: string; avatar: string | null }> {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch Discord user (HTTP ${res.status})`);
  return (await res.json()) as { id: string; username: string; avatar: string | null };
}