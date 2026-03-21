/* ═══════════════════════════════════════════════════
   ai.js — DeepSeek AI: natural language create & modify
   Enhanced: relative time, fuzzy duration, multi-turn
   memory, extended modify intents
═══════════════════════════════════════════════════ */

const AI = (() => {
  const DS_BASE  = 'https://api.deepseek.com/v1/chat/completions';
  const DS_MODEL = 'deepseek-chat';

  let chatHistory  = [];   // full conversation for multi-turn
  let pendingTask  = null;
  let lastCreated  = null; // remember last created task for follow-up edits
  let dsKey        = '';

  /* ══ DeepSeek call ══ */
  async function callDS(messages, systemPrompt, maxTokens = 900) {
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

  /* ══ System prompt ══ */
  function buildSystemPrompt() {
    const cfg      = App.store.cfg;
    const now      = new Date();
    const today    = Cal.todayStr();
    const nowStr   = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    const tz       = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const weekDays = ['日','一','二','三','四','五','六'];

    // Build 14-day calendar for AI reference
    const dateRef = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(now); d.setDate(d.getDate() + i);
      dateRef.push(d.toISOString().slice(0,10) + '(周' + weekDays[d.getDay()] + ')');
    }

    // Today's events for modify context
    const todayList = (App.todayEvents || []).map((e, i) =>
      (i+1) + '. "' + e.name + '" ' + fmtEventTime(e)
        + (e.tag && e.tag !== '其他' ? ' #' + e.tag : '')
        + (e.done ? ' [已完成]' : '')
    ).join('\n') || '（今日暂无已知活动）';

    // Last created task context for follow-up
    const lastCtx = lastCreated
      ? '最近刚创建的活动："' + lastCreated.name + '" ' + lastCreated.date + ' ' + lastCreated.start + '–' + lastCreated.end
      : '';

    return `你是智能日历助手，负责解析用户的自然语言并创建/修改 Google Calendar 活动。

【基本信息】
今天：${today}（周${weekDays[now.getDay()]}），当前时间：${nowStr}，时区：${tz}
默认提前提醒：${cfg.defReminder||10}分钟，方式：${cfg.defReminderMethod||'popup'}
未来14天参考：${dateRef.slice(0,10).join(' | ')}

【今日活动列表】（供修改时匹配）
${todayList}
${lastCtx ? '【上下文】' + lastCtx : ''}

【标签体系】
学习|课程|科研|社工|运动|娱乐|工作|其他
标题格式：#标签 活动名（如 "#工作 写周报"），标签为"其他"时直接写活动名

【输出规则】只输出合法 JSON，不输出任何其他文字。

━━━ 动作一：创建 ━━━
适用：用户要安排新活动。周期性描述只创建第一个时间点。
{
  "action": "create",
  "task": {
    "name": "活动名（30字内，不含#标签）",
    "tag": "标签",
    "date": "YYYY-MM-DD",
    "start": "HH:MM",
    "end": "HH:MM",
    "reminder": 分钟数,
    "reminderMethod": "popup|email",
    "description": "备注或空字符串"
  },
  "summary": "一句话确认（用24小时制，如：明天09:00–10:00）"
}

━━━ 动作二：修改 ━━━
适用：用户明确要改/推迟/提前/删除/完成/更新已有活动（不限今日，可跨日期）。
intent 可选值：reschedule（改时间）| complete（标记完成）| delete（删除）| update（改标签/描述/提醒）
changes 中所有字段均可选，只填需要变化的字段：
{
  "action": "modify",
  "intent": "reschedule|complete|delete|update",
  "target": "活动名关键词（尽量准确）",
  "searchDate": "YYYY-MM-DD（活动所在日期，不确定可省略）",
  "changes": {
    "start": "HH:MM",
    "end": "HH:MM",
    "date": "YYYY-MM-DD",
    "tag": "新标签",
    "description": "新描述",
    "reminder": 新提醒分钟数,
    "reminderMethod": "popup|email"
  },
  "summary": "一句话说明变化内容"
}

━━━ 动作三：反问 ━━━
适用：创建时缺少关键信息（时间或时长），一次只问一个最重要的问题。
{"action": "ask", "question": "问题"}

━━━ 时间解析规则 ━━━
相对日期：
- 今天=${today}，明天、后天依次+1天
- 本周X、下周X → 根据上方14天参考计算具体日期
- X天后 → today + X天

模糊时间：
- 早上/上午 → 08:00–12:00
- 中午 → 12:00
- 下午 → 13:00–18:00
- 傍晚/黄昏 → 18:00–19:00
- 晚上 → 19:00–22:00
- 深夜 → 22:00以后
- 没说时间 → 反问

模糊时长：
- 半小时/30分钟 → 30分钟
- 一小时/1小时/1h → 60分钟
- 一个半小时 → 90分钟
- 两小时/2小时 → 120分钟
- 大概/左右/差不多X小时 → 按X小时处理
- 没说时长 → 反问

━━━ 防误判规则 ━━━
1. 用户说"今天/明天/下午 做某事" → 创建，不是修改
2. 只有用户说"改/推迟/提前/删除/完成/更新+具体活动名" → 才是修改
3. 上一轮刚创建了活动，用户说"改一下时间"/"帮我加个描述" → 修改刚创建的活动
4. 所有输出时间用24小时制
5. 用户写了#标签优先采用，否则从内容自动判断
6. reminder/reminderMethod未提及用默认值`;
  }

  /* ══ Format event time for context ══ */
  function fmtEventTime(e) {
    if (!e.start) return '';
    const s = new Date(e.start);
    const end = new Date(e.end);
    const fmt = d => d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
    return fmt(s) + '–' + fmt(end);
  }

  /* ══ Chat UI helpers ══ */
  function initChat() {
    chatHistory = [];
    pendingTask = null;
    lastCreated = null;
    document.getElementById('chatArea').innerHTML = '';
    document.getElementById('confirmArea').innerHTML = '';
    addAIBubble(
      '你好！告诉我要安排什么，或修改已有活动。\n\n'
      + '创建示例：\n'
      + '「#工作 明天09:00开会一小时，提前15分钟提醒」\n'
      + '「下周五晚上看电影两小时」\n'
      + '「后天下午写报告，大概3小时左右」\n\n'
      + '修改示例：\n'
      + '「把今天的会议推迟到16:00」\n'
      + '「把开会标签改为#学习」\n'
      + '「标记写周报已完成」\n'
      + '「帮刚才创建的活动加一个备注：带笔记本」'
    );
  }

  function addAIBubble(text, thinking = false) {
    const area = document.getElementById('chatArea');
    const el   = document.createElement('div');
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
    const el   = document.createElement('div');
    el.className = 'msg msg-user';
    el.innerHTML = '<div class="bubble bubble-user">'
      + esc(text).replace(/\n/g, '<br>') + '</div><div class="msg-avatar">你</div>';
    area.appendChild(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function addThinkingBubble() {
    const area = document.getElementById('chatArea');
    const el   = document.createElement('div');
    el.className = 'msg msg-ai';
    el.innerHTML = '<div class="msg-avatar">◎</div>'
      + '<div class="bubble bubble-thinking"><span class="spinner"></span>思考中...</div>';
    area.appendChild(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    return el;
  }

  /* ══ Confirm card: CREATE ══ */
  function showCreateConfirm(task) {
    pendingTask = { type: 'create', task };
    const titlePreview = (task.tag && task.tag !== '其他')
      ? '#' + task.tag + ' ' + task.name
      : task.name;
    const confirm = document.getElementById('confirmArea');
    confirm.innerHTML =
      '<div class="confirm-card">'
      + '<div class="confirm-title">请确认创建信息</div>'
      + row('日历标题', '<span style="font-family:\'DM Mono\',monospace;font-size:12px;color:var(--accent)">' + esc(titlePreview) + '</span>')
      + row('类别', '<span class="badge badge-' + esc(task.tag) + '">' + esc(task.tag) + '</span>')
      + row('日期', esc(task.date))
      + row('时间', esc(task.start) + ' – ' + esc(task.end) + '（' + Cal.calcMins(task.start, task.end) + '分钟）')
      + row('提醒', task.reminder + '分钟前（' + (task.reminderMethod === 'email' ? '邮件' : '弹窗') + '）')
      + (task.description ? row('描述', esc(task.description)) : '')
      + '<div class="confirm-actions">'
      + '<button class="btn btn-primary" onclick="AI.confirmAction()">✓ 确认创建</button>'
      + '<button class="btn" onclick="AI.cancelConfirm()">修改</button>'
      + '</div></div>';
    confirm.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  /* ══ Confirm card: MODIFY ══ */
  function showModifyConfirm(intent, target, changes, summary, searchDate) {
    pendingTask = { type: 'modify', intent, target, changes, searchDate };
    const confirm = document.getElementById('confirmArea');
    const intentLabel = {
      reschedule: '修改时间',
      complete:   '标记完成',
      delete:     '删除活动',
      update:     '更新内容',
    };
    confirm.innerHTML =
      '<div class="confirm-card">'
      + '<div class="confirm-title">请确认修改操作</div>'
      + row('操作', intentLabel[intent] || intent)
      + row('目标活动', esc(target))
      + (searchDate ? row('日期范围', esc(searchDate) + ' 附近') : '')
      + (changes.date        ? row('新日期',  esc(changes.date))  : '')
      + (changes.start       ? row('新开始',  esc(changes.start)) : '')
      + (changes.end         ? row('新结束',  esc(changes.end))   : '')
      + (changes.tag         ? row('新标签',  '<span class="badge badge-' + esc(changes.tag) + '">' + esc(changes.tag) + '</span>') : '')
      + (changes.description ? row('新描述',  esc(changes.description)) : '')
      + (changes.reminder != null ? row('新提醒', changes.reminder + '分钟前') : '')
      + '<div class="confirm-actions">'
      + '<button class="btn btn-primary" onclick="AI.confirmAction()">✓ 确认</button>'
      + '<button class="btn" onclick="AI.cancelConfirm()">取消</button>'
      + '</div></div>';
    confirm.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function row(key, val) {
    return '<div class="confirm-row"><span class="confirm-key">' + key
      + '</span><span class="confirm-val">' + val + '</span></div>';
  }

  /* ══ Confirm action ══ */
  async function confirmAction() {
    if (!pendingTask) return;
    const btn = document.querySelector('.confirm-card .btn-primary');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>处理中...'; }
    if (pendingTask.type === 'create') {
      await executeCreate(pendingTask.task, btn);
    } else if (pendingTask.type === 'modify') {
      await executeModify(pendingTask, btn);
    }
  }

  async function executeCreate(task, btn) {
    const t = UI.toast('同步到 Google Calendar...', 'loading', 0);
    try {
      const res     = await Cal.createEvent(task);
      const estMins = Cal.calcMins(task.start, task.end);
      App.store.tasks.push({
        id: Date.now(), gcalId: res.id,
        ...task, estMins,
        done: false, actualMins: null, completedAt: null,
        calendarId: Cal.activeCalendarId,
      });
      App.saveState();
      // Remember for follow-up modifications
      lastCreated = { ...task, gcalId: res.id };
      t.remove();
      const title = (task.tag && task.tag !== '其他')
        ? '#' + task.tag + ' ' + task.name : task.name;
      UI.toast('✓ 已创建：' + title, 'success');
      document.getElementById('confirmArea').innerHTML = '';
      pendingTask = null;
      // Keep chatHistory for follow-up context, just add a system note
      chatHistory.push({
        role: 'assistant',
        content: JSON.stringify({ _note: 'created', name: task.name, date: task.date, start: task.start, end: task.end })
      });
      addAIBubble('✓ 已创建「' + title + '」（' + task.date + ' ' + task.start + '–' + task.end + '）。\n还需要调整或安排其他吗？');
    } catch(e) {
      t.remove();
      UI.toast('创建失败：' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '✓ 确认创建'; }
    }
  }

  async function executeModify(pending, btn) {
    const { intent, target, changes } = pending;
    const t = UI.toast('正在处理...', 'loading', 0);
    try {
      // ── Step 1: fuzzy match in already-loaded today events ──
      const todayEvents = App.todayEvents || [];
      const fuzzy = (a, b) => {
        a = a.toLowerCase(); b = b.toLowerCase();
        return a.includes(b) || b.includes(a);
      };
      let match = todayEvents.find(e =>
        fuzzy(e.name, target) || fuzzy(e.rawSummary || '', target)
      );

      // ── Step 2: "刚才/上一个/这个" → lastCreated ──
      if (!match && lastCreated &&
          (target.includes('刚') || target.includes('上一') ||
           target.includes('这个') || target.includes('刚才'))) {
        match = todayEvents.find(e => e.gcalId === lastCreated.gcalId) || lastCreated;
      }

      // ── Step 3: cross-date search via Google Calendar API ──
      if (!match) {
        UI.toast('搜索日历中...', 'loading', 0);
        const searchDate = changes.date || Cal.todayStr();
        const results = await Cal.searchEvents(target, searchDate);
        if (results.length > 0) {
          // Pick the closest match
          match = results.find(e => fuzzy(e.name, target)) || results[0];
        }
      }

      if (!match) {
        t.remove();
        addAIBubble('抱歉，在日历中找不到「' + target + '」。请确认活动名称，或告诉我大概是哪天的活动。');
        if (btn) { btn.disabled = false; btn.innerHTML = '✓ 确认'; }
        return;
      }

      // ── Execute the intent ──
      if (intent === 'complete') {
        const now        = new Date();
        const actualMins = Math.round(Math.max(0, (now - new Date(match.start)) / 60000));
        await Cal.markComplete(match, actualMins);
        const local = App.store.tasks.find(x => x.gcalId === match.gcalId);
        if (local) { local.done = true; local.actualMins = actualMins; App.saveState(); }
        t.remove();
        UI.toast('✓ 已标记完成', 'success');
        addAIBubble('✓「' + match.name + '」已标记完成，实际耗时约 ' + fmtMins(actualMins) + '。');

      } else if (intent === 'delete') {
        await Cal.deleteEvent(match.gcalId);
        App.store.tasks = App.store.tasks.filter(x => x.gcalId !== match.gcalId);
        if (lastCreated?.gcalId === match.gcalId) lastCreated = null;
        App.saveState();
        t.remove();
        UI.toast('✓ 已删除', 'success');
        addAIBubble('✓「' + match.name + '」已从日历删除。');

      } else {
        // reschedule / update
        const date  = changes.date  || (match.start ? match.start.slice(0,10) : Cal.todayStr());
        const start = changes.start ? date + 'T' + changes.start + ':00' : match.start;
        const end   = changes.end   ? date + 'T' + changes.end   + ':00' : match.end;
        const updates = {};
        if (start) updates.start = start;
        if (end)   updates.end   = end;

        if (changes.tag) {
          const nt = changes.tag;
          updates.summary     = (nt && nt !== '其他') ? '#' + nt + ' ' + match.name : match.name;
          updates.colorId     = Cal.TAG_COLOR[nt] || '0';
          updates.description = ((match.description || '').replace(/标签：[^\n]*/g,'').trim()) + '\n标签：' + nt;
        }
        if (changes.description && !changes.tag) updates.description = changes.description;
        if (changes.reminder != null) {
          updates.reminders = {
            useDefault: false,
            overrides: [{ method: changes.reminderMethod || 'popup', minutes: changes.reminder }]
          };
        }
        await Cal.updateEvent(match.gcalId, updates);
        t.remove();

        // Build human-readable summary of what changed
        const changeSummary = [];
        if (changes.start || changes.end || changes.date) {
          const newStart = changes.start || (match.start ? new Date(match.start).toTimeString().slice(0,5) : '');
          const newEnd   = changes.end   || (match.end   ? new Date(match.end).toTimeString().slice(0,5)   : '');
          changeSummary.push('时间改为 ' + (changes.date || date) + ' ' + newStart + '–' + newEnd);
        }
        if (changes.tag)         changeSummary.push('标签改为 #' + changes.tag);
        if (changes.description) changeSummary.push('已更新描述');
        if (changes.reminder != null) changeSummary.push('提醒改为 ' + changes.reminder + ' 分钟前');
        UI.toast('✓ 已更新', 'success');
        addAIBubble('✓「' + match.name + '」' + (changeSummary.join('，') || '已更新') + '。还有其他需要调整的吗？');
      }

      document.getElementById('confirmArea').innerHTML = '';
      pendingTask = null;
      await Cal.loadTodayEvents();
      CalView.refresh(); // refresh calendar view if visible
    } catch(e) {
      t.remove();
      UI.toast('操作失败：' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '✓ 确认'; }
    }
  }

  function cancelConfirm() {
    document.getElementById('confirmArea').innerHTML = '';
    pendingTask = null;
    addAIBubble('好的，告诉我需要怎么调整？');
  }

  /* ══ Send message ══ */
  async function sendMessage() {
    const input = document.getElementById('chatInput');
    const text  = input.value.trim();
    if (!text) return;
    input.value = '';
    autoResize(input);
    addUserBubble(text);
    chatHistory.push({ role: 'user', content: text });

    // Keep chatHistory bounded to last 10 turns to avoid token overflow
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

    const thinkEl = addThinkingBubble();
    document.getElementById('sendBtn').disabled = true;
    try {
      const reply = await callDS(chatHistory, buildSystemPrompt());
      thinkEl.remove();
      chatHistory.push({ role: 'assistant', content: reply });

      let parsed;
      try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); } catch(e) { parsed = null; }

      if (parsed?.action === 'ask') {
        addAIBubble(parsed.question);

      } else if (parsed?.action === 'create' && parsed.task) {
        addAIBubble(parsed.summary || '请确认以下活动信息：');
        showCreateConfirm(parsed.task);

      } else if (parsed?.action === 'modify') {
        addAIBubble(parsed.summary || '请确认以下修改：');
        showModifyConfirm(parsed.intent, parsed.target, parsed.changes || {}, parsed.summary, parsed.searchDate);

      } else {
        addAIBubble(reply || '收到，还有其他需要吗？');
      }
    } catch(e) {
      thinkEl.remove();
      if (e.message !== 'no key') addAIBubble('出现错误：' + e.message);
    } finally {
      document.getElementById('sendBtn').disabled = false;
    }
  }

  /* ══ Today analysis ══ */
  async function analyzeToday() {
    const box = document.getElementById('aiTodayBox');
    const txt = document.getElementById('aiTodayText');
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
      txt.textContent = await callDS(
        [{ role: 'user', content: '今天任务：\n' + summary + '\n完成率：' + doneCnt + '/' + events.length + '。请分析完成情况并给出3条改进建议，150字以内。' }],
        '你是时间管理顾问，用中文回答，语气温和专业。'
      );
    } catch(e) { txt.textContent = '分析失败：' + e.message; }
  }

  /* ══ Helpers ══ */
  function fmtMins(m) {
    if (!m && m !== 0) return '—';
    return m < 60 ? m + '分' : (m / 60).toFixed(1) + 'h';
  }
  async function setKey(key) { dsKey = key; await Auth.saveDeepSeekKey(key); }
  async function loadKey() { dsKey = (await Auth.loadDeepSeekKey()) || ''; return dsKey; }

  return {
    initChat, sendMessage, confirmAction, cancelConfirm,
    analyzeToday, setKey, loadKey,
  };
})();
