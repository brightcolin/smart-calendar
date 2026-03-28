/* ═══════════════════════════════════════════════════
   calview.js — Week/Day visual calendar view
   Renders events as positioned blocks in a time grid.
   Integrates with Cal API and AI for quick actions.
═══════════════════════════════════════════════════ */

const CalView = (() => {

  let mode        = 'week';  // 'week' | 'day'
  let anchor      = null;    // Date: Monday of current week (week mode) or selected day (day mode)
  let cachedEvents = [];

  const HOURS     = Array.from({ length: 24 }, (_, i) => i);  // 0..23
  const HOUR_H    = 56;   // px per hour slot
  const TAG_TEXT  = {     // readable text color on colored bg
    '学习':'#1a3050','课程':'#2a1a50','科研':'#0a2020','社工':'#0a2010',
    '运动':'#3a1a00','娱乐':'#3a0010','工作':'#3a1010','其他':'#1e1e24',
  };

  /* ══ Init ══ */
  function init() {
    const now = new Date();
    const day = now.getDay() || 7;
    anchor = new Date(now);
    anchor.setDate(now.getDate() - day + 1);  // Monday
    anchor.setHours(0,0,0,0);
  }

  /* ══ Navigation ══ */
  function shift(dir) {
    if (mode === 'week') {
      anchor.setDate(anchor.getDate() + dir * 7);
    } else {
      anchor.setDate(anchor.getDate() + dir);
    }
    render();
  }

  function setMode(m, btn) {
    mode = m;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    // If switching to day mode, anchor to today or current week's selected day
    if (mode === 'day' && anchor) {
      // keep anchor as-is (already a valid date)
    }
    render();
  }

  /* ══ Main render entry ══ */
  async function render() {
    const wrap = document.getElementById('calViewWrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="empty"><span class="spinner"></span> 加载中...</div>';

    try {
      if (mode === 'week') {
        await renderWeek(wrap);
      } else {
        await renderDay(wrap);
      }
    } catch(e) {
      wrap.innerHTML = '<div class="empty" style="color:var(--red)">加载失败：' + esc(e.message) + '</div>';
    }
  }

  /* ══ Public refresh (called after create/modify) ══ */
  async function refresh() {
    if (document.getElementById('page-cal')?.classList.contains('active')) {
      await render();
    }
  }

  /* ══ Week view ══ */
  async function renderWeek(wrap) {
    const monday = new Date(anchor);
    const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
    updateTitle(monday, sunday);

    // Load events
    const events = await Cal.loadWeekEvents(monday);
    cachedEvents = events;

    const today    = Cal.todayStr();
    const days     = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday); d.setDate(d.getDate() + i); return d;
    });
    const weekDays = ['一','二','三','四','五','六','日'];

    // Build header
    let html = '<div class="cv-week">';
    html += '<div class="cv-header-row">';
    html += '<div></div>';  // time col spacer
    days.forEach((d, i) => {
      const isToday = d.toISOString().slice(0,10) === today;
      html += '<div class="cv-day-head' + (isToday ? ' today' : '') + '">'
        + '<span class="cv-day-num">' + d.getDate() + '</span>'
        + '周' + weekDays[i]
        + '</div>';
    });
    html += '</div>';  // header-row

    // All-day events
    const allDay = events.filter(e => !e.start?.includes('T'));
    if (allDay.length) {
      html += '<div class="cv-allday-row"><div></div>';
      days.forEach(d => {
        const ds  = d.toISOString().slice(0,10);
        const dayAllDay = allDay.filter(e => e.start?.slice(0,10) === ds);
        html += '<div class="cv-allday-cell">';
        dayAllDay.forEach(e => {
          const bg  = Cal.TAG_HEX[e.tag] || '#9a9690';
          const col = TAG_TEXT[e.tag] || '#1a1a1a';
          html += '<div class="cv-allday-event" style="background:' + bg + ';color:' + col + '">'
            + esc(e.name) + '</div>';
        });
        html += '</div>';
      });
      html += '</div>';
    }

    // Time grid body
    const timedEvents = events.filter(e => e.start?.includes('T'));
    html += '<div class="cv-body" id="cvBody">';
    HOURS.forEach(h => {
      html += '<div class="cv-row">';
      html += '<div class="cv-time-label">' + (h === 0 ? '' : h.toString().padStart(2,'0') + ':00') + '</div>';
      days.forEach(d => {
        const ds      = d.toISOString().slice(0,10);
        const isToday = ds === today;
        html += '<div class="cv-cell' + (isToday ? ' today-col' : '') + '"'
          + ' onclick="CalView.quickCreate(\'' + ds + '\',' + h + ')">'
          + '</div>';
      });
      html += '</div>';
    });
    html += '</div>';  // cv-body

    // Overlay event blocks
    html += '<div id="cvEventLayer" style="display:none"></div>';
    html += '</div>';  // cv-week

    wrap.innerHTML = html;

    // Position event blocks over the grid
    requestAnimationFrame(() => {
      positionWeekEvents(wrap, days, timedEvents, today);
      scrollToWorkHours();
    });
  }

  function positionWeekEvents(wrap, days, events, today) {
    const body = wrap.querySelector('#cvBody');
    if (!body) return;
    const bodyRect = body.getBoundingClientRect();
    const rows     = body.querySelectorAll('.cv-row');
    if (!rows.length) return;
    const rowH  = rows[0].offsetHeight || HOUR_H;
    const colW  = (rows[0].querySelectorAll('.cv-cell')[0]?.offsetWidth) || 40;
    const timeW = rows[0].querySelector('.cv-time-label')?.offsetWidth || 36;

    events.forEach(e => {
      if (!e.start?.includes('T')) return;
      const startDate = new Date(e.start);
      const endDate   = new Date(e.end   || e.start);
      const ds        = startDate.toISOString().slice(0,10);
      const colIdx    = days.findIndex(d => d.toISOString().slice(0,10) === ds);
      if (colIdx < 0) return;

      const startMin  = startDate.getHours() * 60 + startDate.getMinutes();
      const endMin    = endDate.getHours()   * 60 + endDate.getMinutes();
      const durationM = Math.max(endMin - startMin, 15);
      const top       = (startMin / 60) * rowH;
      const height    = Math.max((durationM / 60) * rowH - 2, 18);
      const left      = timeW + colIdx * colW + 1;
      const width     = colW - 3;

      const bg  = Cal.TAG_HEX[e.tag] || '#9a9690';
      const col = TAG_TEXT[e.tag]  || '#1a1a1a';
      const fmt = d => d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');

      const el  = document.createElement('div');
      el.className = 'cv-event' + (e.done ? ' done' : '');
      el.style.cssText = 'top:' + top + 'px;left:' + left + 'px;width:' + width + 'px;height:' + height + 'px;background:' + bg + ';color:' + col + ';';
      el.innerHTML = '<div class="cv-event-name">' + esc(e.name) + '</div>'
        + (height > 28 ? '<div class="cv-event-time">' + fmt(startDate) + '–' + fmt(endDate) + '</div>' : '');
      el.addEventListener('click', ev => { ev.stopPropagation(); showEventDetail(e); });
      body.style.position = 'relative';
      body.appendChild(el);
    });

    // Current time line
    const ds = new Date().toISOString().slice(0,10);
    const ci = days.findIndex(d => d.toISOString().slice(0,10) === ds);
    if (ci >= 0) {
      const now    = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const line   = document.createElement('div');
      line.className = 'cv-now-line';
      line.style.top  = (nowMin / 60 * rowH) + 'px';
      line.style.left = (timeW + ci * colW) + 'px';
      line.style.width = colW + 'px';
      line.innerHTML = '<div class="cv-now-dot"></div>';
      body.appendChild(line);
    }
  }

  /* ══ Day view ══ */
  async function renderDay(wrap) {
    const d     = new Date(anchor);
    const ds    = d.toISOString().slice(0,10);
    const today = Cal.todayStr();
    updateTitle(d, null);

    const events      = await Cal.loadEventsRange(ds, ds);
    cachedEvents      = events;
    const timedEvents = events.filter(e => e.start?.includes('T'));
    const allDay      = events.filter(e => !e.start?.includes('T'));
    const weekDay     = ['日','一','二','三','四','五','六'][d.getDay()];
    const isToday     = ds === today;

    let html = '<div class="cv-day">';
    html += '<div class="cv-day-header' + (isToday ? '" style="color:var(--accent)' : '') + '">'
      + d.getMonth()+1 + '月' + d.getDate() + '日（周' + weekDay + '）'
      + (allDay.length ? ' · ' + allDay.length + ' 个全天事件' : '')
      + '</div>';
    html += '<div class="cv-day-body" id="cvDayBody">';
    html += '<div class="cv-day-time-col">';
    HOURS.forEach(h => {
      html += '<div class="cv-day-time" style="height:' + HOUR_H + 'px">'
        + (h === 0 ? '' : h.toString().padStart(2,'0') + ':00') + '</div>';
    });
    html += '</div>';  // time col

    html += '<div class="cv-day-events-col" id="cvDayEventsCol">';
    HOURS.forEach(h => {
      html += '<div class="cv-day-slot" style="height:' + HOUR_H + 'px"'
        + ' onclick="CalView.quickCreate(\'' + ds + '\',' + h + ')"></div>';
    });
    html += '</div>';  // events col
    html += '</div>';  // day-body
    html += '</div>';  // cv-day

    wrap.innerHTML = html;

    requestAnimationFrame(() => {
      positionDayEvents(wrap, timedEvents);
      scrollToWorkHours();
    });
  }

  function positionDayEvents(wrap, events) {
    const col = wrap.querySelector('#cvDayEventsCol');
    if (!col) return;
    col.style.position = 'relative';

    events.forEach(e => {
      const startDate = new Date(e.start);
      const endDate   = new Date(e.end   || e.start);
      const startMin  = startDate.getHours() * 60 + startDate.getMinutes();
      const endMin    = endDate.getHours()   * 60 + endDate.getMinutes();
      const durationM = Math.max(endMin - startMin, 15);
      const top       = (startMin / 60) * HOUR_H;
      const height    = Math.max((durationM / 60) * HOUR_H - 3, 22);
      const bg        = Cal.TAG_HEX[e.tag] || '#9a9690';
      const color     = TAG_TEXT[e.tag]    || '#1a1a1a';
      const fmt       = d => d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');

      const el = document.createElement('div');
      el.className = 'cv-day-event' + (e.done ? ' done' : '');
      el.style.cssText = 'top:' + top + 'px;left:2px;right:2px;height:' + height + 'px;background:' + bg + ';color:' + color + ';';
      el.innerHTML = '<div class="cv-day-event-name">' + esc(e.name) + '</div>'
        + '<div class="cv-day-event-time">' + fmt(startDate) + '–' + fmt(endDate) + '</div>';
      el.addEventListener('click', ev => { ev.stopPropagation(); showEventDetail(e); });
      col.appendChild(el);
    });

    // Current time indicator
    const now    = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const line   = document.createElement('div');
    line.className = 'cv-now-line';
    line.style.top = (nowMin / 60 * HOUR_H) + 'px';
    line.innerHTML = '<div class="cv-now-dot"></div>';
    col.appendChild(line);
  }

  /* ══ Scroll to 08:00 on first render ══ */
  function scrollToWorkHours() {
    const body = document.getElementById('cvBody') || document.getElementById('cvDayBody');
    if (body) body.scrollTop = 8 * HOUR_H - 20;
  }

  /* ══ Update toolbar title ══ */
  function updateTitle(from, to) {
    const el = document.getElementById('calViewTitle');
    if (!el) return;
    if (mode === 'week' && to) {
      const sameMonth = from.getMonth() === to.getMonth();
      el.textContent = from.getMonth()+1 + '月' + from.getDate() + '日'
        + ' – ' + (sameMonth ? '' : (to.getMonth()+1) + '月') + to.getDate() + '日';
    } else {
      el.textContent = from.getFullYear() + '年' + (from.getMonth()+1) + '月' + from.getDate() + '日';
    }
  }

  /* ══ Quick create from empty slot ══ */
  function quickCreate(dateStr, hour) {
    // Switch to chat tab (index 0 now) and pre-fill
    UI.goPage('add', document.querySelectorAll('.nav-item')[0]);
    const h   = hour.toString().padStart(2,'0');
    const h1  = (hour + 1).toString().padStart(2,'0');
    const area = document.getElementById('chatInput');
    if (area) {
      area.value = dateStr + ' ' + h + ':00–' + h1 + ':00 ';
      area.focus();
      autoResize(area);
    }
  }

  /* ══ Event detail popup ══ */
  function showEventDetail(e) {
    const modal = document.getElementById('eventDetailModal');
    if (!modal) return;
    const fmt = dt => {
      if (!dt) return '—';
      const d = new Date(dt);
      return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
    };
    const dateStr = e.start ? e.start.slice(0,10) : '—';
    const bg      = Cal.TAG_HEX[e.tag] || '#9a9690';

    document.getElementById('edTitle').innerHTML =
      '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + bg + ';margin-right:8px;vertical-align:middle"></span>'
      + esc(e.name);

    document.getElementById('edBody').innerHTML =
      edRow('日期', dateStr)
      + edRow('时间', fmt(e.start) + ' – ' + fmt(e.end))
      + edRow('标签', e.tag !== '其他' ? '#' + esc(e.tag) : '其他')
      + edRow('预估', fmtMins(e.estMins))
      + (e.actualMins != null ? edRow('实际', fmtMins(e.actualMins) + (e.actualMins > e.estMins ? ' ⚠超时' : ' ✓节省')) : '')
      + (e.description ? edRow('备注', esc(e.description.slice(0,80))) : '')
      + (e.done ? edRow('状态', '✓ 已完成') : '');

    const acts = document.getElementById('edActions');
    acts.innerHTML = '';

    // Tag editor
    const editBtn = document.createElement('button');
    editBtn.className = 'btn';
    editBtn.textContent = '改标签';
    editBtn.onclick = () => { UI.closeModal('eventDetailModal'); openTagEditor(e.gcalId); };
    acts.appendChild(editBtn);

    // Go to chat to operate on this event via NL
    const chatBtn = document.createElement('button');
    chatBtn.className = 'btn btn-primary';
    chatBtn.textContent = '对话操作';
    chatBtn.onclick = () => {
      UI.closeModal('eventDetailModal');
      UI.goPage('add', document.querySelectorAll('.nav-item')[0]);
      const input = document.getElementById('chatInput');
      if (input) {
        input.value = '「' + e.name + '」';
        input.focus();
        autoResize(input);
      }
    };
    acts.appendChild(chatBtn);

    modal.classList.add('open');
  }

  function edRow(key, val) {
    return '<div class="ed-row"><span class="ed-key">' + key + '</span><span class="ed-val">' + val + '</span></div>';
  }

  function fmtMins(m) {
    if (!m && m !== 0) return '—';
    return m < 60 ? m + '分' : (m/60).toFixed(1) + 'h';
  }

  /* ══ Init ══ */
  init();

  return { shift, setMode, render, refresh, quickCreate };
})();
