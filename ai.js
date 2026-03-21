/* ═══════════════════════════════════════════════════
   ai.js — DeepSeek AI: natural language create & modify
═══════════════════════════════════════════════════ */

const AI = (() => {
  const DS_BASE  = 'https://api.deepseek.com/v1/chat/completions';
  const DS_MODEL = 'deepseek-chat';

  let chatHistory = [];
  let pendingTask = null;
  let dsKey = '';   // runtime key (loaded from encrypted storage on init)

  /* ══ DeepSeek call ══ */
  async function callDS(messages, systemPrompt, maxTokens = 700) {
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
      body:    JSON.stringify({ model: DS_MODEL, messages: all, max_tokens: maxTokens, temperature: 0.3 }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error?.message || r.status);
    }
    const d = await r.json();
    return d.choices?.[0]?.message?.content || '';
  }

  /* ══ System prompt for task parsing ══ */
  function buildSystemPrompt() {
    const cfg  = App.store.cfg;
    const today = Cal.todayStr();
    const now   = new Date().toTimeString().slice(0, 5);
    const tz    = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return `你是智能日历任务助手。今天是${today}，当前时间${now}，时区${tz}。
工作时间${cfg.workStart||'09:00'}至${cfg.workEnd||'18:00'}，默认提前提醒${cfg.defReminder||10}分钟（${cfg.defReminderMethod||'popup'}方式）。

你有三种操作模式，只输出 JSON，不输出任何其他文字：

【创建模式】信息足够时：
{"action":"create","task":{"name":"任务名(30字内)","tag":"学习|课程|科研|社工|运动|娱乐|工作|其他","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","reminder":分钟数,"reminderMethod":"popup|email","description":"描述或空字符串"},"summary":"一句话确认"}

【修改模式】用户要求修改/推迟/取消/标记完成已有任务时：
{"action":"modify","intent":"reschedule|complete|delete|update","target":"任务名关键词","changes":{"start":"HH:MM(可选)","end":"HH:MM(可选)","date":"YYYY-MM-DD(可选)","description":"(可选)"},"summary":"一句话说明修改内容"}

【反问模式】信息不足时（只问最重要的一个问题）：
{"action":"ask","question":"问题"}

规则：tag自动判断；"明天"=明天日期；超出工作时间时在summary中提示；reminder没说用默认值；reminderMethod没说用默认值。`;
  }

  /* ══ Chat UI helpers ══ */
  function initChat() {
    chatHistory = [];
    pendingTask = null;
    document.getElementById('chatArea').innerHTML = '';
    document.getElementById('confirmArea').innerHTML = '';
    addAIBubble('你好！直接告诉我你要安排什么任务，或者修改已有安排。\n\n例如：\n「明天下午3点开会一小时，提前15分钟提醒」\n「把今天下午的会议推迟到4点」\n「标记写周报任务已完成」');
  }

  function addAIBubble(text, thinking = false) {
    const area = document.getElementById('chatArea');
    const el   = document.createElement('div');
    el.className = 'msg msg-ai';
    el.innerHTML = '<div class="msg-avatar">◎</div><div class="bubble ' + (thinking ? 'bubble-thinking' : 'bubble-ai') + '">' + esc(text).replace(/\n/g, '<br>') + '</div>';
    area.appendChild(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    return el;
  }

  function addUserBubble(text) {
    const area = document.getElementById('chatArea');
    const el   = document.createElement('div');
    el.className = 'msg msg-user';
    el.innerHTML = '<div class="bubble bubble-user">' + esc(text).replace(/\n/g, '<br>') + '</div><div class="msg-avatar">你</div>';
    area.appendChild(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function addThinkingBubble() {
    const area = document.getElementById('chatArea');
    const el   = document.createElement('div');
    el.className = 'msg msg-ai';
    el.innerHTML = '<div class="msg-avatar">◎</div><div class="bubble bubble-thinking"><span class="spinner"></span>思考中...</div>';
    area.appendChild(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    return el;
  }

  /* ══ Confirm card for CREATE ══ */
  function showCreateConfirm(task) {
    pendingTask = { type: 'create', task };
    const cfg = App.store.cfg;
    // Out-of-hours check
    const ooh = isOutOfHours(task.start, task.end);
    const confirm = document.getElementById('confirmArea');
    confirm.innerHTML =
      '<div class="confirm-card">'
      + (ooh ? '<div class="ooh-banner">⚠ 该时间段超出工作时间 (' + cfg.workStart + '–' + cfg.workEnd + ')，确认继续？</div>' : '')
      + '<div class="confirm-title">请确认创建信息</div>'
      + row('任务', esc(task.name))
      + row('类别', '<span class="badge badge-' + esc(task.tag) + '">' + esc(task.tag) + '</span>')
      + row('日期', esc(task.date))
      + row('时间', esc(task.start) + ' – ' + esc(task.end) + ' (' + Cal.calcMins(task.start, task.end) + '分钟)')
      + row('提醒', task.reminder + '分钟前（' + (task.reminderMethod === 'email' ? '邮件' : '弹窗') + '）')
      + (task.description ? row('描述', esc(task.description)) : '')
      + '<div class="confirm-actions">'
      + '<button class="btn btn-primary" onclick="AI.confirmAction()">✓ 确认创建</button>'
      + '<button class="btn" onclick="AI.cancelConfirm()">修改</button>'
      + '</div></div>';
    confirm.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  /* ══ Confirm card for MODIFY ══ */
  function showModifyConfirm(intent, target, changes, summary) {
    pendingTask = { type: 'modify', intent, target, changes };
    const confirm = document.getElementById('confirmArea');
    const intentLabel = { reschedule:'修改时间', complete:'标记完成', delete:'删除', update:'更新' };
    confirm.innerHTML =
      '<div class="confirm-card">'
      + '<div class="confirm-title">请确认修改操作</div>'
      + row('操作', intentLabel[intent] || intent)
      + row('目标任务', esc(target))
      + (changes.date  ? row('新日期', esc(changes.date))  : '')
      + (changes.start ? row('新开始', esc(changes.start)) : '')
      + (changes.end   ? row('新结束', esc(changes.end))   : '')
      + (changes.description ? row('描述', esc(changes.description)) : '')
      + '<div class="confirm-actions">'
      + '<button class="btn btn-primary" onclick="AI.confirmAction()">✓ 确认</button>'
      + '<button class="btn" onclick="AI.cancelConfirm()">取消</button>'
      + '</div></div>';
    confirm.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function row(key, val) {
    return '<div class="confirm-row"><span class="confirm-key">' + key + '</span><span class="confirm-val">' + val + '</span></div>';
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
      const res = await Cal.createEvent(task);
      // Save to local store
      const estMins = Cal.calcMins(task.start, task.end);
      App.store.tasks.push({
        id: Date.now(), gcalId: res.id,
        ...task, estMins,
        done: false, actualMins: null, completedAt: null,
        calendarId: Cal.activeCalendarId,
      });
      App.saveState();
      t.remove();
      UI.toast('✓ 已创建并同步到 Google Calendar', 'success');
      document.getElementById('confirmArea').innerHTML = '';
      pendingTask = null;
      chatHistory = [];
      addAIBubble('✓ 任务「' + task.name + '」已创建成功！还需要安排其他任务吗？');
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
      // Find matching event in today's list
      const events = App.todayEvents || [];
      const match  = events.find(e => e.name.includes(target) || target.includes(e.name.replace(/^【.*?】/, '')));

      if (!match) {
        t.remove();
        UI.toast('未找到匹配任务：' + target, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '✓ 确认'; }
        return;
      }

      if (intent === 'complete') {
        const now = new Date();
        const actualMins = Math.round((now - new Date(match.start)) / 60000);
        await Cal.markComplete(match, Math.max(0, actualMins));
        // Update local store
        const local = App.store.tasks.find(t => t.gcalId === match.gcalId);
        if (local) { local.done = true; local.actualMins = Math.max(0, actualMins); App.saveState(); }
        t.remove();
        UI.toast('✓ 任务已标记完成', 'success');
      } else if (intent === 'delete') {
        await Cal.deleteEvent(match.gcalId);
        App.store.tasks = App.store.tasks.filter(t => t.gcalId !== match.gcalId);
        App.saveState();
        t.remove();
        UI.toast('✓ 任务已删除', 'success');
      } else if (intent === 'reschedule' || intent === 'update') {
        const tz    = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const date  = changes.date  || match.start.slice(0, 10);
        const start = changes.start ? date + 'T' + changes.start + ':00' : match.start;
        const end   = changes.end   ? date + 'T' + changes.end   + ':00' : match.end;
        const updates = { start, end };
        if (changes.description) updates.description = changes.description;
        await Cal.updateEvent(match.gcalId, updates);
        t.remove();
        UI.toast('✓ 任务已更新', 'success');
      }

      document.getElementById('confirmArea').innerHTML = '';
      pendingTask = null;
      chatHistory = [];
      addAIBubble('✓ 操作完成！还有其他需要处理的吗？');
      await Cal.loadTodayEvents();
    } catch(e) {
      t.remove();
      UI.toast('操作失败：' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '✓ 确认'; }
    }
  }

  function cancelConfirm() {
    document.getElementById('confirmArea').innerHTML = '';
    pendingTask = null;
    addAIBubble('好的，请告诉我需要修改什么？');
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
        addAIBubble(parsed.summary || '请确认以下任务信息：');
        showCreateConfirm(parsed.task);
      } else if (parsed?.action === 'modify') {
        addAIBubble(parsed.summary || '请确认以下修改：');
        showModifyConfirm(parsed.intent, parsed.target, parsed.changes || {}, parsed.summary);
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
    const tasks = App.store.tasks.filter(t => t.date === Cal.todayStr());
    if (!tasks.length && !App.todayEvents?.length) {
      txt.textContent = '今天暂无任务数据。';
      return;
    }
    const events = App.todayEvents || tasks;
    const summary = events.map(e =>
      '- 【' + (e.tag || '其他') + '】' + e.name + '：预估' + fmtMins(e.estMins) + '，' +
      (e.done ? '已完成，实际' + fmtMins(e.actualMins) : '未完成')
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
  function isOutOfHours(start, end) {
    const cfg = App.store.cfg;
    const ws  = (cfg.workStart || '09:00').replace(':', '');
    const we  = (cfg.workEnd   || '18:00').replace(':', '');
    const s   = start.replace(':', '');
    const e   = end.replace(':', '');
    return parseInt(s) < parseInt(ws) || parseInt(e) > parseInt(we);
  }

  function fmtMins(m) { if (!m && m !== 0) return '—'; return m < 60 ? m + '分' : (m / 60).toFixed(1) + 'h'; }

  async function setKey(key) {
    dsKey = key;
    await Auth.saveDeepSeekKey(key);
  }

  async function loadKey() {
    dsKey = (await Auth.loadDeepSeekKey()) || '';
    return dsKey;
  }

  return {
    initChat, sendMessage, confirmAction, cancelConfirm,
    analyzeToday, setKey, loadKey,
  };
})();
