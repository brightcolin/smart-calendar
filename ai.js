/* ═══════════════════════════════════════════════════
   ai.js — Natural language interface + Secretary brain
   • create / modify / query / plan — all in one chat
   • Secretary rules for intelligent scheduling
   • No confirm cards for simple ops; undo toast instead
   • Inline result cards in chat (no page switching)
═══════════════════════════════════════════════════ */

const AI = (() => {
  const DS_BASE  = 'https://api.deepseek.com/v1/chat/completions';
  const DS_MODEL = 'deepseek-chat';

  let chatHistory = [];
  let lastCreated = null;
  let lastUndo    = null;
  let dsKey       = '';
  let _pendingPlan = null;

  /* ══ DeepSeek call ══ */
  async function callDS(messages, systemPrompt, maxTokens = 1200) {
    if (!dsKey) {
      dsKey = (await Auth.loadDeepSeekKey()) || '';
      const input = document.getElementById('apiKey');
      if (!dsKey && input) dsKey = input.value.trim();
    }
    if (!dsKey) { UI.toast('请先在设置中填入 DeepSeek API Key', 'error'); throw new Error('no key'); }
    const all = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages;
    const r = await fetch(DS_BASE, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + dsKey },
      body:    JSON.stringify({ model: DS_MODEL, messages: all, max_tokens: maxTokens, temperature: 0.2 }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error?.message || r.status);
    }
    const d = await r.json();
    return d.choices?.[0]?.message?.content || '';
  }

  /* ══ Load upcoming events for plan context ══ */
  async function loadUpcomingContext(days) {
    try {
      const today = new Date();
      const end   = new Date(today);
      end.setDate(end.getDate() + (days || 3));
      const events = await Cal.loadEventsRange(
        today.toISOString().slice(0, 10),
        end.toISOString().slice(0, 10)
      );
      if (!events.length) return '（未来' + (days||3) + '天暂无已知活动）';
      return events.map((e, i) => {
        const d = e.start ? new Date(e.start) : null;
        const dateStr = d ? d.toISOString().slice(0, 10) : '?';
        const timeStr = fmtEventTime(e);
        return (i+1) + '. ' + dateStr + ' ' + timeStr + ' "' + e.name + '"'
          + (e.tag && e.tag !== '其他' ? ' #' + e.tag : '')
          + (e.done ? ' [已完成]' : '');
      }).join('\n');
    } catch(e) { return '（加载失败）'; }
  }

  /* ══ System prompt — with secretary rules ══ */
  function buildSystemPrompt() {
    const cfg      = App.store.cfg;
    const now      = new Date();
    const today    = Cal.todayStr();
    const nowStr   = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    const tz       = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const weekDays = ['日','一','二','三','四','五','六'];
    const todayWeekday = weekDays[now.getDay()];

    const dateRef = [];
    for (let i = -7; i < 14; i++) {
      const d = new Date(now); d.setDate(d.getDate() + i);
      dateRef.push(d.toISOString().slice(0,10) + '(周' + weekDays[d.getDay()] + ')');
    }

    const todayList = (App.todayEvents || []).map((e, i) =>
      (i+1) + '. "' + e.name + '" ' + fmtEventTime(e)
        + (e.tag && e.tag !== '其他' ? ' #' + e.tag : '')
        + (e.done ? ' [已完成]' : '')
    ).join('\n') || '（今日暂无已知活动）';

    const lastCtx = lastCreated
      ? '\n【最近创建】"' + lastCreated.name + '" ' + lastCreated.date + ' ' + lastCreated.start + '–' + lastCreated.end
      : '';

    return `你是智能日历助手兼私人秘书，支持创建、修改、查询、规划 Google Calendar 活动。
你不仅执行指令，还会根据秘书守则做出智能判断。

【基本信息】
今天：${today}（周${todayWeekday}），当前时间：${nowStr}，时区：${tz}
默认提前提醒：${cfg.defReminder||10}分钟，方式：${cfg.defReminderMethod||'popup'}
日期参考（含过去7天）：${dateRef.join(' | ')}

【今日活动】
${todayList}${lastCtx}

【标签】学习|课程|科研|社工|运动|娱乐|工作|其他
格式：#标签 活动名（如 "#工作 写周报"），标签为"其他"时直接写活动名

═══════ 秘书守则 ═══════

【作息框架】
- 周一/二/三起床7:00，周四至周日起床8:00
- 最早可安排任务：起床后30分钟
- 午休区（勿安排）：12:15–13:30
- 12:30和23:30有固定"信息"提醒，不可覆盖
- 运动窗口（优先保留）：17:00–18:00
- 晚间主力学习区：19:00–23:00
- 硬截止：00:00，绝不安排跨午夜任务

【课程表（固定不可移动）】
周一：08:00-09:35物理 | 09:50-12:15微积分 | 13:30-15:05心理训练
周二：08:00-09:35近现代史 | 09:50-11:25英语读写 | 13:30-15:05 OOP
周三：08:00-09:35微积分 | 13:30-15:05英语听说
周四：09:50-12:15物理
周五：09:50-11:25体育 | 13:30-15:05高代 | 19:25-20:55微积分习题课

【可用空闲时段（按优先级）】
1. 周四下午13:30-17:00（最大连续空闲块，适合深度任务）
2. 周末全天（需保留运动时间）
3. 周三上午10:00-12:15
4. 周五下午15:05-17:00
5. 每天晚间19:00-23:00（主力自学区，周五有习题课占19:25-20:55）

【时间块设定】
- 标准学习单元=90-120分钟，两个单元之间至少留30分钟缓冲
- 短任务=30-45分钟，不安排超过150分钟连续任务

【时段×任务类型匹配】
- 上午课间/课后：趁热复习刚上完的课、短作业
- 下午15:00-17:00：编程作业、科研深度阅读、项目工作
- 晚间19:00-21:00：高强度学习（微积分、物理、编程）
- 晚间21:00-23:00：中低强度（论文阅读、项目推广、自媒体）
- 22:00之后：仅轻度任务（阅读、信息整理）

【优先级排序（考试季）】
1. 课程复习和作业（微积分>物理>高代>英语>其他）
2. 科研（论文阅读、导师沟通）
3. 竞赛/项目（RoboMaster、黑客松）
4. 自媒体/项目推广
5. 杂事和社交

【六条主线每周目标】
学习：弹性，考试季30h+ | 科研（强化学习）：6-8h，需连续2h+深度块
RoboMaster视控组：待定 | 自媒体/项目推广：3-4h，每2-3天1次1h
竞赛：3-5h | 运动：3-4h，下午17:00-18:00

═══════ 输出规则 ═══════

只输出合法 JSON，不输出任何其他文字。

━━━ 创建 ━━━
{"action":"create","task":{"name":"活动名（30字内，不含#标签）","tag":"标签","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","reminder":分钟数,"reminderMethod":"popup|email","description":"备注或空字符串"},"summary":"一句话确认（24小时制）"}

创建时须遵守秘书守则：
- 用户只说"安排物理复习"不说时间→根据当前星期几和课程表自动选最优空闲时段
- 检查是否与课程/已有事件冲突
- 遵守时段×任务类型匹配规则
- 尊重午休区、运动窗口等保护时段

━━━ 修改 ━━━
{"action":"modify","intent":"reschedule|complete|delete|update","target":"活动名关键词","searchDate":"YYYY-MM-DD（可选）","changes":{"start":"HH:MM","end":"HH:MM","date":"YYYY-MM-DD","tag":"新标签","description":"新描述","reminder":分钟数,"reminderMethod":"popup|email"},"summary":"一句话说明"}

━━━ 查询 ━━━
{"action":"query","range":"today|tomorrow|this_week|date","date":"YYYY-MM-DD（range=date时填）","summary":"正在查询什么"}

━━━ 规划 ━━━
用户说"帮我规划/安排一下明天/这周"或列出多个任务要排进日历时：
{"action":"plan","tasks":[
  {"name":"活动名","tag":"标签","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","reminder":10,"reminderMethod":"popup","description":"备注"},
  ...
],"reasoning":"排期思路：为什么这样排，考虑了哪些冲突和规则","summary":"一句话概述"}

规划时须严格遵守秘书守则，说明排期理由。

━━━ 反问 ━━━
{"action":"ask","question":"问题"}

━━━ 时间解析 ━━━
相对日期：今天=${today}，明天/后天依次+1，本周X/下周X查日期参考
模糊时间：早上→08:00，上午→09:00，中午→12:00，下午→14:00，傍晚→18:00，晚上→19:00，深夜→22:00
模糊时长：半小时→30分，一小时→60分，一个半→90分，没说→反问

━━━ 防误判 ━━━
1. "今天下午做某事" → 创建，不是修改
2. 只有明确说"改/推迟/删除/完成+活动名" → 修改
3. 上轮刚创建，用户说"帮刚才那个加备注" → 修改lastCreated
4. 所有时间用24小时制
5. "帮我规划/安排一下" → plan动作，不是create`;
  }

  /* ══ Chat UI ══ */
  function initChat() {
    chatHistory = [];
    lastCreated = null;
    lastUndo    = null;
    _pendingPlan = null;
    const area    = document.getElementById('chatArea');
    const confirm = document.getElementById('confirmArea');
    if (area)    area.innerHTML    = '';
    if (confirm) confirm.innerHTML = '';
    addAIBubble(
      '你好！我是你的私人秘书。直接告诉我要安排什么，我会根据你的课表和偏好智能排期。\n\n'
      + '例如：\n'
      + '「安排物理复习」自动找最优时段\n'
      + '「帮我规划明天」批量安排整天\n'
      + '「今天有什么安排？」\n'
      + '「把今天的会议推迟到16:00」'
    );
  }

  function addAIBubble(text, thinking = false) {
    const area = document.getElementById('chatArea');
    if (!area) return null;
    const el = document.createElement('div');
    el.className = 'msg msg-ai';
    el.innerHTML = '<div class="msg-avatar">◎</div><div class="bubble '
      + (thinking ? 'bubble-thinking' : 'bubble-ai') + '">'
      + esc(text).replace(/\n/g, '<br>') + '</div>';
    area.appendChild(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    return el;
  }

  function addUserBubble(text) {
    const area = document.getElementById('chatArea');
    if (!area) return;
    const el = document.createElement('div');
    el.className = 'msg msg-user';
    el.innerHTML = '<div class="bubble bubble-user">'
      + esc(text).replace(/\n/g, '<br>') + '</div><div class="msg-avatar">你</div>';
    area.appendChild(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function addThinkingBubble() {
    const area = document.getElementById('chatArea');
    if (!area) return null;
    const el = document.createElement('div');
    el.className = 'msg msg-ai';
    el.innerHTML = '<div class="msg-avatar">◎</div>'
      + '<div class="bubble bubble-thinking"><span class="spinner"></span>思考中...</div>';
    area.appendChild(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    return el;
  }

  function addResultCard(fields, actions) {
    const area = document.getElementById('chatArea');
    if (!area) return;
    const el = document.createElement('div');
    el.className = 'msg msg-ai';
    const rows = fields.map(([k, v]) =>
      '<div class="result-row"><span class="result-key">' + esc(k) + '</span>'
      + '<span class="result-val">' + v + '</span></div>'
    ).join('');
    const btns = (actions || []).map(a =>
      '<button class="btn btn-sm ' + (a.cls||'') + '" onclick="' + a.fn + '">' + esc(a.label) + '</button>'
    ).join('');
    el.innerHTML = '<div class="msg-avatar">◎</div>'
      + '<div class="result-card">'
      + rows
      + (btns ? '<div class="result-actions">' + btns + '</div>' : '')
      + '</div>';
    area.appendChild(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function addQueryResult(events, header) {
    const area = document.getElementById('chatArea');
    if (!area) return;
    const el = document.createElement('div');
    el.className = 'msg msg-ai';
    const fmt = dt => {
      if (!dt) return '—';
      const d = new Date(dt);
      return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
    };
    const items = events.map(e => {
      const tag   = e.tag && e.tag !== '其他' ? ' <span class="badge badge-' + esc(e.tag) + '">' + esc(e.tag) + '</span>' : '';
      const done  = e.done ? ' <span style="color:var(--green);font-size:11px">✓</span>' : '';
      const color = Cal.TAG_HEX[e.tag] || '#9a9690';
      return '<div class="query-item">'
        + '<span class="query-dot" style="background:' + color + '"></span>'
        + '<span class="query-time">' + fmt(e.start) + '</span>'
        + '<span class="query-name">' + esc(e.name) + tag + done + '</span>'
        + '</div>';
    }).join('');
    el.innerHTML = '<div class="msg-avatar">◎</div>'
      + '<div class="bubble bubble-ai">'
      + '<div style="font-weight:500;margin-bottom:6px">' + esc(header) + '</div>'
      + (items || '<span style="color:var(--text3)">该时间段没有安排</span>')
      + '</div>';
    area.appendChild(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  /* ══ Send message ══ */
  async function sendMessage() {
    const input = document.getElementById('chatInput');
    const text  = input?.value.trim();
    if (!text) return;

    // Handle pending plan confirmation
    if (_pendingPlan && /^(确认|好|行|可以|是|ok|yes|创建|执行)/i.test(text)) {
      input.value = '';
      autoResize(input);
      addUserBubble(text);
      const tasks = _pendingPlan;
      _pendingPlan = null;
      await executePlan(tasks);
      return;
    }
    if (_pendingPlan && /^(调整|不|取消|重新|算了|no)/i.test(text)) {
      _pendingPlan = null;
      // Fall through to normal flow
    }

    input.value = '';
    autoResize(input);
    addUserBubble(text);
    chatHistory.push({ role: 'user', content: text });
    if (chatHistory.length > 30) chatHistory = chatHistory.slice(-30);

    const thinkEl = addThinkingBubble();
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.disabled = true;
    try {
      // For plan requests, load upcoming events into context
      const isPlanLike = /规划|安排.{0,4}(明天|后天|这周|下周|今天)|排.{0,2}计划|批量/.test(text);
      let extraContext = '';
      if (isPlanLike) {
        const upcoming = await loadUpcomingContext(7);
        extraContext = '\n\n【未来7天已有活动】\n' + upcoming;
      }

      const prompt = buildSystemPrompt() + extraContext;
      const reply = await callDS(chatHistory, prompt);
      if (thinkEl) thinkEl.remove();
      chatHistory.push({ role: 'assistant', content: reply });

      let parsed;
      try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); } catch(e) { parsed = null; }

      if (!parsed) {
        addAIBubble(reply || '收到，还有其他需要吗？');
        return;
      }

      switch (parsed.action) {
        case 'ask':    addAIBubble(parsed.question); break;
        case 'create': await handleCreate(parsed);   break;
        case 'modify': await handleModify(parsed);   break;
        case 'query':  await handleQuery(parsed);    break;
        case 'plan':   await handlePlan(parsed);     break;
        default:       addAIBubble(reply || '收到，还有其他需要吗？');
      }
    } catch(e) {
      if (thinkEl) thinkEl.remove();
      if (e.message !== 'no key') addAIBubble('出现错误：' + e.message);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  /* ══ Handle CREATE ══ */
  async function handleCreate(parsed) {
    const task = parsed.task;
    if (!task) return;
    const t = UI.toast('创建中...', 'loading', 0);
    try {
      const res     = await Cal.createEvent(task);
      const estMins = Cal.calcMins(task.start, task.end);
      lastCreated = { ...task, gcalId: res.id };
      App.store.tasks.push({
        id: Date.now(), gcalId: res.id, ...task, estMins,
        done: false, actualMins: null, calendarId: Cal.activeCalendarId,
      });
      App.saveState();
      t.remove();
      const title = (task.tag && task.tag !== '其他') ? '#' + task.tag + ' ' + task.name : task.name;
      addResultCard([
        ['活动', title],
        ['日期', task.date],
        ['时间', task.start + ' – ' + task.end + '（' + estMins + '分钟）'],
        ['提醒', task.reminder + '分钟前'],
      ], [
        { label: '撤销', cls: 'btn-danger', fn: 'AI.undoCreate()' },
        { label: '查看今日', cls: '', fn: 'UI.goPage("today",document.querySelectorAll(".nav-item")[0])' },
      ]);
      // Show summary if AI auto-selected time
      if (parsed.summary) addAIBubble(parsed.summary);
      chatHistory.push({ role: 'assistant', content: JSON.stringify({ _note: 'created', name: task.name, date: task.date }) });
      await Cal.loadTodayEvents();
      CalView.refresh();
    } catch(e) {
      t.remove();
      addAIBubble('创建失败：' + e.message);
    }
  }

  /* ══ Handle MODIFY ══ */
  async function handleModify(parsed) {
    const { intent, target, changes, searchDate } = parsed;
    const t = UI.toast('处理中...', 'loading', 0);
    try {
      const fuzzy = (a, b) => {
        a = (a||'').toLowerCase(); b = (b||'').toLowerCase();
        return a.includes(b) || b.includes(a);
      };
      let match = (App.todayEvents || []).find(e =>
        fuzzy(e.name, target) || fuzzy(e.rawSummary, target)
      );
      if (!match && lastCreated && /刚|上一|这个|刚才/.test(target)) {
        match = (App.todayEvents || []).find(e => e.gcalId === lastCreated.gcalId) || lastCreated;
      }
      if (!match) {
        const results = await Cal.searchEvents(target, searchDate || Cal.todayStr());
        match = results.find(e => fuzzy(e.name, target)) || results[0];
      }
      if (!match) {
        t.remove();
        addAIBubble('在日历中找不到「' + target + '」。可以告诉我大概是哪天的活动吗？');
        return;
      }

      lastUndo = { intent, match: { ...match } };

      if (intent === 'complete') {
        const actualMins = Math.round(Math.max(0, (new Date() - new Date(match.start)) / 60000));
        await Cal.markComplete(match, actualMins);
        const local = App.store.tasks.find(x => x.gcalId === match.gcalId);
        if (local) { local.done = true; local.actualMins = actualMins; App.saveState(); }
        t.remove();
        addResultCard([
          ['✓ 已完成', match.name],
          ['实际耗时', fmtMins(actualMins)],
          ['预估耗时', fmtMins(match.estMins)],
        ]);
      } else if (intent === 'delete') {
        await Cal.deleteEvent(match.gcalId);
        App.store.tasks = App.store.tasks.filter(x => x.gcalId !== match.gcalId);
        if (lastCreated?.gcalId === match.gcalId) lastCreated = null;
        App.saveState();
        t.remove();
        addResultCard([
          ['✓ 已删除', match.name],
        ], [{ label: '撤销', cls: 'btn-danger', fn: 'AI.undoDelete()' }]);
      } else {
        const date  = changes.date  || (match.start ? match.start.slice(0,10) : Cal.todayStr());
        const start = changes.start ? date + 'T' + changes.start + ':00' : match.start;
        const end   = changes.end   ? date + 'T' + changes.end   + ':00' : match.end;
        const updates = {};
        if (start) updates.start = start;
        if (end)   updates.end   = end;
        if (changes.tag) {
          const nt = changes.tag;
          updates.summary  = (nt && nt !== '其他') ? '#' + nt + ' ' + match.name : match.name;
          updates.colorId  = Cal.TAG_COLOR[nt] || '0';
          updates.description = ((match.description||'').replace(/标签：[^\n]*/g,'').trim()) + '\n标签：' + nt;
        }
        if (changes.description && !changes.tag) updates.description = changes.description;
        if (changes.reminder != null) {
          updates.reminders = { useDefault: false, overrides: [{ method: changes.reminderMethod||'popup', minutes: changes.reminder }] };
        }
        await Cal.updateEvent(match.gcalId, updates);
        t.remove();
        const changeLines = [];
        if (changes.start || changes.end || changes.date) {
          const fmt = s => s ? new Date(s).toTimeString().slice(0,5) : '';
          changeLines.push(['新时间', date + ' ' + fmt(start) + '–' + fmt(end)]);
        }
        if (changes.tag)         changeLines.push(['新标签', '#' + changes.tag]);
        if (changes.description) changeLines.push(['描述', changes.description.slice(0,40)]);
        if (changes.reminder != null) changeLines.push(['提醒', changes.reminder + '分钟前']);
        addResultCard([['✓ 已更新', match.name], ...changeLines],
          [{ label: '撤销', cls: 'btn-danger', fn: 'AI.undoUpdate()' }]);
      }

      await Cal.loadTodayEvents();
      CalView.refresh();
    } catch(e) {
      t.remove();
      addAIBubble('操作失败：' + e.message);
    }
  }

  /* ══ Handle QUERY ══ */
  async function handleQuery(parsed) {
    const t = UI.toast('查询中...', 'loading', 0);
    try {
      const today = Cal.todayStr();
      let events = [], header = '';

      if (parsed.range === 'today') {
        events = App.todayEvents?.length ? App.todayEvents : await Cal.loadEventsRange(today, today);
        header = '今天的安排（共' + events.length + '项）';
      } else if (parsed.range === 'tomorrow') {
        const d = new Date(); d.setDate(d.getDate() + 1);
        const ds = d.toISOString().slice(0,10);
        events = await Cal.loadEventsRange(ds, ds);
        header = '明天的安排（共' + events.length + '项）';
      } else if (parsed.range === 'this_week') {
        const d = new Date(), day = d.getDay() || 7;
        d.setDate(d.getDate() - day + 1);
        const start = d.toISOString().slice(0,10);
        d.setDate(d.getDate() + 6);
        events = await Cal.loadEventsRange(start, d.toISOString().slice(0,10));
        header = '本周的安排（共' + events.length + '项）';
      } else if (parsed.range === 'date' && parsed.date) {
        events = await Cal.loadEventsRange(parsed.date, parsed.date);
        header = parsed.date + ' 的安排（共' + events.length + '项）';
      }

      t.remove();
      addQueryResult(events, header);
      chatHistory.push({ role: 'assistant', content: JSON.stringify({ _note: 'query_result', count: events.length }) });
    } catch(e) {
      t.remove();
      addAIBubble('查询失败：' + e.message);
    }
  }

  /* ══ Handle PLAN — show proposal, wait for confirmation ══ */
  async function handlePlan(parsed) {
    const { tasks, reasoning, summary } = parsed;
    if (!tasks?.length) {
      addAIBubble(reasoning || '没有需要安排的任务。');
      return;
    }

    const reasonText = '📋 ' + (summary || '规划方案') + '\n\n'
      + '💡 ' + (reasoning || '') + '\n\n'
      + tasks.map((t, i) =>
          (i+1) + '. ' + t.date + ' ' + t.start + '–' + t.end
          + ' ' + (t.tag !== '其他' ? '#' + t.tag + ' ' : '') + t.name
        ).join('\n')
      + '\n\n回复「确认」创建，或告诉我要调整什么。';

    addAIBubble(reasonText);
    _pendingPlan = tasks;
    chatHistory.push({ role: 'assistant', content: JSON.stringify({ _note: 'plan_pending', count: tasks.length }) });
  }

  /* ══ Execute confirmed plan ══ */
  async function executePlan(tasks) {
    const t = UI.toast('正在批量创建 ' + tasks.length + ' 个任务...', 'loading', 0);
    try {
      const results = await Cal.createEventsBatch(tasks);
      const okCount   = results.filter(r => r.ok).length;
      const failCount = results.filter(r => !r.ok).length;

      results.filter(r => r.ok).forEach(r => {
        const task = r.task;
        App.store.tasks.push({
          id: Date.now() + Math.random(), gcalId: r.gcalId, ...task,
          estMins: Cal.calcMins(task.start, task.end),
          done: false, actualMins: null, calendarId: Cal.activeCalendarId,
        });
      });
      App.saveState();
      t.remove();

      const lines = results.map(r =>
        r.ok
          ? ['✓ ' + (r.task.tag !== '其他' ? '#' + r.task.tag + ' ' : '') + r.task.name,
             r.task.date + ' ' + r.task.start + '–' + r.task.end]
          : ['✗ ' + r.task.name, '失败：' + r.error]
      );
      addResultCard(lines, [
        { label: '查看今日', cls: '', fn: 'UI.goPage("today",document.querySelectorAll(".nav-item")[0])' },
        { label: '查看日历', cls: '', fn: 'UI.goPage("cal",document.querySelectorAll(".nav-item")[2])' },
      ]);

      if (failCount > 0) addAIBubble('已创建 ' + okCount + ' 个，' + failCount + ' 个失败。');
      await Cal.loadTodayEvents();
      CalView.refresh();
    } catch(e) {
      t.remove();
      addAIBubble('批量创建失败：' + e.message);
    }
  }

  /* ══ Undo actions ══ */
  async function undoCreate() {
    if (!lastCreated?.gcalId) return;
    const t = UI.toast('撤销中...', 'loading', 0);
    try {
      await Cal.deleteEvent(lastCreated.gcalId);
      App.store.tasks = App.store.tasks.filter(x => x.gcalId !== lastCreated.gcalId);
      App.saveState();
      lastCreated = null;
      t.remove();
      addAIBubble('✓ 已撤销创建。');
      await Cal.loadTodayEvents(); CalView.refresh();
    } catch(e) { t.remove(); addAIBubble('撤销失败：' + e.message); }
  }

  async function undoDelete() {
    if (!lastUndo?.match) return;
    const snap = lastUndo.match;
    const t    = UI.toast('撤销中...', 'loading', 0);
    try {
      const task = {
        name: snap.name, tag: snap.tag,
        date: snap.start?.slice(0,10) || Cal.todayStr(),
        start: snap.start ? new Date(snap.start).toTimeString().slice(0,5) : '09:00',
        end:   snap.end   ? new Date(snap.end).toTimeString().slice(0,5)   : '10:00',
        reminder: 10, reminderMethod: 'popup', description: snap.description || '',
      };
      await Cal.createEvent(task);
      lastUndo = null;
      t.remove();
      addAIBubble('✓ 已撤销删除，活动已恢复。');
      await Cal.loadTodayEvents(); CalView.refresh();
    } catch(e) { t.remove(); addAIBubble('撤销失败：' + e.message); }
  }

  async function undoUpdate() {
    if (!lastUndo?.match) return;
    const snap = lastUndo.match;
    const t    = UI.toast('撤销中...', 'loading', 0);
    try {
      await Cal.updateEvent(snap.gcalId, {
        start: snap.start, end: snap.end,
        summary: snap.rawSummary || snap.name,
        description: snap.description,
      });
      lastUndo = null;
      t.remove();
      addAIBubble('✓ 已撤销修改，活动已还原。');
      await Cal.loadTodayEvents(); CalView.refresh();
    } catch(e) { t.remove(); addAIBubble('撤销失败：' + e.message); }
  }

  /* ══ Today analysis ══ */
  async function analyzeToday() {
    const box = document.getElementById('aiTodayBox');
    const txt = document.getElementById('aiTodayText');
    if (!box || !txt) return;
    box.classList.add('visible');
    txt.innerHTML = '<span class="spinner"></span>分析中...';
    const events = App.todayEvents?.length ? App.todayEvents
      : App.store.tasks.filter(t => t.date === Cal.todayStr());
    if (!events.length) { txt.textContent = '今天暂无任务数据。'; return; }
    const summary = events.map(e =>
      '- ' + (e.tag !== '其他' ? '#' + e.tag + ' ' : '') + e.name
      + '：预估' + fmtMins(e.estMins) + '，'
      + (e.done ? '已完成，实际' + fmtMins(e.actualMins) : '未完成')
    ).join('\n');
    const doneCnt = events.filter(e => e.done).length;
    try {
      const raw = await callDS(
        [{ role: 'user', content: '今天任务：\n' + summary + '\n完成率：' + doneCnt + '/' + events.length + '。分析完成情况并给3条改进建议，150字以内。' }],
        '你是时间管理顾问，用中文回答，语气温和专业。只输出纯文本，不使用任何Markdown格式。'
      );
      txt.textContent = raw.replace(/#{1,6}\s/g,'').replace(/\*\*/g,'').replace(/\*/g,'').replace(/^[-–—]\s/gm,'').replace(/`/g,'').trim();
    } catch(e) { txt.textContent = '分析失败：' + e.message; }
  }

  /* ══ Helpers ══ */
  function fmtEventTime(e) {
    if (!e?.start) return '';
    const fmt = d => d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
    return fmt(new Date(e.start)) + '–' + fmt(new Date(e.end));
  }
  function fmtMins(m) {
    if (!m && m !== 0) return '—';
    return m < 60 ? m + '分' : (m/60).toFixed(1) + 'h';
  }
  async function setKey(key) { dsKey = key; await Auth.saveDeepSeekKey(key); }
  async function loadKey() { dsKey = (await Auth.loadDeepSeekKey()) || ''; return dsKey; }

  return {
    initChat, sendMessage, analyzeToday, setKey, loadKey,
    undoCreate, undoDelete, undoUpdate,
    _pendingPlan,
  };
})();
