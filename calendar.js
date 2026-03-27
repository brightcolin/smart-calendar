/* ═══════════════════════════════════════════════════
   calendar.js — Google Calendar API wrapper
   Multi-calendar, tag colors, timezone-aware
═══════════════════════════════════════════════════ */

const Cal = (() => {
  const BASE = 'https://www.googleapis.com/calendar/v3';

  // ── Tag → Google Calendar color ID mapping ──
  const TAG_COLOR = {
    '学习': '9',   // Blueberry
    '课程': '1',   // Lavender
    '科研': '8',   // Graphite
    '社工': '2',   // Sage
    '运动': '6',   // Tangerine
    '娱乐': '4',   // Flamingo
    '工作': '11',  // Tomato
    '其他': '0',   // default
  };

  // Tag → display hex color (for UI color bar)
  const TAG_HEX = {
    '学习': '#6b9fe0',
    '课程': '#9b7fe0',
    '科研': '#4dbdbd',
    '社工': '#5dba8a',
    '运动': '#e09b4d',
    '娱乐': '#e04d8a',
    '工作': '#e06b6b',
    '其他': '#9a9690',
  };

  let calendars = [];        // list of user's calendars
  let activeCalendarId = 'primary';
  let activeCalendarName = '主日历';

  /* ══ HTTP helper ══ */
  async function req(method, path, body) {
    const token = await Auth.getActiveToken();
    if (!token) {
      document.getElementById('tokenWarn').classList.add('visible');
      throw new Error('未登录');
    }
    const opts = {
      method,
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(BASE + path, opts);
    if (r.status === 401) {
      document.getElementById('tokenWarn').classList.add('visible');
      throw new Error('登录已过期，请重新登录');
    }
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error?.message || '请求失败(' + r.status + ')');
    }
    if (r.status === 204) return {};
    return r.json();
  }

  /* ══ Calendar list ══ */
  async function loadCalendars() {
    const data = await req('GET', '/users/me/calendarList');
    calendars = (data.items || []).map(c => ({
      id:      c.id,
      name:    c.summary,
      color:   c.backgroundColor || '#888',
      primary: c.primary || false,
    }));
    return calendars;
  }

  function getCalendars() { return calendars; }

  function setActiveCalendar(id, name) {
    activeCalendarId = id;
    activeCalendarName = name;
    document.getElementById('calLabel').textContent = name;
    App.store.cfg.activeCalId  = id;
    App.store.cfg.activeCalName = name;
    App.saveState();
  }

  /* ══ Events ══ */
  async function loadTodayEvents() {
    const t = UI.toast('加载今日事件...', 'loading', 0);
    try {
      const tz    = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
      const params = new URLSearchParams({
        timeMin:      today.toISOString(),
        timeMax:      tomorrow.toISOString(),
        singleEvents: true,
        orderBy:      'startTime',
        maxResults:   50,
        timeZone:     tz,
      });
      const data = await req('GET', '/calendars/' + encodeURIComponent(activeCalendarId) + '/events?' + params);
      const events = (data.items || []).map(normalizeEvent);
      t.remove();
      UI.renderTodayEvents(events);
      return events;
    } catch(e) {
      t.remove();
      UI.toast('加载失败：' + e.message, 'error');
      return [];
    }
  }

  async function loadEventsRange(start, end) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const params = new URLSearchParams({
      timeMin:      new Date(start + 'T00:00:00').toISOString(),
      timeMax:      new Date(end   + 'T23:59:59').toISOString(),
      singleEvents: true,
      orderBy:      'startTime',
      maxResults:   200,
      timeZone:     tz,
    });
    const data = await req('GET', '/calendars/' + encodeURIComponent(activeCalendarId) + '/events?' + params);
    return (data.items || []).map(normalizeEvent);
  }

  /* ══ Search events by keyword across a date range ══ */
  async function searchEvents(keyword, dateStr) {
    // Search ±7 days around given date (default today)
    const base  = dateStr ? new Date(dateStr) : new Date();
    const start = new Date(base); start.setDate(start.getDate() - 1);
    const end   = new Date(base); end.setDate(end.getDate() + 14);
    const tz    = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const params = new URLSearchParams({
      q:            keyword,
      timeMin:      start.toISOString(),
      timeMax:      end.toISOString(),
      singleEvents: true,
      orderBy:      'startTime',
      maxResults:   20,
      timeZone:     tz,
    });
    const data = await req('GET', '/calendars/' + encodeURIComponent(activeCalendarId) + '/events?' + params);
    return (data.items || []).map(normalizeEvent);
  }

  /* ══ Load a full week for calendar view ══ */
  async function loadWeekEvents(mondayDate) {
    const end = new Date(mondayDate);
    end.setDate(end.getDate() + 6);
    return loadEventsRange(
      mondayDate.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10)
    );
  }

  function normalizeEvent(e) {
    const start   = e.start?.dateTime || e.start?.date || '';
    const end     = e.end?.dateTime   || e.end?.date   || '';
    const desc    = e.description || '';
    const rawName = e.summary || '无标题';

    // Parse tag from title:
    //   New format (prefix):  "#标签 任务名"
    //   Old format (suffix):  "任务名 #标签"
    //   Legacy format:        "【标签】任务名"
    let tag  = '其他';
    let name = rawName;
    const prefixMatch  = rawName.match(/^#([^\s#]+)\s+(.+)$/);
    const suffixMatch  = rawName.match(/^(.+?)\s+#([^\s#]+)\s*$/);
    const legacyMatch  = rawName.match(/^【([^】]+)】(.+)$/);
    if (prefixMatch) {
      tag  = prefixMatch[1].trim();
      name = prefixMatch[2].trim();
    } else if (suffixMatch) {
      name = suffixMatch[1].trim();
      tag  = suffixMatch[2].trim();
    } else if (legacyMatch) {
      tag  = legacyMatch[1].trim();
      name = legacyMatch[2].trim();
    }
    // Fallback: check description metadata
    if (!VALID_TAGS.includes(tag)) {
      const tagDescMatch = desc.match(/标签：([^\n]+)/);
      if (tagDescMatch) tag = tagDescMatch[1].trim();
    }

    const estMatch    = desc.match(/预估时长：(\d+)分钟/);
    const actualMatch = desc.match(/实际：(\d+)分钟/);
    const doneMatch   = desc.match(/状态：已完成/);

    const cleanDesc = desc
      .replace(/预估时长：\d+分钟\n?/g, '')
      .replace(/实际：\d+分钟\n?/g, '')
      .replace(/状态：已完成\n?/g, '')
      .replace(/标签：[^\n]+\n?/g, '')
      .trim();

    return {
      gcalId:      e.id,
      name,
      rawSummary:  rawName,
      description: cleanDesc,
      start,
      end,
      tag:         VALID_TAGS.includes(tag) ? tag : '其他',
      estMins:     estMatch    ? parseInt(estMatch[1])    : calcMinsFromDates(start, end),
      actualMins:  actualMatch ? parseInt(actualMatch[1]) : null,
      done:        !!doneMatch,
      color:       e.colorId || '0',
      reminders:   e.reminders,
      calendarId:  activeCalendarId,
    };
  }

  const VALID_TAGS = ['学习','课程','科研','社工','运动','娱乐','工作','其他'];

  function calcMinsFromDates(start, end) {
    if (!start || !end) return 0;
    return Math.round((new Date(end) - new Date(start)) / 60000);
  }

  /* ══ Create single event ══
     Title format: "#标签 任务名"  (tag prefix)
     Color synced from tag automatically
  */
  async function createEvent(task) {
    const tz      = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const colorId = TAG_COLOR[task.tag] || '0';
    // Prefix format: "#工作 写周报"  (no tag prefix when tag is 其他)
    const summary = (task.tag && task.tag !== '其他')
      ? '#' + task.tag + ' ' + task.name
      : task.name;
    const body = {
      summary,
      description: buildDescription(task),
      start:       { dateTime: toDateTimeStr(task.date, task.start), timeZone: tz },
      end:         { dateTime: toDateTimeStr(task.date, task.end),   timeZone: tz },
      colorId,
      reminders:   {
        useDefault: false,
        overrides:  [{ method: task.reminderMethod || 'popup', minutes: task.reminder }]
      },
    };
    return req('POST', '/calendars/' + encodeURIComponent(activeCalendarId) + '/events', body);
  }

  /* ══ Batch create: create multiple independent events (no recurrence rule) ══ */
  async function createEventsBatch(tasks) {
    const results = [];
    for (const task of tasks) {
      try {
        const res = await createEvent(task);
        results.push({ ok: true, gcalId: res.id, task });
      } catch(e) {
        results.push({ ok: false, error: e.message, task });
      }
    }
    return results;
  }

  /* ══ Update event ══ */
  async function updateEvent(gcalId, updates) {
    const tz       = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const existing = await req('GET', '/calendars/' + encodeURIComponent(activeCalendarId) + '/events/' + gcalId);
    const merged   = { ...existing };

    // Time updates
    if (updates.start) merged.start = { dateTime: updates.start, timeZone: tz };
    if (updates.end)   merged.end   = { dateTime: updates.end,   timeZone: tz };

    // Text field updates
    if (updates.summary     !== undefined) merged.summary     = updates.summary;
    if (updates.description !== undefined) merged.description = updates.description;
    if (updates.colorId     !== undefined) merged.colorId     = updates.colorId;

    return req('PUT', '/calendars/' + encodeURIComponent(activeCalendarId) + '/events/' + gcalId, merged);
  }

  /* ══ Delete event ══ */
  async function deleteEvent(gcalId) {
    return req('DELETE', '/calendars/' + encodeURIComponent(activeCalendarId) + '/events/' + gcalId);
  }

  /* ══ Mark complete ══ */
  async function markComplete(event, actualMins, completedAt) {
    const endTime = completedAt instanceof Date ? completedAt : new Date();
    const newDesc = (event.description || '')
      .replace(/实际：\d+分钟/g, '')
      .replace(/状态：已完成/g, '')
      .trim()
      + '\n实际：' + actualMins + '分钟\n状态：已完成';
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return updateEvent(event.gcalId, {
      description: newDesc,
      end: endTime.toISOString(),
    });
  }

  /* ══ Daily review ══ */
  async function setupDailyReview() {
    const t = UI.toast('正在创建每日回顾提醒...', 'loading', 0);
    const tz   = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const time  = App.store.cfg.reviewTime || '23:30';
    const today = todayStr();
    const [h, m] = time.split(':').map(Number);
    const em = m + 15, endH = String(em >= 60 ? h + 1 : h).padStart(2,'0'), endM = String(em >= 60 ? em - 60 : em).padStart(2,'0');
    try {
      await req('POST', '/calendars/primary/events', {
        summary:    '📊 每日任务回顾',
        description:'打开智能日历助手，记录完成情况并查看统计',
        start:      { dateTime: toDateTimeStr(today, time), timeZone: tz },
        end:        { dateTime: toDateTimeStr(today, endH + ':' + endM), timeZone: tz },
        recurrence: ['RRULE:FREQ=DAILY'],
        reminders:  { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
      });
      t.remove();
      UI.toast('每日 ' + time + ' 回顾提醒已创建', 'success');
    } catch(e) {
      t.remove();
      UI.toast('创建失败：' + e.message, 'error');
    }
  }

  /* ══ Helpers ══ */
  function buildDescription(task) {
    let lines = [];
    if (task.description) lines.push(task.description);
    lines.push('预估时长：' + (task.estMins || calcMins(task.start, task.end)) + '分钟');
    lines.push('标签：' + task.tag);
    return lines.join('\n').trim();
  }

  function toDateTimeStr(dateStr, timeStr) {
    return dateStr + 'T' + timeStr + ':00';
  }

  function calcMins(s, e) {
    const [sh, sm] = s.split(':').map(Number), [eh, em] = e.split(':').map(Number);
    return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  }

  function todayStr() { return new Date().toISOString().slice(0, 10); }

  return {
    loadCalendars, getCalendars, setActiveCalendar,
    get activeCalendarId() { return activeCalendarId; },
    get activeCalendarName() { return activeCalendarName; },
    loadTodayEvents, loadEventsRange, searchEvents, loadWeekEvents,
    createEvent, createEventsBatch, updateEvent, deleteEvent, markComplete,
    setupDailyReview,
    TAG_COLOR, TAG_HEX, VALID_TAGS,
    calcMins, todayStr,
  };
})();
