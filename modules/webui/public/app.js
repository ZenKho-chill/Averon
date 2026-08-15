/* Averon Web UI — vanilla JS SPA (không cần build tool §5.3 plan). */
'use strict';

const SESSION_KEY = 'averon.session';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function show(el) {
  el.classList.remove('hidden');
}
function hide(el) {
  el.classList.add('hidden');
}
function setText(sel, text) {
  const el = $(sel);
  if (el) el.textContent = text ?? '';
}
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const session = localStorage.getItem(SESSION_KEY);
  if (session) headers.Authorization = `Bearer ${session}`;
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return data;
}

function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '…';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Auth state ──
let current = null; // { kind, userId?, username?, avatar? }

function saveSession(id) {
  localStorage.setItem(SESSION_KEY, id);
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  current = null;
}

// ── View switching ──
function showView(name) {
  ['home', 'admin', 'user'].forEach((v) => {
    const el = $(`#view-${v}`);
    if (el) el.classList.toggle('hidden', v !== name);
  });
  // Nav links (Về Averon / Tính năng / Cách bắt đầu) chỉ hiển thị trên trang chủ.
  $$('.nav-link').forEach((l) => l.classList.toggle('hidden', name !== 'home'));
  updateNav();
}

function updateNav() {
  const hasSession = !!localStorage.getItem(SESSION_KEY);
  $('#btn-discord-login').classList.toggle('hidden', hasSession);
  $('#btn-logout').classList.toggle('hidden', !hasSession);
  $('#nav-session').textContent = current
    ? `${current.username || (current.kind === 'admin' ? 'admin' : 'user')} (${current.kind})`
    : '';
}

// ── Homepage (public info + invite CTA) ──
async function loadHome() {
  try {
    const s = await api('/api/v1/status');
    $('#home-version').textContent = `${s.name ?? 'Averon'} · v${s.version}`;
    const invite = typeof s.inviteUrl === 'string' && s.inviteUrl ? s.inviteUrl : '';
    $('#btn-invite').href = invite;
    $('#btn-invite-2').href = invite;
  } catch {
    $('#home-version').textContent = 'Không kết nối được máy chủ';
  }
}

// ── Admin dashboard ──
let adminTimer = null;
let adminWs = null;

function enterAdmin() {
  current = { kind: 'admin' };
  showView('admin');
  selectTab('status');
  refreshAdminStatus();
  connectWs();
  startAdminTimers();
}

function selectTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  ['status', 'modules', 'logs', 'usage'].forEach((p) => $(`#panel-${p}`).classList.toggle('hidden', p !== name));
  if (name === 'modules') refreshModules();
  if (name === 'logs') loadLogs();
  if (name === 'usage') loadUsage();
}

function startAdminTimers() {
  stopAdminTimers();
  adminTimer = setInterval(() => {
    refreshAdminStatus();
    refreshModules();
  }, 4000);
}
function stopAdminTimers() {
  if (adminTimer) clearInterval(adminTimer);
  adminTimer = null;
  if (adminWs) {
    adminWs.close();
    adminWs = null;
  }
}

