/* ═══════════════════════════════════════════════════
   app.js — Main orchestrator, UI helpers
═══════════════════════════════════════════════════ */

/* ══ CONFIG — replace with your Client ID ══ */
const GOOGLE_CLIENT_ID = '1097763862-q0struuoppg5hl2ed7jsmb1or59g8jj9.apps.googleusercontent.com';

/* ══ App state ══ */
const App = {
  todayEvents: [],

  store: {
    tasks: [],
    cfg: {
      reviewTime: '23:30', defReminder: 10, defReminderMethod: 'popup',
      activeCalId: 'primary', activeCalName: '主日历',
    }
  },

  loadState() {
    try { this.store.tasks = JSON.parse(localStorage.getItem('sca_tasks') || '[]'); } catch(e) { this.store.tasks = []; }
    try { Object.assign(this.store.cfg, JSON.parse(localStorage.getItem('sca_cfg') || '{}')); } catch(e) {}
  },

  saveState() {
    localStorage.setItem('sca_tasks', JSON.stringify(this.store.tasks));
    localStorage.setItem('sca_cfg',   JSON.stringify(this.store.cfg));
  },

  async onLogin() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display     = 'block';
    document.getElementById('bottomNav').style.display   = 'flex';

    const account = await Auth.getActiveAccount();
    if (account) {
      const av = document.getElementById('headerAvatar');
      if (account.picture) { av.src = account.picture; av.style.display = 'block'; }
      document.getElementById('headerAuthBtn').textContent = account.name?.split(' ')[0] || '已登录';
    }

    // Load calendars & set active
    try {
      await Cal.loadCalendars();
      const cfg = this.store.cfg;
      if (cfg.activeCalId) Cal.setActiveCalendar(cfg.activeCalId, cfg.activeCalName);
    } catch(e) {}

    UI.loadSettings();
    await Cal.loadTodayEvents();
    AI.initChat();
    UI.renderAccountLists();
    Pomodoro.init();
    // Default to chat page
    UI.goPage('add', document.querySelector('.nav-item'));
  },

  showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display     = 'none';
    document.getElementById('bottomNav').style.display   = 'none';
    document.getElementById('headerAvatar').style.display = 'none';
    document.getElementById('headerAuthBtn').textContent  = '登录';
    UI.renderSavedAccounts();
  },
};

