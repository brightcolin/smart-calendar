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

  /* ══ System prompt ══ */
  function buildSystemPrompt() {
    const cfg   = App.store.cfg;
    const today = Cal.todayStr();
    const now   = new Date().toTimeString().slice(0, 5);
    const tz    = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const weekDays = ['日','一','二','三','四','五','六'];

    const dates = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      dates.push(d.toISOString().slice(0,10) + '(周' + weekDays[d.getDay()] + ')');
    }

    const existingNames = (App.todayEvents || [])
      .map(e => '"' + e.name + '"')
      .join('、') || '（今日暂无已知活动）';

    return `你是智能日历任务助手。今天是${today}(周${weekDays[new Date().getDay()]})，当前时间${now}，时区${tz}。
默认提前提醒${cfg.defReminder||10}分钟，方式${cfg.defReminderMethod||'popup'}。
未来14天：${dates.slice(0,7).join('，')}
标签：学习|课程|科研|社工|运动|娱乐|工作|其他。标签写在标题最前面，格式"#标签 任务名"（如"#工作 写周报"）。标签为"其他"时不加前缀，直接写任务名。
今日已有活动：${existingNames}

只输出合法 JSON，不输出任何其他文字。支持三种动作：

【创建】用户要安排新活动时（无论是否提到周期，只创建第一个时间点）：
{"action":"create","task":{"name":"活动名(30字内，不含#标签)","tag":"标签","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","reminder":分钟数,"reminderMethod":"popup|email","description":"备注或空字符串"},"summary":"一句话确认，用24小时制"}

【修改】用户明确要求修改/推迟/提前/删除/完成"今日已有活动"时：
{"action":"modify","intent":"reschedule|complete|delete|update","target":"已有活动名关键词","changes":{"start":"HH:MM","end":"HH:MM","date":"YYYY-MM-DD","tag":"新标签(可选)","description":"新描述(可选)"},"summary":"一句话说明"}

【反问】信息不足（缺时间/时长）时，一次只问一个问题：
{"action":"ask","question":"问题"}

关键判断规则（防误判）：
1. 用户说"今天15:00开会"→ 创建新活动，不是修改
2. 只有用户明确说要改某个已存在的活动，才用modify
3. 周期性描述（"每周五看电影"）→ 只创建第一个时间点，summary中说明
4. 所有时间用24小时制（14:00，不用"下午2点"）
5. 用户写了#标签则优先采用，否则根据内容自动判断
6. reminder/reminderMethod未提及时用默认值`;
  }

  /* ══ Chat UI helpers ══ */
  function initChat() {
    chatHistory = [];
    pendingTask = null;
    document.getElementById('chatArea').innerHTML = '';
    document.getElementById('confirmArea').innerHTML = '';
    addAIBubble('你好！直接告诉我要安排什么，或者修改已有活动。\n\n例如：\n「#工作 明天14:00开会一小时」\n「每周五20:00看电影两小时」（只创建本周）\n「把今天下午的会议推迟到16:00」');
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

  /* ══ Confirm card for single CREATE ══ */
  function showCreateConfirm(task) {
    pendingTask = { type: 'create', task };
    // Prefix format preview: "#工作 写周报"
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
    const intentLabel = { reschedule:'修改时间', complete:'标记完成', delete:'删除', update:'更新内容' };
    confirm.innerHTML =
      '<div class="confirm-card">'
      + '<div class="confirm-title">请确认修改操作</div>'
      + row('操作', intentLabel[intent] || intent)
      + row('目标活动', esc(target))
      + (changes.date  ? row('新日期', esc(changes.date))  : '')
      + (changes.start ? row('新开始', esc(changes.start) + ' (24小时制)') : '')
      + (changes.end   ? row('新结束', esc(changes.end)   + ' (24小时制)') : '')
      + (changes.tag   ? row('新标签', '<span class="badge badge-' + esc(changes.tag) + '">' + esc(changes.tag) + '</span>') : '')
      + (changes.description ? row('新描述', esc(changes.description)) : '')
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
      const res     = await Cal.createEvent(task);
      const estMins = Cal.calcMins(task.start, task.end);
      App.store.tasks.push({
        id: Date.now(), gcalId: res.id,
        ...task, estMins,
        done: false, actualMins: null, completedAt: null,
        calendarId: Cal.activeCalendarId,
      });
      App.saveState();
      t.remove();
      const titlePreview = (task.tag && task.tag !== '其他')
        ? '#' + task.tag + ' ' + task.name
        : task.name;
      UI.toast('✓ 已创建：' + titlePreview, 'success');
      document.getElementById('confirmArea').innerHTML = '';
      pendingTask = null; chatHistory = [];
      addAIBubble('✓ 已创建「' + titlePreview + '」（' + task.date + ' ' + task.start + '–' + task.end + '）。还需要安排其他吗？');
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
      // Find matching event from today's loaded list
      const events = App.todayEvents || [];
      const match  = events.find(e =>
        e.name.includes(target) ||
        target.includes(e.name) ||
        e.rawSummary?.includes(target)
      );

      if (!match) {
        t.remove();
        UI.toast('未找到匹配活动：' + target + '（请先在今日页面刷新）', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '✓ 确认'; }
        return;
      }

      if (intent === 'complete') {
        const now        = new Date();
        const actualMins = Math.round(Math.max(0, (now - new Date(match.start)) / 60000));
        await Cal.markComplete(match, actualMins);
        const local = App.store.tasks.find(x => x.gcalId === match.gcalId);
        if (local) { local.done = true; local.actualMins = actualMins; App.saveState(); }
        t.remove();
        UI.toast('✓ 已标记完成', 'success');

      } else if (intent === 'delete') {
        await Cal.deleteEvent(match.gcalId);
        App.store.tasks = App.store.tasks.filter(x => x.gcalId !== match.gcalId);
        App.saveState();
        t.remove();
        UI.toast('✓ 已删除', 'success');

      } else if (intent === 'reschedule' || intent === 'update') {
        const date  = changes.date  || match.start.slice(0, 10);
        const start = changes.start ? date + 'T' + changes.start + ':00' : match.start;
        const end   = changes.end   ? date + 'T' + changes.end   + ':00' : match.end;
        const updates = { start, end };

        // Handle tag change: update summary (prefix format) and colorId
        if (changes.tag) {
          const newTag     = changes.tag;
          const newSummary = (newTag && newTag !== '其他')
            ? '#' + newTag + ' ' + match.name
            : match.name;
          updates.summary  = newSummary;
          updates.colorId  = Cal.TAG_COLOR[newTag] || '0';
          const newDesc = (match.description || '')
            .replace(/标签：[^\n]*/g, '')
            .trim() + '\n标签：' + newTag;
          updates.description = newDesc;
        }
        if (changes.description && !changes.tag) {
          updates.description = changes.description;
        }
        await Cal.updateEvent(match.gcalId, updates);
        t.remove();
        UI.toast('✓ 已更新', 'success');
      }

      document.getElementById('confirmArea').innerHTML = '';
      pendingTask = null; chatHistory = [];
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
        addAIBubble(parsed.summary || '请确认以下活动信息：');
        showCreateConfirm(parsed.task);

      } else if (parsed?.action === 'modify') {
        addAIBubble(parsed.summary || '请确认以下修改：');
        showModifyConfirm(parsed.intent, parsed.target, parsed.changes || {}, parsed.summary);

      } else {
        // Fallback: show raw reply (should rarely happen)
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