function connectWs() {
  if (adminWs) return;
  const session = localStorage.getItem(SESSION_KEY);
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(session)}`);
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'snapshot') {
        renderAdminStatus(msg.status);
        renderModules(msg.modules);
        if (msg.logs && msg.logs.length) appendLogs(msg.logs);
      }
    } catch { /* bỏ qua */ }
  };
  ws.onclose = () => { adminWs = null; };
  ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
  adminWs = ws;
}

async function refreshAdminStatus() {
  try {
    const s = await api('/api/v1/admin/status');
    renderAdminStatus(s);
  } catch { /* chờ WS hoặc lần sau */ }
}

function renderAdminStatus(s) {
  $('#a-online').textContent = s.online ? 'Online' : 'Offline';
  $('#a-ping').textContent = s.discord?.ping ?? '—';
  $('#a-guilds').textContent = s.discord?.guilds ?? '—';
  $('#a-modules').textContent = `${s.modules?.running ?? 0}/${s.modules?.registered ?? 0}`;
  $('#a-ws').textContent = `ws=${s.discord?.ws} · discord uptime ${fmtDuration(s.discord?.uptime)} · bot uptime ${fmtDuration(s.uptime)}`;
}

async function refreshModules() {
  try {
    const { modules } = await api('/api/v1/admin/modules');
    renderModules(modules);
  } catch { /* noop */ }
}

function renderModules(modules) {
  const body = $('#modules-body');
  body.innerHTML = '';
  if (!modules || modules.length === 0) {
    body.innerHTML = '<tr><td colspan="7" class="muted">Không có module.</td></tr>';
    return;
  }
  for (const m of modules) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td><strong>${esc(m.name)}</strong></td>` +
      `<td>${esc(m.version)}</td>` +
      `<td><span class="badge badge-${m.quarantined ? 'fault' : m.state === 'RUNNING' ? 'ok' : 'warn'}">${esc(m.state)}${m.quarantined ? ' (q)' : ''}</span></td>` +
      `<td>${m.activeCount}</td><td>${m.commands}</td><td>${m.events}</td>` +
      `<td class="row">` +
      `<button class="btn btn-xs" data-act="reload" data-name="${esc(m.name)}">Reload</button> ` +
      `<button class="btn btn-xs" data-act="unload" data-name="${esc(m.name)}">Unload</button>` +
      `</td>`;
    body.appendChild(tr);
  }
}

async function moduleAction(name, action) {
  try {
    const res = await api(`/api/v1/admin/modules/${encodeURIComponent(name)}/${action}`, { method: 'POST' });
    alert(res.message || `${action} ${name}`);
    refreshModules();
    refreshAdminStatus();
  } catch (err) {
    alert(err.message);
  }
}

// ── Logs ──
async function loadLogs() {
  try {
    const { logs } = await api('/api/v1/admin/logs?limit=200');
    const view = $('#logs-view');
    view.textContent = logs.length ? logs.map((l) => l.line).join('\n') : '(không có log)';
  } catch { /* noop */ }
}

/** Append dòng log mới (realtime qua WS) — chỉ khi đang xem tab Logs. */
function appendLogs(lines) {
  const panel = $('#panel-logs');
  if (panel.classList.contains('hidden')) return;
  const view = $('#logs-view');
  for (const l of lines) {
    const isMarker = l.line.startsWith('===');
    view.textContent += (view.textContent ? '\n' : '') + l.line;
    if (isMarker && view.textContent.split('\n').length > 400) {
      view.textContent = view.textContent.split('\n').slice(-300).join('\n');
    }
  }
  view.scrollTop = view.scrollHeight;
}

// ── Usage stats ──
async function loadUsage() {
  try {
    const s = await api('/api/v1/admin/usage');
    $('#usage-summary').innerHTML =
      `<div class="stat"><span class="stat-value">${s.total}</span><span class="stat-label">Tổng lệnh đã dùng</span></div>` +
      `<div class="stat"><span class="stat-value">${s.perModule.length}</span><span class="stat-label">Module có hoạt động</span></div>` +
      `<div class="stat"><span class="stat-value">${s.perGuild.length}</span><span class="stat-label">Guild</span></div>`;
    renderUsageRows('#usage-modules', s.perModule);
    renderUsageRows('#usage-commands', s.perCommand);
    renderUsageRows('#usage-guilds', s.perGuild);
  } catch { /* noop */ }
}