/* ══ UI ══ */
const UI = {
  /* ── Toast ── */
  toast(msg, type = 'info', duration = 3000) {
    const wrap = document.getElementById('toastWrap');
    const el   = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.innerHTML = type === 'loading'
      ? '<span class="spinner"></span>' + esc(msg)
      : esc(msg);
    wrap.appendChild(el);
    if (duration > 0) setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, duration);
    return el;
  },

  /* ── Navigation ── */
  goPage(name, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.getElementById('page-' + name).classList.add('active');
    if (btn) btn.classList.add('active');
    if (name === 'stats')    Stats.render();
    if (name === 'today')    Cal.loadTodayEvents();
    if (name === 'cal')      CalView.render();
    if (name === 'settings') UI.loadSettings();
  },

  /* ── Today events ── */
  renderTodayEvents(events) {
    App.todayEvents = events;
    const el = document.getElementById('todayEventList');
    if (!events.length) {
      el.innerHTML = '<div class="empty"><div class="empty-icon">◌</div>今天日历中暂无事件<br><span style="font-size:12px;margin-top:4px;display:block;color:var(--text3)">在「对话」页用自然语言创建</span></div>';
      return;
    }
    // Group: incomplete first, then complete
    const incomplete = events.filter(e => !e.done);
    const complete   = events.filter(e => e.done);

    let html = '';
    if (incomplete.length) {
      html += '<div class="section-title">进行中 / 待完成</div>';
      html += incomplete.map(e => eventCard(e)).join('');
    }
    if (complete.length) {
      html += '<div class="section-title">已完成</div>';
      html += complete.map(e => eventCard(e)).join('');
    }
    el.innerHTML = html;
  },

  /* ── Modals ── */
  openCalendarPicker() {
    const cals = Cal.getCalendars();
    const list = document.getElementById('calModalList');
    list.innerHTML = cals.map(c =>
      '<div class="cal-option" onclick="Cal.setActiveCalendar(\'' + esc(c.id) + '\',\'' + esc(c.name) + '\');UI.closeModal(\'calModal\');Cal.loadTodayEvents()">'
      + '<div class="cal-dot" style="background:' + c.color + '"></div>'
      + '<span class="cal-option-name">' + esc(c.name) + '</span>'
      + (c.id === Cal.activeCalendarId ? '<span class="cal-option-check">✓</span>' : '')
      + '</div>'
    ).join('') || '<div style="color:var(--text3);padding:8px">暂无日历</div>';
    document.getElementById('calModal').classList.add('open');
  },

  openAccountPanel() {
    this.renderAccountModalList();
    document.getElementById('accountModal').classList.add('open');
  },

  closeModal(id) {
    document.getElementById(id).classList.remove('open');
  },

  async renderAccountModalList() {
    const accounts = await Auth.loadAccounts();
    const active   = await Auth.getActiveAccount();
    const list = document.getElementById('accountModalList');
    list.innerHTML = accounts.map(a =>
      '<div class="account-row">'
      + (a.picture ? '<img src="' + esc(a.picture) + '" alt="">' : '<div class="msg-avatar">人</div>')
      + '<div class="account-row-info">'
      + '<div class="account-row-name">' + esc(a.name || a.email) + '</div>'
      + '<div class="account-row-email">' + esc(a.email) + '</div>'
      + (a.email === active?.email ? '<div class="account-row-active">● 当前账号</div>' : '')
      + '</div>'
      + (a.email !== active?.email ? '<button class="btn btn-sm" onclick="Auth.switchAccount(\'' + esc(a.email) + '\')">切换</button>' : '')
      + '<button class="btn btn-sm btn-danger" onclick="UI.confirmRemoveAccount(\'' + esc(a.email) + '\')">移除</button>'
      + '</div>'
    ).join('') || '<div style="color:var(--text3);padding:8px">暂无已保存账号</div>';
  },

  confirmRemoveAccount(email) {
    if (confirm('确定移除账号 ' + email + '？这将清除该账号的本地凭据。')) {
      Auth.removeAccount(email).then(() => {
        this.renderAccountModalList();
        this.toast('账号已移除', 'success');
      });
    }
  },

  async renderAccountLists() {
    const accounts = await Auth.loadAccounts();
    const active   = await Auth.getActiveAccount();
    const html = accounts.map(a =>
      '<div class="account-row">'
      + (a.picture ? '<img src="' + esc(a.picture) + '" alt="">' : '')
      + '<div class="account-row-info">'
      + '<div class="account-row-name">' + esc(a.name || a.email) + '</div>'
      + '<div class="account-row-email">' + esc(a.email) + '</div>'
      + (a.email === active?.email ? '<div class="account-row-active">● 当前账号</div>' : '')
      + '</div>'
      + '</div>'
    ).join('');
    const el = document.getElementById('accountListSettings');
    if (el) el.innerHTML = html || '<div style="color:var(--text3);font-size:13px">暂无账号</div>';
  },

  async renderSavedAccounts() {
    const accounts = await Auth.loadAccounts();
    const el = document.getElementById('savedAccountsList');
    if (!accounts.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);margin-bottom:8px">已保存的账号（点击快速登录）</div>'
      + accounts.map(a =>
          '<div class="saved-account-item" onclick="Auth.switchAccount(\'' + esc(a.email) + '\')">'
          + (a.picture ? '<img src="' + esc(a.picture) + '" alt="">' : '')
          + '<div><div class="saved-account-name">' + esc(a.name || a.email) + '</div>'
          + '<div class="saved-account-email">' + esc(a.email) + '</div></div>'
          + '</div>'
        ).join('');
  },

  /* ── Settings ── */
  async loadSettings() {
    const cfg = App.store.cfg;
    document.getElementById('reviewTime').value        = cfg.reviewTime  || '23:30';
    document.getElementById('defReminder').value       = cfg.defReminder || 10;
    document.getElementById('defReminderMethod').value = cfg.defReminderMethod || 'popup';
    const key = await AI.loadKey();
    const keyEl = document.getElementById('apiKey');
    if (key && keyEl) keyEl.placeholder = '已保存（输入新值可更新）';
  },

  async saveSettings() {
    const key = document.getElementById('apiKey').value.trim();
    if (key) await AI.setKey(key);
    App.store.cfg.reviewTime        = document.getElementById('reviewTime').value;
    App.store.cfg.defReminder       = Math.min(120, Math.max(0, parseInt(document.getElementById('defReminder').value) || 10));
    App.store.cfg.defReminderMethod = document.getElementById('defReminderMethod').value;
    App.saveState();
    this.toast('设置已保存', 'success');
  },

  toggleKey() {
    const el = document.getElementById('apiKey');
    el.type = el.type === 'password' ? 'text' : 'password';
  },
};

