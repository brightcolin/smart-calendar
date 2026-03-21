/* ═══════════════════════════════════════════════════
   app.js — Main orchestrator, UI helpers, Batch ops
═══════════════════════════════════════════════════ */

/* ══ CONFIG — replace with your Client ID ══ */
const GOOGLE_CLIENT_ID = '1097763862-q0struuoppg5hl2ed7jsmb1or59g8jj9.apps.googleusercontent.com';

/* ══ App state ══ */
const App = {
  todayEvents: [],   // events loaded from Google Calendar today
  batchMode:   false,
  selectedIds: new Set(),

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
      el.innerHTML = '<div class="empty"><div class="empty-icon">◌</div>今天日历中暂无事件<br><span style="font-size:12px;margin-top:4px;display:block;color:var(--text3)">点击下方「+」用自然语言创建</span></div>';
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

  /* ── Batch mode ── */
  toggleBatchMode() {
    App.batchMode = !App.batchMode;
    App.selectedIds.clear();
    document.getElementById('batchBar').style.display  = App.batchMode ? 'flex' : 'none';
    document.getElementById('batchToggleBtn').textContent = App.batchMode ? '退出批量' : '批量';
    document.getElementById('batchToggleBtn').style.color = App.batchMode ? 'var(--accent)' : '';
    Cal.loadTodayEvents();
  },

  toggleEventSelect(gcalId) {
    if (App.selectedIds.has(gcalId)) App.selectedIds.delete(gcalId);
    else App.selectedIds.add(gcalId);
    document.getElementById('batchCount').textContent = '已选 ' + App.selectedIds.size + ' 项';
    // Update checkbox UI
    const cb = document.getElementById('cb-' + gcalId);
    if (cb) cb.classList.toggle('checked', App.selectedIds.has(gcalId));
    const card = document.querySelector('[data-gcalid="' + gcalId + '"]');
    if (card) card.classList.toggle('selected', App.selectedIds.has(gcalId));
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

/* ══ Batch operations ══ */
const Batch = {
  getSelectedEvents() {
    return (App.todayEvents || []).filter(e => App.selectedIds.has(e.gcalId));
  },

  async completeSelected() {
    const events = this.getSelectedEvents().filter(e => !e.done);
    if (!events.length) { UI.toast('请先选择未完成的任务', 'info'); return; }
    const t = UI.toast('批量标记完成...', 'loading', 0);
    let ok = 0;
    for (const e of events) {
      try {
        const actualMins = Math.round((new Date() - new Date(e.start)) / 60000);
        await Cal.markComplete(e, Math.max(0, actualMins));
        ok++;
      } catch(err) {}
    }
    t.remove();
    UI.toast('已完成 ' + ok + ' 个任务', 'success');
    App.selectedIds.clear();
    document.getElementById('batchCount').textContent = '已选 0 项';
    await Cal.loadTodayEvents();
  },

  rescheduleSelected() {
    if (!App.selectedIds.size) { UI.toast('请先选择任务', 'info'); return; }
    // Pre-fill with first event's time
    const first = this.getSelectedEvents()[0];
    if (first?.start) {
      const d = new Date(first.start);
      document.getElementById('rescheduleStart').value = d.toISOString().slice(0, 16);
      const d2 = new Date(first.end);
      document.getElementById('rescheduleEnd').value = d2.toISOString().slice(0, 16);
    }
    document.getElementById('rescheduleModal').classList.add('open');
  },

  async applyReschedule() {
    const start = document.getElementById('rescheduleStart').value;
    const end   = document.getElementById('rescheduleEnd').value;
    if (!start || !end) { UI.toast('请填写开始和结束时间', 'error'); return; }
    const events = this.getSelectedEvents();
    const t = UI.toast('批量修改时间...', 'loading', 0);
    let ok = 0;
    for (const e of events) {
      try {
        await Cal.updateEvent(e.gcalId, {
          start: new Date(start).toISOString(),
          end:   new Date(end).toISOString(),
        });
        ok++;
      } catch(err) {}
    }
    t.remove();
    UI.toast('已修改 ' + ok + ' 个任务的时间', 'success');
    UI.closeModal('rescheduleModal');
    App.selectedIds.clear();
    document.getElementById('batchCount').textContent = '已选 0 项';
    await Cal.loadTodayEvents();
  },

  async deleteSelected() {
    const events = this.getSelectedEvents();
    if (!events.length) { UI.toast('请先选择任务', 'info'); return; }
    if (!confirm('确定删除选中的 ' + events.length + ' 个任务？此操作不可撤销。')) return;
    const t = UI.toast('批量删除...', 'loading', 0);
    let ok = 0;
    for (const e of events) {
      try { await Cal.deleteEvent(e.gcalId); ok++; } catch(err) {}
    }
    // Clean local store
    const ids = new Set(events.map(e => e.gcalId));
    App.store.tasks = App.store.tasks.filter(t => !ids.has(t.gcalId));
    App.saveState();
    t.remove();
    UI.toast('已删除 ' + ok + ' 个任务', 'success');
    App.selectedIds.clear();
    await Cal.loadTodayEvents();
  },
};

/* ══ Individual event actions ══ */
async function completeEvent(gcalId) {
  const e = (App.todayEvents || []).find(ev => ev.gcalId === gcalId);
  if (!e) return;
  const actualMins = Math.round(Math.max(0, (new Date() - new Date(e.start)) / 60000));
  const t = UI.toast('标记完成...', 'loading', 0);
  try {
    await Cal.markComplete(e, actualMins);
    const local = App.store.tasks.find(t => t.gcalId === gcalId);
    if (local) { local.done = true; local.actualMins = actualMins; App.saveState(); }
    t.remove();
    const diff = actualMins - (e.estMins || 0);
    UI.toast('完成！实际 ' + fmtMins(actualMins) + ' / 预估 ' + fmtMins(e.estMins) + (diff > 0 ? ' · 超出 ' : ' · 节省 ') + fmtMins(Math.abs(diff)), 'success');
    await Cal.loadTodayEvents();
  } catch(err) {
    t.remove();
    UI.toast('操作失败：' + err.message, 'error');
  }
}

async function deleteEvent(gcalId) {
  if (!confirm('确定删除这个任务？')) return;
  const t = UI.toast('删除中...', 'loading', 0);
  try {
    await Cal.deleteEvent(gcalId);
    App.store.tasks = App.store.tasks.filter(x => x.gcalId !== gcalId);
    App.saveState();
    t.remove();
    UI.toast('已删除', 'success');
    await Cal.loadTodayEvents();
  } catch(e) {
    t.remove();
    UI.toast('删除失败：' + e.message, 'error');
  }
}

/* ══ Event card renderer ══ */
function eventCard(e) {
  const color      = Cal.TAG_HEX[e.tag] || '#9a9690';
  const isSelected = App.selectedIds.has(e.gcalId);
  // 24-hour format: HH:MM
  const fmt24 = dt => {
    if (!dt) return '—';
    const d = new Date(dt);
    return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
  };
  const startStr = fmt24(e.start);
  const endStr   = fmt24(e.end);
  const diff     = e.actualMins != null ? e.actualMins - (e.estMins || 0) : null;

  return '<div class="event-item ' + (e.done ? 'done' : '') + (isSelected ? ' selected' : '') + '" data-gcalid="' + esc(e.gcalId) + '">'
    // Left color bar (clickable to edit tag/color)
    + '<div class="event-color-bar" style="background:' + color + ';cursor:pointer" onclick="openTagEditor(\'' + esc(e.gcalId) + '\')" title="点击修改标签和颜色"></div>'
    + '<div class="event-inner">'
    + '<div class="event-header">'
    + (App.batchMode
        ? '<div class="event-checkbox ' + (isSelected ? 'checked' : '') + '" id="cb-' + esc(e.gcalId) + '" onclick="UI.toggleEventSelect(\'' + esc(e.gcalId) + '\')"></div>'
        : '')
    + '<div style="flex:1;min-width:0">'
    + '<div class="event-name">' + esc(e.name) + '</div>'
    + '<div class="event-meta">' + startStr + ' – ' + endStr + ' · 预估 ' + fmtMins(e.estMins) + '</div>'
    + (e.description ? '<div class="event-desc">' + esc(e.description.slice(0, 80)) + (e.description.length > 80 ? '…' : '') + '</div>' : '')
    + (diff != null ? '<div class="event-actual ' + (diff > 0 ? 'over' : '') + '">实际 ' + fmtMins(e.actualMins) + ' · ' + (diff > 0 ? '超出 ' : '节省 ') + fmtMins(Math.abs(diff)) + '</div>' : '')
    + '</div>'
    // Tag badge with color dot — clickable to edit
    + '<span class="badge badge-' + esc(e.tag) + '" style="cursor:pointer;display:flex;align-items:center;gap:4px" onclick="openTagEditor(\'' + esc(e.gcalId) + '\')">'
    + '<span style="width:7px;height:7px;border-radius:50%;background:' + color + ';display:inline-block;flex-shrink:0"></span>'
    + esc(e.tag)
    + '</span>'
    + '</div>'
    + (!e.done && !App.batchMode
        ? '<div class="event-actions">'
          + '<button class="btn btn-sm btn-success" onclick="completeEvent(\'' + esc(e.gcalId) + '\')">✓ 完成</button>'
          + '<button class="btn btn-sm btn-danger" onclick="deleteEvent(\'' + esc(e.gcalId) + '\')">删除</button>'
          + '</div>'
        : '')
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
