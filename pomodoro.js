/* ═══════════════════════════════════════════════════
   pomodoro.js — Pomodoro timer
   - Customisable focus / short-break / long-break durations
   - Links to today's tasks; logs actual focus time on finish
   - Ring countdown + session dots
   - Web Notifications + in-page audio beep when phase ends
═══════════════════════════════════════════════════ */

const Pomodoro = (() => {

  /* ══ State ══ */
  const cfg = {
    focus: 25,   // minutes
    brk:   5,
    long:  15,
    sessionsBeforeLong: 4,
  };

  let phase      = 'idle';   // 'idle' | 'focus' | 'break' | 'long'
  let remaining  = 0;        // seconds
  let total      = 0;        // total seconds for current phase
  let timer      = null;
  let session    = 0;        // completed focus sessions this run
  let focusMins  = 0;        // accumulated focus minutes for linked task
  let linkedGcalId = null;
  const CIRC     = 2 * Math.PI * 52;  // svg circle circumference

  /* ══ Open / Close ══ */
  function open() {
    populateTaskSelect();
    renderDots();
    updateDisplay();
    document.getElementById('pomodoroModal').classList.add('open');
    requestNotificationPermission();
  }

  function close() {
    document.getElementById('pomodoroModal').classList.remove('open');
  }

  /* ══ Task selector ══ */
  function populateTaskSelect() {
    const sel    = document.getElementById('pomoTaskSelect');
    const events = (App.todayEvents || []).filter(e => !e.done);
    const prev   = sel.value;
    sel.innerHTML = '<option value="">不关联任务（自由专注）</option>'
      + events.map(e =>
          '<option value="' + esc(e.gcalId) + '">' + esc(e.name) + ' ' + fmtTime(e.start) + '</option>'
        ).join('');
    if (prev) sel.value = prev;
    linkedGcalId = sel.value || null;
    sel.onchange = () => { linkedGcalId = sel.value || null; };
  }

  /* ══ Start / Pause ══ */
  function toggle() {
    if (phase === 'idle') {
      startFocus();
    } else if (timer) {
      pause();
    } else {
      resume();
    }
  }

  function startFocus() {
    phase     = 'focus';
    remaining = cfg.focus * 60;
    total     = remaining;
    focusMins = 0;
    tick();
    document.getElementById('pomoStartBtn').textContent = '暂停';
    document.getElementById('pomoStartBtn').classList.add('running');
    document.getElementById('pomoPhase').textContent   = '专注中';
    document.getElementById('pomoTitle').textContent   = '专注';
    log('开始第 ' + (session + 1) + ' 个番茄', 'focus');
  }

  function startBreak(isLong) {
    phase     = isLong ? 'long' : 'break';
    remaining = (isLong ? cfg.long : cfg.brk) * 60;
    total     = remaining;
    tick();
    const label = isLong ? '长休息' : '短休息';
    document.getElementById('pomoStartBtn').textContent = '暂停';
    document.getElementById('pomoStartBtn').classList.add('running');
    document.getElementById('pomoPhase').textContent   = label + '中';
    document.getElementById('pomoTitle').textContent   = label;
    log(label + '开始（' + (isLong ? cfg.long : cfg.brk) + '分钟）', 'brk');
  }

  function pause() {
    clearInterval(timer); timer = null;
    document.getElementById('pomoStartBtn').textContent = '继续';
    document.getElementById('pomoStartBtn').classList.remove('running');
    document.getElementById('pomoPhase').textContent = '已暂停';
  }

  function resume() {
    tick();
    document.getElementById('pomoStartBtn').textContent = '暂停';
    document.getElementById('pomoStartBtn').classList.add('running');
    document.getElementById('pomoPhase').textContent = phase === 'focus' ? '专注中' : '休息中';
  }

  function skip() {
    clearInterval(timer); timer = null;
    onPhaseEnd(true);
  }

  function reset() {
    clearInterval(timer); timer = null;
    phase = 'idle'; session = 0; remaining = 0; total = cfg.focus * 60;
    focusMins = 0;
    document.getElementById('pomoStartBtn').textContent = '开始';
    document.getElementById('pomoStartBtn').classList.remove('running');
    document.getElementById('pomoPhase').textContent = '准备开始';
    document.getElementById('pomoTitle').textContent  = '专注';
    document.getElementById('pomoTime').textContent   = fmt(cfg.focus * 60);
    document.getElementById('pomoRingFg').style.strokeDashoffset = '0';
    document.getElementById('pomoRingFg').className = 'pomo-ring-fg';
    renderDots();
    document.getElementById('pomoLog').innerHTML = '';
  }

  /* ══ Tick ══ */
  function tick() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      remaining--;
      if (phase === 'focus') focusMins = ((total - remaining) / 60);
      updateDisplay();
      if (remaining <= 0) {
        clearInterval(timer); timer = null;
        onPhaseEnd(false);
      }
    }, 1000);
  }

  /* ══ Phase end ══ */
  async function onPhaseEnd(skipped) {
    beep();
    if (phase === 'focus') {
      session++;
      renderDots();
      notify('🍅 专注完成！', '第 ' + session + ' 个番茄钟结束，休息一下吧。');
      log('第 ' + session + ' 个番茄完成 (' + Math.round(focusMins) + '分钟)', 'focus');

      // Log focus time to linked task
      if (linkedGcalId && focusMins > 0 && !skipped) {
        await logFocusToTask(Math.round(focusMins));
      }

      const isLong = session % cfg.sessionsBeforeLong === 0;
      startBreak(isLong);
    } else {
      // Break ended → start next focus
      notify('▶ 休息结束', '准备好开始下一个番茄钟了！');
      log('休息结束，准备下一轮', 'brk');
      phase = 'idle';
      startFocus();
    }
  }

  /* ══ Log focus time to linked task ══ */
  async function logFocusToTask(mins) {
    const events  = App.todayEvents || [];
    const event   = events.find(e => e.gcalId === linkedGcalId);
    if (!event) return;
    try {
      // Append to description
      const newDesc = (event.description || '').trim()
        + '\n番茄钟专注：' + mins + '分钟（' + new Date().toTimeString().slice(0,5) + '）';
      await Cal.updateEvent(linkedGcalId, { description: newDesc });
      log('已记录 ' + mins + ' 分钟到「' + event.name + '」', 'focus');
    } catch(e) { /* silent */ }
  }

  /* ══ Display ══ */
  function updateDisplay() {
    document.getElementById('pomoTime').textContent = fmt(remaining || cfg.focus * 60);
    const ring = document.getElementById('pomoRingFg');
    if (total > 0) {
      const pct    = remaining / total;
      const offset = CIRC * (1 - pct);
      ring.style.strokeDashoffset = offset;
    }
    ring.className = 'pomo-ring-fg'
      + (phase === 'break' ? ' break-mode' : '')
      + (phase === 'long'  ? ' long-mode'  : '');
  }

  function renderDots() {
    const n    = cfg.sessionsBeforeLong;
    const dots = document.getElementById('pomoDots');
    if (!dots) return;
    dots.innerHTML = Array.from({ length: n }, (_, i) => {
      const done   = i < session % n || (session > 0 && session % n === 0 && i < n);
      const active = i === session % n && phase === 'focus';
      return '<div class="pomo-dot' + (done ? ' done' : active ? ' active' : '') + '"></div>';
    }).join('');
  }

  /* ══ Adjusters ══ */
  function adjustFocus(d) {
    cfg.focus = Math.max(5, Math.min(90, cfg.focus + d));
    document.getElementById('pomoFocusVal').textContent = cfg.focus;
    if (phase === 'idle') {
      remaining = 0;
      document.getElementById('pomoTime').textContent = fmt(cfg.focus * 60);
    }
    saveCfg();
  }
  function adjustBreak(d) {
    cfg.brk = Math.max(1, Math.min(30, cfg.brk + d));
    document.getElementById('pomoBreakVal').textContent = cfg.brk;
    saveCfg();
  }
  function adjustLong(d) {
    cfg.long = Math.max(5, Math.min(60, cfg.long + d));
    document.getElementById('pomoLongVal').textContent = cfg.long;
    saveCfg();
  }

  /* ══ Notifications ══ */
  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function notify(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '' });
    }
    // Also show in-page toast
    UI.toast(title + ' ' + body, 'success', 5000);
  }

  /* ══ Audio beep (Web Audio API, no file needed) ══ */
  function beep() {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.8);
    } catch(e) { /* audio not available */ }
  }

  /* ══ Log panel ══ */
  function log(msg, type) {
    const el  = document.getElementById('pomoLog');
    if (!el) return;
    const now = new Date().toTimeString().slice(0, 5);
    const div = document.createElement('div');
    div.className = 'pomo-log-entry ' + (type || '');
    div.textContent = now + '  ' + msg;
    el.prepend(div);
  }

  /* ══ Persistence ══ */
  function saveCfg() {
    localStorage.setItem('pomo_cfg', JSON.stringify(cfg));
  }
  function loadCfg() {
    try {
      const saved = JSON.parse(localStorage.getItem('pomo_cfg') || '{}');
      Object.assign(cfg, saved);
    } catch(e) {}
    document.getElementById('pomoFocusVal').textContent = cfg.focus;
    document.getElementById('pomoBreakVal').textContent = cfg.brk;
    document.getElementById('pomoLongVal').textContent  = cfg.long;
    document.getElementById('pomoTime').textContent     = fmt(cfg.focus * 60);
  }

  /* ══ Helpers ══ */
  function fmt(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m.toString().padStart(2,'0') + ':' + sec.toString().padStart(2,'0');
  }
  function fmtTime(dt) {
    if (!dt) return '';
    const d = new Date(dt);
    return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
  }
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ══ Init ══ */
  function init() {
    // Load saved config after DOM ready
    setTimeout(loadCfg, 100);
  }

  return { open, close, toggle, skip, reset, adjustFocus, adjustBreak, adjustLong, init };
})();