/* ══ Event card renderer ══ */
function eventCard(e) {
  const color   = Cal.TAG_HEX[e.tag] || '#9a9690';
  const fmt24   = dt => {
    if (!dt) return '—';
    const d = new Date(dt);
    return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
  };
  const startStr = fmt24(e.start);
  const endStr   = fmt24(e.end);
  const diff     = e.actualMins != null ? e.actualMins - (e.estMins || 0) : null;

  return '<div class="event-item ' + (e.done ? 'done' : '') + '" data-gcalid="' + esc(e.gcalId) + '">'
    + '<div class="event-color-bar" style="background:' + color + ';cursor:pointer" onclick="openTagEditor(\'' + esc(e.gcalId) + '\')" title="点击修改标签"></div>'
    + '<div class="event-inner">'
    + '<div class="event-header">'
    + '<div style="flex:1;min-width:0">'
    + '<div class="event-name">' + esc(e.name) + '</div>'
    + '<div class="event-meta">' + startStr + ' – ' + endStr + ' · 预估 ' + fmtMins(e.estMins) + '</div>'
    + (e.description ? '<div class="event-desc">' + esc(e.description.slice(0, 80)) + '</div>' : '')
    + (diff != null ? '<div class="event-actual ' + (diff > 0 ? 'over' : '') + '">实际 ' + fmtMins(e.actualMins) + ' · ' + (diff > 0 ? '超出 ' : '节省 ') + fmtMins(Math.abs(diff)) + '</div>' : '')
    + '</div>'
    + '<span class="badge badge-' + esc(e.tag) + '" style="cursor:pointer;display:flex;align-items:center;gap:4px" onclick="openTagEditor(\'' + esc(e.gcalId) + '\')">'
    + '<span style="width:7px;height:7px;border-radius:50%;background:' + color + ';display:inline-block;flex-shrink:0"></span>'
    + esc(e.tag) + '</span>'
    + '</div>'
    + '</div></div>';
}

/* ══ Tag / color editor ══ */
function openTagEditor(gcalId) {
  const event = (App.todayEvents || []).find(e => e.gcalId === gcalId);
  if (!event) return;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.id = 'tagEditorModal';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };

  const tags = Cal.VALID_TAGS;
  const tagOptions = tags.map(tag => {
    const hex     = Cal.TAG_HEX[tag] || '#9a9690';
    const active  = event.tag === tag;
    return '<div onclick="applyTagEdit(\'' + esc(gcalId) + '\',\'' + esc(tag) + '\',this.closest(\'.modal-overlay\'))"'
      + ' style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:0.5px solid var(--border);cursor:pointer;transition:opacity 0.15s"'
      + ' onmouseover="this.style.opacity=\'0.7\'" onmouseout="this.style.opacity=\'1\'">'
      + '<span style="width:14px;height:14px;border-radius:50%;background:' + hex + ';flex-shrink:0;box-shadow:' + (active ? '0 0 0 2px var(--bg),0 0 0 3px ' + hex : 'none') + '"></span>'
      + '<span style="font-size:14px;flex:1">' + esc(tag) + '</span>'
      + (active ? '<span style="color:var(--accent);font-size:13px">✓ 当前</span>' : '')
      + '</div>';
  }).join('');

  modal.innerHTML = '<div class="modal" onclick="event.stopPropagation()">'
    + '<div class="modal-title">修改标签和颜色</div>'
    + '<div style="font-size:12px;color:var(--text3);margin-bottom:10px">选择后自动同步颜色到 Google Calendar</div>'
    + tagOptions
    + '<button class="btn" style="margin-top:12px" onclick="this.closest(\'.modal-overlay\').remove()">取消</button>'
    + '</div>';
  document.body.appendChild(modal);
}

async function applyTagEdit(gcalId, newTag, modalEl) {
  if (modalEl) modalEl.remove();
  const event = (App.todayEvents || []).find(e => e.gcalId === gcalId);
  if (!event || event.tag === newTag) return;
  const t = UI.toast('更新标签和颜色...', 'loading', 0);
  try {
    // Prefix format: "#工作 写周报"
    const newSummary = (newTag && newTag !== '其他')
      ? '#' + newTag + ' ' + event.name
      : event.name;
    const newDesc = (event.description || '')
      .replace(/标签：[^\n]*/g, '').trim() + '\n标签：' + newTag;
    await Cal.updateEvent(gcalId, {
      summary:     newSummary,
      colorId:     Cal.TAG_COLOR[newTag] || '0',
      description: newDesc,
    });
    t.remove();
    UI.toast('✓ 已更新为「' + newTag + '」', 'success');
    await Cal.loadTodayEvents();
  } catch(e) {
    t.remove();
    UI.toast('更新失败：' + e.message, 'error');
  }
}

/* ══ Shared helpers ══ */
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}
function fmtMins(m) { if (!m && m !== 0) return '—'; return m < 60 ? m + '分' : (m/60).toFixed(1) + 'h'; }
function handleKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); AI.sendMessage(); } }
function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }

/* ══ Init ══ */
(async function init() {
  App.loadState();
  Auth.initGoogle(GOOGLE_CLIENT_ID);

  // Set date label
  document.getElementById('todayLabel').textContent =
    new Date().toLocaleDateString('zh-CN', { month:'long', day:'numeric', weekday:'short' });

  // Restore session if available
  const hasSession = await Auth.init();
  if (hasSession) {
    await App.onLogin();
  } else {
    App.showLoginScreen();
  }
})();
