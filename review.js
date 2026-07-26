/* ═══════════════════════════════════════════════════
   review.js — Exam Review Planner Module
   • Local, user-configured review plan with per-subject tracking
   • Timeline view with day-by-day task cards
   • DeepSeek-powered smart rescheduling
   • Conflict detection with Google Calendar
   • Progress dashboard per subject
═══════════════════════════════════════════════════ */

const Review = (() => {
  const STORE_KEY = 'sca_review';

  /* ══ User-owned subjects (stored locally, never hardcoded) ══ */
  const SUBJECTS = [];
  const SUBJECT_MAP = {};
  const SUBJECT_COLORS = ['#6b9fe0', '#5dba8a', '#9b7fe0', '#e09b4d', '#e04d8a', '#e06b6b'];

  function normalizeSubject(subject, index) {
    const name = String(subject?.name || subject?.id || ('科目' + (index + 1))).trim().slice(0, 30);
    const rawId = String(subject?.id || '').trim();
    const id = (rawId && /^[\w-]{1,40}$/.test(rawId)) ? rawId : 'subject-' + (index + 1);
    return {
      id,
      name,
      short: String(subject?.short || name.slice(0, 2)).trim().slice(0, 6),
      color: /^#[0-9a-f]{6}$/i.test(subject?.color || '') ? subject.color : SUBJECT_COLORS[index % SUBJECT_COLORS.length],
      textColor: /^#[0-9a-f]{6}$/i.test(subject?.textColor || '') ? subject.textColor : '#1e1e24',
      credits: Math.max(0, Number(subject?.credits) || 0),
      examDate: /^\d{4}-\d{2}-\d{2}$/.test(subject?.examDate || '') ? subject.examDate : '',
      examTime: String(subject?.examTime || '').slice(0, 30),
      targetHours: Math.max(0.5, Number(subject?.targetHours) || 1),
      icon: String(subject?.icon || '📘').slice(0, 4),
    };
  }

  function setSubjects(subjects) {
    SUBJECTS.splice(0, SUBJECTS.length, ...(subjects || []).map(normalizeSubject));
    Object.keys(SUBJECT_MAP).forEach(key => delete SUBJECT_MAP[key]);
    SUBJECTS.forEach(subject => { SUBJECT_MAP[subject.id] = subject; });
  }

  function inferSubjects(tasks) {
    const ids = [...new Set((tasks || []).map(task => String(task.subjectId || '')).filter(Boolean))];
    return ids.map((id, index) => ({ id, name: id, short: id.slice(0, 6), color: SUBJECT_COLORS[index % SUBJECT_COLORS.length] }));
  }

  let plan = { tasks: [], subjects: [], version: 3, created: null };
  let filterSubject = 'all';
  let scrollDate = null; // date string to scroll to
  let conflictMap = {}; // taskId → { courseName, time }

  /* ══ Load / Save ══ */
  function loadPlan() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const tasks = Array.isArray(saved.tasks) ? saved.tasks : [];
        setSubjects(Array.isArray(saved.subjects) && saved.subjects.length ? saved.subjects : inferSubjects(tasks));
        plan = { ...saved, tasks, subjects: SUBJECTS, version: 3 };
      } else {
        setSubjects([]);
        plan = { tasks: [], subjects: SUBJECTS, version: 3, created: null };
      }
    } catch(e) {
      setSubjects([]);
      plan = { tasks: [], subjects: SUBJECTS, version: 3, created: null };
    }
  }

  function savePlan() {
    plan.subjects = SUBJECTS.map(subject => ({ ...subject }));
    plan.version = 3;
    localStorage.setItem(STORE_KEY, JSON.stringify(plan));
  }

  function hasPlan() { return plan.tasks.length > 0; }

  /* ══ Generic plan generator ══ */
  function generateDefaultPlan() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tasks = [];
    const occupied = new Set();
    const slots = [
      { start: '09:00', end: '11:00' },
      { start: '14:00', end: '16:00' },
      { start: '19:00', end: '21:00' },
    ];
    let nextId = 1;
    let skippedSubjects = 0;

    SUBJECTS.forEach((subject, subjectIndex) => {
      if (!subject.examDate) { skippedSubjects++; return; }
      const examDay = new Date(subject.examDate + 'T00:00:00');
      const availableDays = Math.max(0, Math.ceil((examDay - today) / 86400000));
      if (!availableDays) { skippedSubjects++; return; }

      const desiredSessions = Math.max(1, Math.ceil(subject.targetHours / 2));
      const sessionCount = Math.min(desiredSessions, availableDays * slots.length);
      for (let index = 0; index < sessionCount; index++) {
        const preferredDay = Math.min(availableDays - 1, Math.floor(index * availableDays / sessionCount));
        let selected = null;
        for (let offset = 0; offset < availableDays && !selected; offset++) {
          const dayOffset = (preferredDay + offset) % availableDays;
          const date = new Date(today);
          date.setDate(date.getDate() + dayOffset);
          const dateStr = date.toISOString().slice(0, 10);
          for (let slotOffset = 0; slotOffset < slots.length; slotOffset++) {
            const slot = slots[(subjectIndex + index + slotOffset) % slots.length];
            const key = dateStr + '|' + slot.start;
            if (!occupied.has(key)) {
              selected = { date: dateStr, ...slot };
              occupied.add(key);
              break;
            }
          }
        }
        if (!selected) continue;
        tasks.push({
          id: nextId++,
          subjectId: subject.id,
          date: selected.date,
          start: selected.start,
          end: selected.end,
          name: subject.name + '-复习第' + (index + 1) + '次',
          desc: '根据考试日期和目标时长自动生成，请结合实际内容编辑',
          done: false,
          gcalId: null,
        });
      }
    });

    plan = { tasks, subjects: SUBJECTS, version: 3, created: new Date().toISOString() };
    savePlan();
    return { taskCount: tasks.length, skippedSubjects };
  }

  /* ══ Task operations ══ */
  async function toggleDone(taskId) {
    const task = plan.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.done = !task.done;
    savePlan();
    render();
    if (!task.gcalId) return;
    try {
      const mins = Cal.calcMins(task.start, task.end);
      if (task.done) {
        const endTime = new Date(task.date + 'T' + task.end + ':00');
        await Cal.markComplete({ gcalId: task.gcalId, description: task.desc || '' }, mins, endTime);
      } else {
        const base = (task.desc || '').trim();
        await Cal.updateEvent(task.gcalId, {
          description: (base ? base + '\n' : '') + '预估时长：' + mins + '分钟\n标签：学习',
        });
      }
    } catch(e) {
      UI.toast('本地已更新，日历同步失败', 'error');
    }
  }

  async function deleteTask(taskId) {
    const task = plan.tasks.find(t => t.id === taskId);
    const gcalId = task?.gcalId;
    plan.tasks = plan.tasks.filter(t => t.id !== taskId);
    savePlan();
    render();
    if (gcalId) {
      try {
        await Cal.deleteEvent(gcalId);
      } catch(e) {
        UI.toast('本地已删除，日历删除失败', 'error');
      }
    }
  }

  function addTask(subjectId, date, start, end, name, desc) {
    const id = plan.tasks.length ? Math.max(...plan.tasks.map(t=>t.id)) + 1 : 1;
    plan.tasks.push({ id, subjectId, date, start, end, name, desc: desc||'', done: false, gcalId: null });
    savePlan();
    render();
    UI.toast('已添加任务', 'success');
  }

  function updateTask(taskId, changes) {
    const task = plan.tasks.find(t => t.id === taskId);
    if (task) { Object.assign(task, changes); savePlan(); render(); }
  }

  /* ══ Time helpers ══ */
  function calcMins(start, end) {
    const [sh,sm] = start.split(':').map(Number);
    const [eh,em] = end.split(':').map(Number);
    return Math.max(0, (eh*60+em) - (sh*60+sm));
  }

  function calcSubjectHours(subjectId) {
    const subjectTasks = plan.tasks.filter(t => t.subjectId === subjectId);
    const total  = subjectTasks.reduce((s,t) => s + calcMins(t.start,t.end), 0);
    const done   = subjectTasks.filter(t=>t.done).reduce((s,t) => s + calcMins(t.start,t.end), 0);
    const count  = subjectTasks.length;
    const doneCount = subjectTasks.filter(t=>t.done).length;
    return { totalMins: total, doneMins: done, count, doneCount };
  }

  function getOverallProgress() {
    const total = plan.tasks.length;
    const done  = plan.tasks.filter(t=>t.done).length;
    const totalMins = plan.tasks.reduce((s,t) => s + calcMins(t.start,t.end), 0);
    const doneMins  = plan.tasks.filter(t=>t.done).reduce((s,t) => s + calcMins(t.start,t.end), 0);
    return { total, done, totalMins, doneMins };
  }

  function getDaysRemaining() {
    const now  = new Date(); now.setHours(0,0,0,0);
    const dates = SUBJECTS.map(subject => subject.examDate).filter(Boolean).sort();
    if (!dates.length) return 0;
    const exam = new Date(dates[dates.length - 1] + 'T00:00:00');
    return Math.max(0, Math.ceil((exam - now) / 86400000));
  }

  function isOverdue(task) {
    if (task.done) return false;
    const now = new Date();
    const taskEnd = new Date(task.date + 'T' + task.end + ':00');
    return now > taskEnd;
  }

  function isToday(dateStr) {
    return dateStr === new Date().toISOString().slice(0,10);
  }

  /* ══ Smart Reschedule via DeepSeek ══ */
  async function smartReschedule(reason) {
    const today = new Date().toISOString().slice(0,10);
    const remaining = plan.tasks.filter(t => !t.done && t.date >= today);
    const done = plan.tasks.filter(t => t.done);
    const overdue = remaining.filter(t => isOverdue(t));

    const taskSummary = remaining.slice(0, 60).map(t => {
      const s = SUBJECT_MAP[t.subjectId];
      return `${t.date} ${t.start}-${t.end} [${s?.name||t.subjectId}] ${t.name}${isOverdue(t) ? ' ⚠过期' : ''}`;
    }).join('\n');

    const progress = SUBJECTS.map(s => {
      const h = calcSubjectHours(s.id);
      return `${s.name}: 完成${(h.doneMins/60).toFixed(1)}h / 目标${s.targetHours}h (${h.doneCount}/${h.count}任务)`;
    }).join('\n');
    const examDates = SUBJECTS
      .filter(subject => subject.examDate)
      .map(subject => `${subject.name}: ${subject.examDate}${subject.examTime ? ' ' + subject.examTime : ''}`)
      .join('\n') || '未设置';
    const personalRules = (App.store.cfg.planningRules || '').trim() || '未配置；仅依据 Google Calendar 已有活动判断冲突';

    const prompt = `你是考试复习规划助手。以下是当前复习计划的状态：

【日期】今天是 ${today}
【考试安排】
${examDates}
【进度】
${progress}

【用户个人规划规则】
${personalRules}

【用户调整原因】
${reason}

【未完成任务列表】
${taskSummary}

【过期任务数】${overdue.length} 个

请根据调整原因，重新安排未完成的任务。规则：
1. 不能与 Google Calendar 已有活动冲突
2. 遵守用户个人规划规则；未配置的作息和优先级不得自行猜测
3. 任务必须安排在对应科目考试日期之前
4. 过期任务优先安排到最近可靠的空闲时段
5. 信息不足时保持原任务不变

只返回需要改变日期或时间的任务，不变的任务不要输出。
每个元素格式：{"id":任务ID,"date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","reason":"5字内"}
reason尽量简短。只输出JSON数组，不要其他文字。如果某些任务建议删除，在reason中说明"建议删除"。`;

    const el = document.getElementById('rvAiStatus');
    if (el) {
      el.style.display = 'flex';
      el.innerHTML = '<span class="spinner"></span>AI 正在重新规划...';
    }

    try {
      const dsKey = (await Auth.loadDeepSeekKey()) || document.getElementById('apiKey')?.value?.trim();
      if (!dsKey) { UI.toast('请先在设置中填入 DeepSeek API Key', 'error'); return; }

      const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + dsKey },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 8000,
          temperature: 0.15,
          thinking: { type: 'disabled' },
        }),
      });
      const d = await r.json();
      const raw = (d.choices?.[0]?.message?.content || '')
        .replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

      const jsonMatch = raw.match(/\[[\s\S]*/);
      if (!jsonMatch) throw new Error('AI 返回格式异常：' + raw.slice(0, 100));
      let changes;
      try {
        changes = JSON.parse(jsonMatch[0]);
      } catch(parseErr) {
        // Response truncated — cut to last complete object
        const lastBrace = jsonMatch[0].lastIndexOf('}');
        if (lastBrace < 1) throw new Error('JSON 解析失败：' + parseErr.message);
        try { changes = JSON.parse(jsonMatch[0].slice(0, lastBrace + 1) + ']'); }
        catch(e2) { throw new Error('JSON 解析失败：' + parseErr.message); }
      }

      let applied = 0;
      changes.forEach(c => {
        if (c.reason?.includes('建议删除')) {
          deleteTask(c.id);
          applied++;
        } else {
          const task = plan.tasks.find(t => String(t.id) === String(c.id));
          if (task) {
            if (c.date)  task.date  = c.date;
            if (c.start) task.start = c.start;
            if (c.end)   task.end   = c.end;
            applied++;
          }
        }
      });
      savePlan();
      if (el) el.style.display = 'none';
      UI.toast('AI 已调整 ' + applied + ' 个任务', 'success');
      render();
    } catch(e) {
      if (el) el.style.display = 'none';
      UI.toast('AI 调整失败：' + e.message, 'error');
    }
  }

  /* ══ Sync to Google Calendar ══ */
  async function syncToCalendar() {
    const unsync = plan.tasks.filter(t => !t.gcalId && !t.done);
    if (!unsync.length) { UI.toast('所有任务已同步', 'info'); return; }
    const toast = UI.toast('正在同步 ' + unsync.length + ' 个任务到日历...', 'loading', 0);
    let ok = 0, fail = 0;
    for (const task of unsync) {
      const s = SUBJECT_MAP[task.subjectId];
      try {
        const res = await Cal.createEvent({
          name: task.name, tag: '学习', date: task.date,
          start: task.start, end: task.end,
          reminder: 10, reminderMethod: 'popup',
          description: (task.desc || '') + '\n来源：复习规划\n科目：' + (s?.name || ''),
        });
        task.gcalId = res.id;
        ok++;
      } catch(e) { fail++; }
    }
    savePlan();
    toast.remove();
    UI.toast('同步完成：成功 ' + ok + '，失败 ' + fail, ok ? 'success' : 'error');
  }

  /* ══ Conflict detection ══ */
  async function checkConflicts() {
    const today = new Date().toISOString().slice(0,10);
    const tasks = plan.tasks.filter(t => !t.done && t.date >= today);
    if (!tasks.length) return [];

    // Load calendar events for the entire review period
    let calEvents = [];
    try {
      const endDates = [
        ...SUBJECTS.map(subject => subject.examDate),
        ...tasks.map(task => task.date),
      ].filter(Boolean).sort();
      const fallback = new Date(today + 'T00:00:00');
      fallback.setDate(fallback.getDate() + 90);
      const rangeEnd = endDates[endDates.length - 1] || fallback.toISOString().slice(0, 10);
      calEvents = await Cal.loadEventsRange(today, rangeEnd);
    } catch(e) { return []; }

    // Filter only #课程 events (fixed schedule)
    const courseEvents = calEvents.filter(e => e.tag === '课程');

    const conflicts = [];
    tasks.forEach(task => {
      const tStart = toMin(task.start);
      const tEnd   = toMin(task.end);
      courseEvents.forEach(ce => {
        if (!ce.start?.includes('T')) return;
        const ceDate  = ce.start.slice(0,10);
        if (ceDate !== task.date) return;
        const ceStart = new Date(ce.start).getHours()*60 + new Date(ce.start).getMinutes();
        const ceEnd   = new Date(ce.end).getHours()*60   + new Date(ce.end).getMinutes();
        if (tStart < ceEnd && tEnd > ceStart) {
          conflicts.push({ task, event: ce });
        }
      });
    });
    return conflicts;
  }

  async function updateConflicts() {
    try {
      const conflicts = await checkConflicts();
      const newMap = {};
      conflicts.forEach(c => {
        const s = (c.event.start || '').slice(11, 16);
        const e = (c.event.end   || '').slice(11, 16);
        newMap[c.task.id] = { courseName: c.event.name, time: s + '–' + e };
      });
      conflictMap = newMap;
      document.querySelectorAll('#reviewContent [data-id]').forEach(el => {
        const id = parseInt(el.dataset.id);
        const existing = el.querySelector('.rv-conflict-badge');
        const info = conflictMap[id];
        if (info && !existing) {
          const badge = document.createElement('span');
          badge.className = 'rv-conflict-badge';
          badge.title = '与「' + info.courseName + '」(' + info.time + ')冲突';
          badge.textContent = '⚠';
          const meta = el.querySelector('.rv-task-meta');
          if (meta) meta.appendChild(badge);
        } else if (!info && existing) {
          existing.remove();
        }
      });
    } catch(e) { /* silent — no Calendar access */ }
  }

  function toMin(hhmm) {
    const [h,m] = hhmm.split(':').map(Number);
    return h*60+m;
  }

  /* ══ Rendering ══ */
  function render() {
    loadPlan();
    const wrap = document.getElementById('reviewContent');
    if (!wrap) return;

    if (!hasPlan()) {
      wrap.innerHTML = renderEmpty();
      return;
    }

    const today = new Date().toISOString().slice(0,10);
    wrap.innerHTML = renderProgressDash() + renderFilters() + renderAiBar() + renderTimeline(today);
    updateConflicts(); // async, patches conflict badges after Calendar load

    // Scroll to today or selected date
    requestAnimationFrame(() => {
      wrap.querySelectorAll('.rv-bar-fill[data-w]').forEach(el => {
        el.style.width = el.dataset.w + '%';
      });
      const target = scrollDate || today;
      const dayEl = document.getElementById('rv-day-' + target);
      if (dayEl) dayEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      scrollDate = null;
    });
  }

  function renderEmpty() {
    return '<div class="rv-empty">'
      + '<div class="rv-empty-icon">📋</div>'
      + '<div class="rv-empty-title">还没有复习计划</div>'
      + '<div class="rv-empty-sub">个人科目与计划只保存在当前浏览器<br>可以添加科目后生成，也可以导入本地备份</div>'
      + '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">'
      + '<button class="btn btn-primary rv-gen-btn" onclick="Review.generate()">生成复习计划</button>'
      + '<button class="btn" onclick="Review.openSubjects()">管理科目</button>'
      + '<button class="btn" onclick="Review.openImport()">导入备份</button>'
      + '</div>'
      + '</div>';
  }

  function renderProgressDash() {
    const overall = getOverallProgress();
    const days    = getDaysRemaining();
    const pct     = overall.total ? Math.round(overall.done / overall.total * 100) : 0;
    const todayStr = new Date().toISOString().slice(0,10);
    const todayTasks = plan.tasks.filter(t => t.date === todayStr);
    const todayDone  = todayTasks.filter(t => t.done).length;

    let html = '<div class="rv-dash">';
    html += '<div class="rv-dash-row">';
    html += '<div class="rv-dash-card">'
      + '<div class="rv-dash-num">' + days + '</div>'
      + '<div class="rv-dash-label">剩余天数</div></div>';
    html += '<div class="rv-dash-card">'
      + '<div class="rv-dash-num">' + pct + '<span class="rv-dash-unit">%</span></div>'
      + '<div class="rv-dash-label">总体进度</div></div>';
    html += '<div class="rv-dash-card">'
      + '<div class="rv-dash-num">' + todayDone + '/' + todayTasks.length + '</div>'
      + '<div class="rv-dash-label">今日任务</div></div>';
    html += '</div>';

    // Per-subject bars
    const todayForCountdown = new Date(); todayForCountdown.setHours(0,0,0,0);
    html += '<div class="rv-subj-bars">';
    SUBJECTS.forEach(s => {
      const h = calcSubjectHours(s.id);
      if (h.count === 0) return;
      const donePct     = h.totalMins ? Math.round(h.doneMins / h.totalMins * 100) : 0;
      const doneH       = (h.doneMins/60).toFixed(1);
      const totalH      = (h.totalMins/60).toFixed(1);
      const remainH     = Math.max(0, s.targetHours - h.doneMins/60).toFixed(1);
      let countdownHtml = '';
      if (s.examDate) {
        const examDay = new Date(s.examDate); examDay.setHours(0,0,0,0);
        const daysLeft = Math.ceil((examDay - todayForCountdown) / 86400000);
        const urgent   = daysLeft <= 3;
        const color    = daysLeft <= 0 ? 'var(--red)' : urgent ? 'var(--orange,#e09b4d)' : 'var(--text3)';
        const label    = daysLeft <= 0 ? '已考' : daysLeft + '天后';
        countdownHtml  = '<div class="rv-bar-countdown" style="color:' + color + '">'
          + label + ' · 剩' + remainH + 'h</div>';
      }
      html += '<div class="rv-bar-row">'
        + '<div class="rv-bar-label">'
        + '<span class="rv-bar-dot" style="background:' + s.color + '"></span>'
        + s.short + '</div>'
        + '<div class="rv-bar-track">'
        + '<div class="rv-bar-fill" data-w="' + donePct + '" style="width:0%;background:' + s.color + '"></div></div>'
        + '<div class="rv-bar-meta">'
        + '<div class="rv-bar-val">' + doneH + '/' + totalH + 'h</div>'
        + countdownHtml
        + '</div></div>';
    });
    html += '</div></div>';
    return html;
  }

  function renderFilters() {
    let html = '<div class="rv-filters">';
    html += '<button class="rv-filter-btn' + (filterSubject==='all' ? ' active' : '') + '" onclick="Review.setFilter(\'all\')">全部</button>';
    SUBJECTS.forEach(s => {
      const count = plan.tasks.filter(t => t.subjectId === s.id).length;
      if (!count) return;
      html += '<button class="rv-filter-btn' + (filterSubject===s.id ? ' active' : '') + '" '
        + 'style="--fc:' + s.color + '" onclick="Review.setFilter(\'' + s.id + '\')">'
        + s.icon + ' ' + s.short + '</button>';
    });
    html += '</div>';
    return html;
  }

  function renderAiBar() {
    return '<div class="rv-ai-bar">'
      + '<div class="rv-ai-status" id="rvAiStatus" style="display:none"></div>'
      + '<div class="rv-ai-actions">'
      + '<button class="btn btn-sm rv-ai-btn" onclick="Review.openReschedule()">🤖 智能调整</button>'
      + '<button class="btn btn-sm" onclick="Review.openAddTask()">＋ 添加任务</button>'
      + '<button class="btn btn-sm" onclick="Review.openSubjects()">科目</button>'
      + '<button class="btn btn-sm" onclick="Review.exportData()">导出</button>'
      + '<button class="btn btn-sm" onclick="Review.syncToCalendar()">↗ 同步日历</button>'
      + '</div></div>';
  }

  function renderTimeline(today) {
    // Group tasks by date
    const byDate = {};
    let tasks = plan.tasks;
    if (filterSubject !== 'all') tasks = tasks.filter(t => t.subjectId === filterSubject);
    tasks.forEach(t => { (byDate[t.date] = byDate[t.date] || []).push(t); });

    // Sort dates
    const dates = Object.keys(byDate).sort();
    const weekDays = ['日','一','二','三','四','五','六'];

    let html = '<div class="rv-timeline">';
    dates.forEach(date => {
      const d = new Date(date + 'T00:00:00');
      const wd = weekDays[d.getDay()];
      const isPast   = date < today;
      const isTodayD = date === today;
      const tasks    = byDate[date].sort((a,b) => a.start.localeCompare(b.start));
      const allDone  = tasks.every(t => t.done);
      const overdue  = tasks.some(t => isOverdue(t));

      html += '<div class="rv-day' + (isTodayD ? ' today' : '') + (isPast ? ' past' : '') + '" id="rv-day-' + date + '">';
      html += '<div class="rv-day-head">'
        + '<div class="rv-day-date">'
        + '<span class="rv-day-md">' + (d.getMonth()+1) + '/' + d.getDate() + '</span>'
        + '<span class="rv-day-wd">周' + wd + '</span>'
        + (isTodayD ? '<span class="rv-day-today-badge">今天</span>' : '')
        + '</div>'
        + '<div class="rv-day-status">'
        + (allDone ? '<span class="rv-status-done">✓ 全部完成</span>' : '')
        + (overdue && !allDone ? '<span class="rv-status-overdue">有过期任务</span>' : '')
        + '</div></div>';

      tasks.forEach(task => {
        const s = SUBJECT_MAP[task.subjectId] || {};
        const mins = calcMins(task.start, task.end);
        const od = isOverdue(task);
        html += '<div class="rv-task' + (task.done ? ' done' : '') + (od ? ' overdue' : '') + '" data-id="' + task.id + '">'
          + '<div class="rv-task-color" style="background:' + (s.color||'#888') + '"></div>'
          + '<div class="rv-task-body">'
          + '<div class="rv-task-top">'
          + '<div class="rv-task-name">' + esc(task.name) + '</div>'
          + '<button class="rv-task-check' + (task.done ? ' checked' : '') + '" onclick="event.stopPropagation();Review.toggleDone(' + task.id + ')">'
          + (task.done ? '✓' : '') + '</button></div>'
          + '<div class="rv-task-meta">'
          + '<span class="rv-task-time">' + task.start + '–' + task.end + '</span>'
          + '<span class="rv-task-dur">' + (mins >= 60 ? (mins/60).toFixed(1) + 'h' : mins + '分') + '</span>'
          + '<span class="rv-task-subj" style="color:' + (s.color||'#888') + '">' + (s.icon||'') + ' ' + (s.short||'') + '</span>'
          + '</div>'
          + (task.desc ? '<div class="rv-task-desc">' + esc(task.desc) + '</div>' : '')
          + '</div>'
          + '<div class="rv-task-actions">'
          + '<button class="rv-task-act" onclick="event.stopPropagation();Review.openEditTask(' + task.id + ')" title="编辑">✎</button>'
          + '<button class="rv-task-act del" onclick="event.stopPropagation();Review.confirmDelete(' + task.id + ')" title="删除">✕</button>'
          + '</div></div>';
      });
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  /* ══ Local import / export and subject management ══ */
  function importData(data) {
    const source = data?.reviewPlan || data;
    if (!source || !Array.isArray(source.subjects) || !Array.isArray(source.tasks)) {
      throw new Error('文件中缺少 reviewPlan.subjects 或 reviewPlan.tasks');
    }

    setSubjects(source.subjects);
    const validSubjectIds = new Set(SUBJECTS.map(subject => subject.id));
    const tasks = source.tasks
      .filter(task => task && validSubjectIds.has(String(task.subjectId || '')))
      .filter(task => /^\d{4}-\d{2}-\d{2}$/.test(task.date || ''))
      .filter(task => /^\d{2}:\d{2}$/.test(task.start || '') && /^\d{2}:\d{2}$/.test(task.end || ''))
      .map((task, index) => ({
        id: index + 1,
        subjectId: String(task.subjectId),
        date: task.date,
        start: task.start,
        end: task.end,
        name: String(task.name || '复习任务').slice(0, 100),
        desc: String(task.desc || '').slice(0, 1000),
        done: Boolean(task.done),
        gcalId: task.gcalId ? String(task.gcalId) : null,
      }));

    plan = {
      tasks,
      subjects: SUBJECTS,
      version: 3,
      created: source.created || new Date().toISOString(),
    };
    savePlan();

    if (typeof data?.planningRules === 'string') {
      App.store.cfg.planningRules = data.planningRules.slice(0, 6000);
      App.saveState();
      const rulesEl = document.getElementById('planningRules');
      if (rulesEl) rulesEl.value = App.store.cfg.planningRules;
    }
    filterSubject = 'all';
    render();
    return { subjectCount: SUBJECTS.length, taskCount: tasks.length };
  }

  function openImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const result = importData(JSON.parse(await file.text()));
        UI.toast(`已导入 ${result.subjectCount} 个科目、${result.taskCount} 个任务`, 'success');
      } catch(e) {
        UI.toast('导入失败：' + e.message, 'error');
      }
    };
    input.click();
  }

  function exportData() {
    loadPlan();
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      planningRules: App.store.cfg.planningRules || '',
      reviewPlan: {
        version: 3,
        created: plan.created,
        subjects: SUBJECTS.map(subject => ({ ...subject })),
        tasks: plan.tasks.map(task => ({ ...task })),
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'smart-calendar-personal-config-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    UI.toast('个人配置已导出，请妥善保管', 'success');
  }

  function openSubjects() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay open';
    modal.id = 'subjectsModal';
    modal.onclick = event => { if (event.target === modal) modal.remove(); };
    const rows = SUBJECTS.length
      ? SUBJECTS.map(subject => '<div class="settings-row">'
        + '<div><div class="settings-lbl"><span style="color:' + subject.color + '">' + esc(subject.icon) + '</span> '
        + esc(subject.name) + '</div><div class="settings-sub">考试 ' + esc(subject.examDate || '未设置')
        + ' · 目标 ' + subject.targetHours + 'h</div></div>'
        + '<button class="btn btn-sm" onclick="Review.removeSubject(\'' + subject.id + '\')">删除</button></div>')
        .join('')
      : '<div class="settings-sub">尚未添加科目。</div>';
    modal.innerHTML = '<div class="modal" onclick="event.stopPropagation()">'
      + '<div class="modal-title">复习科目</div>' + rows
      + '<div style="display:flex;gap:8px;margin-top:12px">'
      + '<button class="btn btn-primary" onclick="Review.openAddSubject()">添加科目</button>'
      + '<button class="btn" onclick="this.closest(\'.modal-overlay\').remove()">关闭</button>'
      + '</div></div>';
    document.body.appendChild(modal);
  }

  function openAddSubject() {
    document.getElementById('subjectsModal')?.remove();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay open';
    modal.id = 'addSubjectModal';
    modal.onclick = event => { if (event.target === modal) modal.remove(); };
    modal.innerHTML = '<div class="modal" onclick="event.stopPropagation()">'
      + '<div class="modal-title">添加复习科目</div>'
      + '<div class="rv-form-row"><label>科目名称</label><input class="form-input" id="subjectName" maxlength="30" placeholder="例如：科目 A"></div>'
      + '<div class="rv-form-row"><label>简称</label><input class="form-input" id="subjectShort" maxlength="6" placeholder="例如：A"></div>'
      + '<div class="rv-form-row"><label>考试日期</label><input class="form-input" type="date" id="subjectExamDate"></div>'
      + '<div class="rv-form-row"><label>考试时间（可选）</label><input class="form-input" id="subjectExamTime" maxlength="30" placeholder="例如：09:00–11:00"></div>'
      + '<div class="rv-form-row"><label>目标复习时长（小时）</label><input class="form-input" type="number" id="subjectTargetHours" min="0.5" max="500" step="0.5" value="10"></div>'
      + '<div class="rv-form-row"><label>图标</label><input class="form-input" id="subjectIcon" maxlength="4" value="📘"></div>'
      + '<div style="display:flex;gap:8px;margin-top:12px">'
      + '<button class="btn btn-primary" onclick="Review._doAddSubject()">保存</button>'
      + '<button class="btn" onclick="this.closest(\'.modal-overlay\').remove()">取消</button>'
      + '</div></div>';
    document.body.appendChild(modal);
  }

  function _doAddSubject() {
    const name = document.getElementById('subjectName').value.trim();
    const examDate = document.getElementById('subjectExamDate').value;
    const targetHours = Number(document.getElementById('subjectTargetHours').value);
    if (!name) { UI.toast('请输入科目名称', 'error'); return; }
    if (!examDate) { UI.toast('请选择考试日期', 'error'); return; }
    const id = 'subject-' + Date.now().toString(36);
    const subject = normalizeSubject({
      id,
      name,
      short: document.getElementById('subjectShort').value.trim() || name.slice(0, 2),
      examDate,
      examTime: document.getElementById('subjectExamTime').value.trim(),
      targetHours,
      icon: document.getElementById('subjectIcon').value.trim() || '📘',
      color: SUBJECT_COLORS[SUBJECTS.length % SUBJECT_COLORS.length],
    }, SUBJECTS.length);
    setSubjects([...SUBJECTS, subject]);
    savePlan();
    document.getElementById('addSubjectModal')?.remove();
    render();
    UI.toast('科目已保存到本设备', 'success');
  }

  function removeSubject(subjectId) {
    if (plan.tasks.some(task => task.subjectId === subjectId)) {
      UI.toast('该科目仍有任务，请先删除或修改相关任务', 'error');
      return;
    }
    setSubjects(SUBJECTS.filter(subject => subject.id !== subjectId));
    savePlan();
    document.getElementById('subjectsModal')?.remove();
    openSubjects();
  }

  /* ══ UI Actions ══ */
  function setFilter(subj) {
    filterSubject = subj;
    render();
  }

  function confirmDelete(taskId) {
    const task = plan.tasks.find(t => t.id === taskId);
    if (!task) return;
    if (confirm('删除任务「' + task.name + '」？')) {
      deleteTask(taskId);
    }
  }

  function openReschedule() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay open';
    modal.id = 'rescheduleModal';
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = '<div class="modal" onclick="event.stopPropagation()">'
      + '<div class="modal-title">🤖 智能调整</div>'
      + '<div style="font-size:13px;color:var(--text2);margin-bottom:12px">告诉 AI 你的情况，它会自动重新安排后续任务。</div>'
      + '<textarea class="form-input rv-reschedule-input" id="rescheduleInput" rows="3" '
      + 'placeholder="例如：明天下午有临时安排，需要空出 14:00-16:00\n或：科目 A 进度较快，想多分配时间给科目 B"></textarea>'
      + '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">'
      + '<button class="btn btn-primary" onclick="Review._doReschedule()">AI 调整</button>'
      + '<button class="btn" onclick="this.closest(\'.modal-overlay\').remove();Review.localReschedule()" style="background:var(--accent2,#5dba8a);color:#fff">本地直接重排</button>'
      + '<button class="btn" onclick="this.closest(\'.modal-overlay\').remove()">取消</button>'
      + '</div></div>';
    document.body.appendChild(modal);
  }

  async function _doReschedule() {
    const input = document.getElementById('rescheduleInput');
    const reason = input?.value?.trim();
    if (!reason) { UI.toast('请输入调整原因', 'error'); return; }
    const modal = document.getElementById('rescheduleModal');
    if (modal) modal.remove();
    await smartReschedule(reason);
  }

  function openAddTask() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay open';
    modal.id = 'addTaskModal';
    modal.onclick = e => { if (e.target === modal) modal.remove(); };

    const subjOptions = SUBJECTS.map(s =>
      '<option value="' + s.id + '">' + s.icon + ' ' + s.name + '</option>'
    ).join('');

    const today = new Date().toISOString().slice(0,10);
    modal.innerHTML = '<div class="modal" onclick="event.stopPropagation()">'
      + '<div class="modal-title">添加复习任务</div>'
      + '<div class="rv-form-row"><label>科目</label><select class="form-input" id="addSubj">' + subjOptions + '</select></div>'
      + '<div class="rv-form-row"><label>日期</label><input class="form-input" type="date" id="addDate" value="' + today + '"></div>'
      + '<div class="rv-form-row" style="display:flex;gap:8px"><div style="flex:1"><label>开始</label><input class="form-input" type="time" id="addStart" value="19:00"></div>'
      + '<div style="flex:1"><label>结束</label><input class="form-input" type="time" id="addEnd" value="21:00"></div></div>'
      + '<div class="rv-form-row"><label>任务名</label><input class="form-input" id="addName" placeholder="例如：科目 A-模拟题第3套"></div>'
      + '<div class="rv-form-row"><label>备注</label><input class="form-input" id="addDesc" placeholder="可选"></div>'
      + '<div style="display:flex;gap:8px;margin-top:12px">'
      + '<button class="btn btn-primary" onclick="Review._doAddTask()">添加</button>'
      + '<button class="btn" onclick="this.closest(\'.modal-overlay\').remove()">取消</button>'
      + '</div></div>';
    document.body.appendChild(modal);
  }

  function _doAddTask() {
    const subj  = document.getElementById('addSubj').value;
    const date  = document.getElementById('addDate').value;
    const start = document.getElementById('addStart').value;
    const end   = document.getElementById('addEnd').value;
    const name  = document.getElementById('addName').value.trim();
    const desc  = document.getElementById('addDesc').value.trim();
    if (!name) { UI.toast('请输入任务名', 'error'); return; }
    if (!date || !start || !end) { UI.toast('请填写完整时间', 'error'); return; }
    document.getElementById('addTaskModal')?.remove();
    addTask(subj, date, start, end, name, desc);
  }

  function openEditTask(taskId) {
    const task = plan.tasks.find(t => t.id === taskId);
    if (!task) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay open';
    modal.id = 'editTaskModal';
    modal.onclick = e => { if (e.target === modal) modal.remove(); };

    const subjOptions = SUBJECTS.map(s =>
      '<option value="' + s.id + '"' + (s.id === task.subjectId ? ' selected' : '') + '>' + s.icon + ' ' + s.name + '</option>'
    ).join('');

    modal.innerHTML = '<div class="modal" onclick="event.stopPropagation()">'
      + '<div class="modal-title">编辑任务</div>'
      + '<div class="rv-form-row"><label>科目</label><select class="form-input" id="editSubj">' + subjOptions + '</select></div>'
      + '<div class="rv-form-row"><label>日期</label><input class="form-input" type="date" id="editDate" value="' + task.date + '"></div>'
      + '<div class="rv-form-row" style="display:flex;gap:8px"><div style="flex:1"><label>开始</label><input class="form-input" type="time" id="editStart" value="' + task.start + '"></div>'
      + '<div style="flex:1"><label>结束</label><input class="form-input" type="time" id="editEnd" value="' + task.end + '"></div></div>'
      + '<div class="rv-form-row"><label>任务名</label><input class="form-input" id="editName" value="' + esc(task.name) + '"></div>'
      + '<div class="rv-form-row"><label>备注</label><input class="form-input" id="editDesc" value="' + esc(task.desc||'') + '"></div>'
      + '<div style="display:flex;gap:8px;margin-top:12px">'
      + '<button class="btn btn-primary" onclick="Review._doEditTask(' + taskId + ')">保存</button>'
      + '<button class="btn" onclick="this.closest(\'.modal-overlay\').remove()">取消</button>'
      + '</div></div>';
    document.body.appendChild(modal);
  }

  async function _doEditTask(taskId) {
    const changes = {
      subjectId: document.getElementById('editSubj').value,
      date:  document.getElementById('editDate').value,
      start: document.getElementById('editStart').value,
      end:   document.getElementById('editEnd').value,
      name:  document.getElementById('editName').value.trim(),
      desc:  document.getElementById('editDesc').value.trim(),
    };
    if (!changes.name) { UI.toast('请输入任务名', 'error'); return; }
    document.getElementById('editTaskModal')?.remove();
    updateTask(taskId, changes);

    const task = plan.tasks.find(t => t.id === taskId);
    if (task?.gcalId) {
      try {
        const s = SUBJECT_MAP[task.subjectId];
        const summary = (s && s.id !== '其他') ? '#学习 ' + task.name : task.name;
        const mins = Cal.calcMins(task.start, task.end);
        const base = (task.desc || '').trim();
        await Cal.updateEvent(task.gcalId, {
          summary,
          start: task.date + 'T' + task.start + ':00',
          end:   task.date + 'T' + task.end   + ':00',
          description: (base ? base + '\n' : '') + '预估时长：' + mins + '分钟\n标签：学习',
        });
        UI.toast('已更新，日历同步完成', 'success');
      } catch(e) {
        UI.toast('本地已更新，日历同步失败', 'error');
      }
    } else {
      UI.toast('已更新', 'success');
    }
  }

  function generate() {
    if (!SUBJECTS.length) {
      UI.toast('请先添加科目和考试日期', 'info');
      openSubjects();
      return;
    }
    if (hasPlan() && !confirm('已有复习计划，重新生成将覆盖。继续？')) return;
    const result = generateDefaultPlan();
    const suffix = result.skippedSubjects ? `，${result.skippedSubjects} 个科目因缺少有效未来考试日期未生成` : '';
    UI.toast(`已生成 ${result.taskCount} 个复习任务${suffix}`, result.taskCount ? 'success' : 'info');
    render();
  }

  /* ══ Local reschedule (no AI) ══
     Moves all overdue undone tasks to the earliest available slot
     starting from today, keeping their original start/end times.
  */
  async function localReschedule() {
    const today = new Date().toISOString().slice(0, 10);

    const overdue = plan.tasks
      .filter(t => !t.done && t.date < today)
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

    if (!overdue.length) { UI.toast('没有过期任务需要重排', 'info'); return; }

    // Load course events from Google Calendar to avoid class time slots
    const rangeEnd = new Date(today);
    rangeEnd.setDate(rangeEnd.getDate() + 50);
    const courseBlocks = {}; // date → [{start, end}]
    try {
      const calEvents = await Cal.loadEventsRange(today, rangeEnd.toISOString().slice(0, 10));
      calEvents.filter(e => e.tag === '课程').forEach(e => {
        const d = (e.start || '').slice(0, 10);
        const s = (e.start || '').slice(11, 16);
        const en = (e.end  || '').slice(11, 16);
        if (!d || !s || !en) return;
        if (!courseBlocks[d]) courseBlocks[d] = [];
        courseBlocks[d].push({ start: s, end: en });
      });
    } catch(e) { /* proceed without course check if Calendar unavailable */ }

    function overlapsClass(dateStr, taskStart, taskEnd) {
      return (courseBlocks[dateStr] || []).some(c => taskStart < c.end && taskEnd > c.start);
    }

    // Build occupied (date|start) set from already-scheduled future tasks
    const overdueIds = new Set(overdue.map(t => t.id));
    const occupied = new Set(
      plan.tasks
        .filter(t => t.date >= today && !overdueIds.has(t.id))
        .map(t => t.date + '|' + t.start)
    );

    // Assign each overdue task to earliest free slot that doesn't overlap class time
    // and doesn't exceed the subject's exam date.
    let forced = 0;
    for (const task of overdue) {
      const subj    = SUBJECT_MAP[task.subjectId];
      const deadline = subj?.examDate || null;
      const d = new Date(today);
      while (true) {
        const dateStr = d.toISOString().slice(0, 10);
        // Ran out of valid days before exam — force onto the day before exam
        if (deadline && dateStr >= deadline) {
          const lastDay = new Date(deadline);
          lastDay.setDate(lastDay.getDate() - 1);
          task.date = lastDay.toISOString().slice(0, 10);
          occupied.add(task.date + '|' + task.start);
          forced++;
          break;
        }
        if (!occupied.has(dateStr + '|' + task.start) && !overlapsClass(dateStr, task.start, task.end)) {
          task.date = dateStr;
          occupied.add(dateStr + '|' + task.start);
          break;
        }
        d.setDate(d.getDate() + 1);
      }
    }

    savePlan();
    render();

    // Sync new dates to Google Calendar for already-synced tasks
    const synced = overdue.filter(t => t.gcalId);
    if (!synced.length) {
      const base = '已重排 ' + overdue.length + ' 个过期任务';
      UI.toast(forced ? base + '（' + forced + ' 个因时间紧迫安排在考前最后一天）' : base, forced ? 'info' : 'success');
      return;
    }

    const toast = UI.toast('重排完成，正在更新日历中 ' + synced.length + ' 个事件...', 'loading', 0);
    let ok = 0, fail = 0;
    for (const task of synced) {
      try {
        await Cal.updateEvent(task.gcalId, {
          start: task.date + 'T' + task.start + ':00',
          end:   task.date + 'T' + task.end   + ':00',
        });
        ok++;
      } catch(e) {
        fail++;
      }
    }
    toast.remove();
    const base2 = '已重排 ' + overdue.length + ' 个任务，日历更新 ' + ok + ' 个' + (fail ? '，' + fail + ' 个失败' : '');
    const msg = forced ? base2 + '（' + forced + ' 个安排在考前最后一天）' : base2;
    UI.toast(msg, fail ? 'error' : 'success');
  }

  function resetPlan() {
    if (confirm('确定清空全部复习计划？此操作不可撤销。')) {
      plan = { tasks: [], subjects: SUBJECTS, version: 3, created: null };
      savePlan();
      render();
      UI.toast('计划已清空', 'info');
    }
  }

  /* ══ Init ══ */
  function init() {
    loadPlan();
  }

  return {
    init, render, generate, resetPlan,
    openImport, importData, exportData,
    openSubjects, openAddSubject, _doAddSubject, removeSubject,
    localReschedule,
    toggleDone, deleteTask, confirmDelete,
    setFilter, openReschedule, _doReschedule,
    openAddTask, _doAddTask,
    openEditTask, _doEditTask,
    syncToCalendar, smartReschedule,
    hasPlan, SUBJECTS, SUBJECT_MAP,
  };
})();
