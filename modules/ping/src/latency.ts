// Nguyên nhân "latency load cực lâu khi bot khởi động": client.ws.ping của discord.js vẫn là -1 cho tới
// khi nhận heartbeat ACK đầu tiên (heartbeat interval của Discord thường ~41s) → /ping hiển thị '...ms' rất lâu.
// Giải pháp: khi ws.ping chưa sẵn, đo RTT tới endpoint /gateway của Discord REST (công khai, không cần auth),
// cache kết quả tạm — ws.ping sẽ thay thế ngay khi có heartbeat ACK.
// EN: "Latency loads very slowly at startup": discord.js client.ws.ping stays -1 until the first heartbeat
// ACK (Discord's heartbeat interval is usually ~41s) → /ping shows '...ms' for a long time. Fix: when ws.ping
// is not ready yet, measure the RTT to the public Discord REST /gateway endpoint (no auth needed) and cache
// the estimate — ws.ping takes over as soon as a heartbeat is ACKed.

export const DISCORD_GATEWAY_ENDPOINT = 'https://discord.com/api/v10/gateway';
export const LATENCY_CACHE_TTL_MS = 30_000;

let cachedLatency = -1;
let cachedAtMs = 0;

export type FetchResponseLike = { arrayBuffer(): Promise<ArrayBuffer> };
export type FetchLike = (url: string, init?: { method?: string }) => Promise<FetchResponseLike>;

/** Chỉ dành cho test — reset cache latency / test-only helper. */
export function __resetLatencyCache(): void {
  cachedLatency = -1;
  cachedAtMs = 0;
}

/** Đo latency: ws.ping nếu sẵn; nếu không, RTT tới Discord REST (có cache tạm). Trả -1 nếu không đo được. */
export async function measureLatency(wsPing: number | undefined, fetchFn?: FetchLike): Promise<number> {
  if (typeof wsPing === 'number' && wsPing >= 0) return wsPing;
  if (cachedLatency >= 0 && Date.now() - cachedAtMs < LATENCY_CACHE_TTL_MS) return cachedLatency;
  const impl = fetchFn ?? (globalThis as unknown as { fetch?: FetchLike }).fetch;
  if (!impl) return -1;
  try {
    const startedAt = Date.now();
    const res = await impl(DISCORD_GATEWAY_ENDPOINT, { method: 'GET' });
    await res.arrayBuffer();
    const rtt = Date.now() - startedAt;
    cachedLatency = rtt;
    cachedAtMs = Date.now();
    return rtt;
  } catch {
    return -1;
  }
}