function renderUsageRows(sel, rows) {
  const body = $(sel);
  body.innerHTML = '';
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="2" class="muted">Chưa có dữ liệu.</td></tr>';
    return;
  }
  for (const r of rows.slice(0, 50)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><span class="mono">${esc(r.name)}</span></td><td>${r.count}</td>`;
    body.appendChild(tr);
  }
}

// ── User dashboard ──
let userInviteUrl = '';

async function enterUser() {
  showView('user');
  try {
    const me = await api('/api/v1/me');
    current = me.session;
    updateNav();
    $('#user-name').textContent = me.session.username || 'Người dùng';
    $('#user-id').textContent = me.session.userId ? `ID: ${me.session.userId}` : '';
    $('#user-avatar').textContent = (me.session.username || '?').slice(0, 1).toUpperCase();
    const status = await api('/api/v1/status');
    userInviteUrl = typeof status.inviteUrl === 'string' && status.inviteUrl ? status.inviteUrl : '';
    const { guilds } = await api('/api/v1/user/guilds');
    const wrap = $('#user-guilds');
    wrap.innerHTML = '';
    if (!guilds.length) {
      wrap.innerHTML = '<p class="muted">Chưa có guild chung nào với bot.</p>';
      return;
    }
    for (const g of guilds) {
      const card = document.createElement('div');
      card.className = 'guild-card';
      card.innerHTML =
        `<div class="guild-icon">${g.iconUrl ? `<img src="${esc(g.iconUrl)}" alt="" loading="lazy">` : esc((g.name || '?').slice(0, 1).toUpperCase())}</div>` +
        `<div class="guild-info">` +
        `<div class="strong">${esc(g.name)}</div>` +
        `<div class="muted small">${g.memberCount} thành viên</div>` +
        `</div>` +
        `<div class="guild-actions">` +
        (g.userCanManage ? '<span class="badge badge-ok">Bạn quản lý guild này</span>' : '') +
        (userInviteUrl ? `<a class="btn btn-xs btn-outline" target="_blank" rel="noopener" href="${esc(userInviteUrl)}&guild_id=${encodeURIComponent(g.id)}&disable_guild_select=true">Invite bot</a>` : '') +
        `</div>`;
      wrap.appendChild(card);
    }
  } catch (err) {
    setText('#user-id', err.message);
  }
}

// ── Boot ──
// Mở login Discord OAuth2 trong popup thay vì redirect cả trang.
// EN: Run Discord OAuth2 in a popup instead of redirecting the whole page.
function openLoginPopup() {
  window.open('/oauth2/login', 'averon-login', 'width=520,height=640');
}

async function boot() {
  // Nhận session từ popup login: popup (cùng origin) ghi localStorage → cửa sổ chính
  // nhận `storage` event → reload vào dashboard. Đáng tin cậy hơn postMessage (không mất
  // khi popup đóng nhanh).
  // EN: Handoff from the login popup: the popup (same origin) writes localStorage → this
  // window gets a `storage` event → reloads into the dashboard. More reliable than postMessage.
  window.addEventListener('storage', (e) => {
    if (e.key === SESSION_KEY && e.newValue) location.reload();
  });

  $('#btn-logout').addEventListener('click', async () => {
    try { await api('/api/v1/logout', { method: 'POST' }); } catch { /* noop */ }
    stopAdminTimers();
    clearSession();
    showView('home');
    loadHome();
  });
  $('#btn-discord-login').addEventListener('click', openLoginPopup);
  $('#home-admin').addEventListener('click', (e) => { e.preventDefault(); openLoginPopup(); });
  $('#home-admin-2').addEventListener('click', (e) => { e.preventDefault(); openLoginPopup(); });

  $$('.tab').forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));
  $('#logs-refresh').addEventListener('click', loadLogs);
  $('#modules-body').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (btn) moduleAction(btn.dataset.name, btn.dataset.act);
  });

  // Xử lý callback OAuth2: /#session=<token>
  // - Trong popup (window.opener tồn tại): lưu session vào localStorage (cùng origin → cửa sổ
  //   chính nhận `storage` event và reload) rồi đóng popup.
  //   EN: In the popup (window.opener exists): save the session to localStorage (same origin →
  //   the opener gets a `storage` event and reloads), then close the popup.
  // - Mở trực tiếp trên tab: lưu session và tiếp tục như bình thường.
  const hash = location.hash;
  if (hash.startsWith('#session=')) {
    const token = hash.slice('#session='.length);
    if (window.opener) {
      saveSession(token);
      window.close();
      return;
    }
    saveSession(token);
    history.replaceState(null, '', location.pathname);
  }

  loadHome();

  const session = localStorage.getItem(SESSION_KEY);
  if (!session) {
    showView('home');
    return;
  }
  try {
    const me = await api('/api/v1/me');
    current = me.session;
    if (current.kind === 'admin') {
      enterAdmin();
    } else {
      await enterUser();
    }
  } catch {
    clearSession();
    showView('home');
  }
}

document.addEventListener('DOMContentLoaded', boot);