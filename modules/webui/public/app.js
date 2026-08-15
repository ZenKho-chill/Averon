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
    const s = await api('/api/status');
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
  loadConfigTargets();
}

function selectTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  ['status', 'modules', 'config', 'logs'].forEach((p) => $(`#panel-${p}`).classList.toggle('hidden', p !== name));
  if (name === 'modules') refreshModules();
  if (name === 'config') loadConfigTargets();
  if (name === 'logs') loadLogs();
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
      }
    } catch { /* bỏ qua */ }
  };
  ws.onclose = () => { adminWs = null; };
  ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
  adminWs = ws;
}

async function refreshAdminStatus() {
  try {
    const s = await api('/api/admin/status');
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
    const { modules } = await api('/api/admin/modules');
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
    const res = await api(`/api/admin/modules/${encodeURIComponent(name)}/${action}`, { method: 'POST' });
    alert(res.message || `${action} ${name}`);
    refreshModules();
    refreshAdminStatus();
  } catch (err) {
    alert(err.message);
  }
}

// ── Config management ──
let configsCache = null;

async function loadConfigTargets() {
  try {
    const res = await api('/api/admin/config');
    configsCache = res;
    const sel = $('#config-target');
    sel.innerHTML = '';
    const add = (label, value) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      sel.appendChild(opt);
    };
    add(res.core.path, 'core');
    for (const m of res.modules) add(m.path, m.path);
    sel.value = 'core';
    renderConfigFor('core');
  } catch { /* noop */ }
}

function renderConfigFor(value) {
  if (!configsCache) return;
  if (value === 'core') {
    $('#config-content').value = configsCache.core.content;
  } else {
    const mod = configsCache.modules.find((m) => m.path === value);
    $('#config-content').value = mod ? mod.content : '';
  }
}

async function saveConfig() {
  const sel = $('#config-target');
  const value = sel.value;
  const body = value === 'core'
    ? { scope: 'core', content: $('#config-content').value }
    : { scope: 'module', name: value.split('/')[2], content: $('#config-content').value };
  const resultEl = $('#config-result');
  hide(resultEl);
  try {
    const res = await api('/api/admin/config', { method: 'POST', body: JSON.stringify(body) });
    resultEl.textContent = res.message;
    resultEl.classList.toggle('error', !res.ok);
    show(resultEl);
    await loadConfigTargets();
  } catch (err) {
    resultEl.textContent = err.message;
    resultEl.classList.add('error');
    show(resultEl);
  }
}

// ── Logs ──
async function loadLogs() {
  try {
    const { logs } = await api('/api/admin/logs?limit=200');
    const view = $('#logs-view');
    view.textContent = logs.length ? logs.map((l) => l.line).join('\n') : '(không có log)';
  } catch { /* noop */ }
}

// ── User dashboard ──
async function enterUser() {
  showView('user');
  try {
    const me = await api('/api/me');
    current = me.session;
    updateNav();
    $('#user-name').textContent = me.session.username || 'Người dùng';
    $('#user-id').textContent = me.session.userId ? `ID: ${me.session.userId}` : '';
    $('#user-avatar').textContent = (me.session.username || '?').slice(0, 1).toUpperCase();
    const { guilds } = await api('/api/user/guilds');
    const ul = $('#user-guilds');
    ul.innerHTML = '';
    if (!guilds.length) {
      ul.innerHTML = '<li class="muted">Chưa có guild chung nào với bot.</li>';
    } else {
      for (const g of guilds) {
        const li = document.createElement('li');
        li.textContent = `${g.name} (${g.memberCount} thành viên)`;
        ul.appendChild(li);
      }
    }
  } catch (err) {
    setText('#user-id', err.message);
  }
}

// ── Boot ──
async function boot() {
  $('#btn-logout').addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST' }); } catch { /* noop */ }
    stopAdminTimers();
    clearSession();
    showView('home');
    loadHome();
  });
  $('#btn-discord-login').addEventListener('click', () => { location.href = '/oauth2/login'; });

  $$('.tab').forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));
  $('#config-target').addEventListener('change', (e) => renderConfigFor(e.target.value));
  $('#config-reload').addEventListener('click', loadConfigTargets);
  $('#config-save').addEventListener('click', saveConfig);
  $('#logs-refresh').addEventListener('click', loadLogs);
  $('#modules-body').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (btn) moduleAction(btn.dataset.name, btn.dataset.act);
  });

  // Xử lý callback OAuth2: /#session=<token>
  const hash = location.hash;
  if (hash.startsWith('#session=')) {
    const token = hash.slice('#session='.length);
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
    const me = await api('/api/me');
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