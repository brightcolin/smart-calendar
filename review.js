/* ═══════════════════════════════════════════════════
   review.js — Exam Review Planner Module
   • 28-day review plan with per-subject tracking
   • Timeline view with day-by-day task cards
   • DeepSeek-powered smart rescheduling
   • Conflict detection with Google Calendar
   • Progress dashboard per subject
═══════════════════════════════════════════════════ */

const Review = (() => {
  const STORE_KEY = 'sca_review';

  /* ══ Subject definitions ══ */
  const SUBJECTS = [
    { id: 'calc', name: '微积分', short: '微积', color: '#6b9fe0', textColor: '#1a3050', credits: 5, examDate: '2026-06-16', examTime: '09:00–11:00', targetHours: 55, icon: '∫' },
    { id: 'phys', name: '物理',   short: '物理', color: '#5dba8a', textColor: '#0a2010', credits: 5, examDate: '2026-06-16', examTime: '19:00–21:00', targetHours: 40, icon: 'Σ' },
    { id: 'la',   name: '高代',   short: '高代', color: '#9b7fe0', textColor: '#2a1a50', credits: 2, examDate: '2026-06-14', examTime: '19:00–21:00', targetHours: 25, icon: 'λ' },
    { id: 'eng',  name: '英语',   short: '英语', color: '#e09b4d', textColor: '#3a1a00', credits: 0, examDate: '2026-06-13', examTime: '',             targetHours: 15, icon: 'E' },
    { id: 'hist', name: '近代史', short: '史纲', color: '#e04d8a', textColor: '#3a0010', credits: 0, examDate: '2026-06-09', examTime: '08:00–09:35', targetHours: 8,  icon: '史' },
    { id: 'hw',   name: '作业',   short: '作业', color: '#e06b6b', textColor: '#3a1010', credits: 0, examDate: '',            examTime: '',             targetHours: 22, icon: '✎' },
  ];

  const SUBJECT_MAP = {};
  SUBJECTS.forEach(s => SUBJECT_MAP[s.id] = s);

  let plan = { tasks: [], version: 2, created: null };
  let filterSubject = 'all';
  let scrollDate = null; // date string to scroll to

  /* ══ Load / Save ══ */
  function loadPlan() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        plan = JSON.parse(raw);
        if (!plan.tasks) plan.tasks = [];
      }
    } catch(e) { plan = { tasks: [], version: 2, created: null }; }
  }

  function savePlan() {
    localStorage.setItem(STORE_KEY, JSON.stringify(plan));
  }

  function hasPlan() { return plan.tasks.length > 0; }

  /* ══ Default plan generator ══ */
  function generateDefaultPlan() {
    const tasks = [];
    let id = 1;
    const t = (subj, date, start, end, name, desc) => {
      tasks.push({ id: id++, subjectId: subj, date, start, end, name, desc: desc || '', done: false, gcalId: null });
    };

    // ── Week 1: 5/20–5/25 (Clear homework + start calculus) ──
    t('hw',   '2026-05-20','10:00','12:00','OOP技术报告-写初稿','搭框架写初稿');
    t('hw',   '2026-05-20','15:05','17:00','OOP技术报告-继续写','');
    t('calc', '2026-05-20','19:00','21:00','微积分-三重积分+重积分应用','课件15-16');
    t('hw',   '2026-05-20','21:15','23:00','OOP技术报告-收尾','润色');

    t('hw',   '2026-05-21','08:00','09:40','OOP报告-润色提交','');
    t('calc', '2026-05-21','13:30','17:00','微积分-曲线曲面积分(深度块)','课件17-18+习题课对应题');
    t('calc', '2026-05-21','21:15','23:00','微积分-习题课练习','习题课7-8讲');

    t('hw',   '2026-05-22','15:05','17:00','OOP报告-最终修改','');
    t('calc', '2026-05-22','21:00','23:00','微积分-整理习题课内容','趁热整理+补做习题');

    t('calc', '2026-05-23','09:30','12:00','微积分-Green公式+向量场','课件19-21');
    t('calc', '2026-05-23','13:30','17:00','微积分-Gauss/Stokes练习(深度块)','习题课9-10讲');
    t('phys', '2026-05-23','19:00','21:00','物理-第4章刚体力学(启动)','4.1-4.3角动量/因果/刚体运动学');
    t('eng',  '2026-05-23','21:15','23:00','四级-听力真题','扇贝+听力真题1套');

    t('calc', '2026-05-24','08:30','12:00','微积分-级数','课件22-25，非负项/任意项/函数项');
    t('phys', '2026-05-24','13:30','17:00','物理-第4章刚体(4.4-4.7)','定轴转动/平行运动/平衡/回转');
    t('calc', '2026-05-24','19:00','21:00','微积分-级数习题','做习题课级数相关题');
    t('hist', '2026-05-24','21:15','23:00','近代史-读书笔记(启动)','');

    t('calc', '2026-05-25','15:05','17:00','微积分-幂级数+Fourier','课件26-28');
    t('calc', '2026-05-25','19:00','21:00','微积分-习题+小测回顾','小测6-8');
    t('hist', '2026-05-25','21:15','23:00','近代史-读书笔记+导游词','');

    // ── Week 2: 5/26–6/1 (Calculus drill + Physics catchup) ──
    t('hist', '2026-05-26','15:05','17:00','近代史-读书笔记收尾','');
    t('calc', '2026-05-26','19:00','21:00','微积分-小测回顾+错题','小测1-5');
    t('hist', '2026-05-26','21:15','23:00','近代史-导游词','');

    t('phys', '2026-05-27','10:00','12:00','物理-第5章连续体力学','弹性/流体静力学/伯努利');
    t('hw',   '2026-05-27','15:05','17:00','RP writing-修改','Method+Result');
    t('calc', '2026-05-27','19:00','21:00','微积分-真题第1套','计时模拟');
    t('calc', '2026-05-27','21:15','23:00','微积分-真题1订正','知识点回溯');

    t('phys', '2026-05-28','08:00','09:40','物理-第5章收尾','做对应课本习题');
    t('phys', '2026-05-28','13:30','17:00','物理-第6章振动和波(深度块)','线性振动/合成分解/简谐波');
    t('calc', '2026-05-28','19:00','21:00','微积分-真题第2套','');
    t('calc', '2026-05-28','21:15','23:00','微积分-真题2订正','');

    t('hw',   '2026-05-29','15:05','17:00','RP writing-Conclusion','写Conclusion+通读修改');
    t('phys', '2026-05-29','21:00','23:00','物理-第6章习题','多普勒/超声波');

    t('phys', '2026-05-30','08:30','12:00','物理-第7章万有引力','开普勒/引力场/天文/潮汐');
    t('la',   '2026-05-30','13:30','17:00','高代-首次投入','整理板书照片→按章归类→看讲义');
    t('calc', '2026-05-30','19:00','21:00','微积分-真题第3套','');
    t('hist', '2026-05-30','21:15','23:00','近代史-导游词+笔记最终检查','');

    t('calc', '2026-05-31','08:30','12:00','微积分-真题3订正+薄弱回看','');
    t('phys', '2026-05-31','13:30','17:00','物理-第7章习题+第4章回做','重点题');
    t('la',   '2026-05-31','19:00','21:00','高代-讲义精读+真题摸底','');
    t('eng',  '2026-05-31','21:15','23:00','四级-阅读+写作真题','');

    t('phys', '2026-06-01','15:05','17:00','物理-第8章相对论','时空/洛伦兹变换');
    t('calc', '2026-06-01','19:00','21:00','微积分-真题第4套','');
    t('calc', '2026-06-01','21:15','23:00','微积分-真题4订正','');

    // ── Week 3: 6/2–6/8 (Full sprint + exam period) ──
    t('phys', '2026-06-02','15:05','17:00','物理-第8章(狭义相对论动力学)','四维矢量');
    t('la',   '2026-06-02','19:00','21:00','高代-讲义+板书精读+真题','');
    t('hw',   '2026-06-02','21:15','23:00','RP writing-最终修改','提交准备');

    t('calc', '2026-06-03','10:00','12:00','微积分-薄弱点专项','级数收敛性+Fourier展开');
    t('phys', '2026-06-03','15:05','17:00','物理-第8章收尾(广义相对论)','做习题');
    t('calc', '2026-06-03','19:00','21:00','微积分-真题第5套','最后一套');
    t('calc', '2026-06-03','21:15','23:00','微积分-真题5订正+错题汇总','全5套');

    t('la',   '2026-06-04','08:00','09:40','高代-真题训练','');
    t('phys', '2026-06-04','13:30','17:00','物理-真题+第4章重刷(深度块)','');
    t('calc', '2026-06-04','19:00','21:00','微积分-错题二刷+公式卡','');
    t('la',   '2026-06-04','21:15','23:00','高代-真题+定理证明','');

    t('phys', '2026-06-05','15:05','17:00','物理-真题+薄弱章节','');
    t('eng',  '2026-06-05','21:00','23:00','英语-准备Oral presentation','');

    t('calc', '2026-06-06','08:30','12:00','微积分-重积分+曲面积分专练','计算题专练');
    t('phys', '2026-06-06','13:30','17:00','物理-全真题模拟','计时+订正');
    t('la',   '2026-06-06','19:00','21:00','高代-真题+证明题专练','');
    t('eng',  '2026-06-06','21:15','23:00','英语-Oral排练+听说刷题','');

    t('phys', '2026-06-07','08:30','12:00','物理-Ch1-3公式回顾+真题','快速回顾');
    t('calc', '2026-06-07','13:30','17:00','微积分-Green/Gauss/Stokes+级数专练','');
    t('la',   '2026-06-07','19:00','21:00','高代-真题+讲义定理总结','');
    t('eng',  '2026-06-07','21:15','23:00','英语-听说刷题','六级听力');

    t('eng',  '2026-06-08','15:05','17:00','近代史-开卷考前准备','翻课本标记重点');
    t('calc', '2026-06-08','19:00','21:00','微积分-公式卡+弱项查漏','');
    t('eng',  '2026-06-08','21:15','23:00','英语-Oral最终排练+近代史标签','');

    // ── Week 4: 6/9–6/16 (Exam week, final sprint) ──
    t('calc', '2026-06-09','15:05','17:00','微积分-回到主线','考完两科回来');
    t('calc', '2026-06-09','19:00','21:00','微积分-重积分变量替换+曲面积分','重点题型');
    t('eng',  '2026-06-09','21:15','23:00','四级-最后一次完整真题','');

    t('calc', '2026-06-10','10:00','12:00','微积分-级数+Fourier最终复习','');
    t('phys', '2026-06-10','15:05','17:00','物理-刚体力学重点回顾','');
    t('la',   '2026-06-10','19:00','21:00','高代-考前集中复习','');
    t('phys', '2026-06-10','21:15','23:00','物理-振动和波+万有引力公式','');

    t('la',   '2026-06-11','08:00','09:40','高代-定理证明+真题重做','');
    t('la',   '2026-06-11','13:30','17:00','高代-考前深度块','全面复习');
    t('calc', '2026-06-11','19:00','21:00','微积分-错题三刷','');
    t('la',   '2026-06-11','21:15','23:00','高代-最终冲刺','真题+公式');

    t('la',   '2026-06-12','15:05','17:00','高代-考前最后复习','');
    t('la',   '2026-06-12','21:00','23:00','高代-核心定理过一遍','睡前');

    t('phys', '2026-06-13','19:00','21:00','物理-公式卡+重点题型','四级考完后');
    t('la',   '2026-06-13','21:15','23:00','高代-最终过一遍','');

    t('la',   '2026-06-14','08:30','12:00','高代-考前终极复习','');
    t('calc', '2026-06-14','13:30','17:00','微积分-真题错题+公式卡','');
    t('calc', '2026-06-14','21:30','23:00','微积分-考完高代立切微积分','公式+重点题型');

    t('calc', '2026-06-15','15:05','17:00','微积分-最终查漏','错题+公式卡');
    t('phys', '2026-06-15','19:00','21:00','物理-最终查漏','全8章公式+重点题型');
    t('calc', '2026-06-15','21:15','22:30','微积分-轻度回顾','不刷新题，22:30必须停');

    t('phys', '2026-06-16','14:00','17:00','物理-考前最后一轮','公式+重点题型');

    plan = { tasks, version: 2, created: new Date().toISOString() };
    savePlan();
    return plan;
  }

  /* ══ Task operations ══ */
  function toggleDone(taskId) {
    const task = plan.tasks.find(t => t.id === taskId);
    if (task) { task.done = !task.done; savePlan(); render(); }
  }

  function deleteTask(taskId) {
    plan.tasks = plan.tasks.filter(t => t.id !== taskId);
    savePlan();
    render();
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
    const exam = new Date('2026-06-16'); exam.setHours(0,0,0,0);
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

    const prompt = `你是考试复习规划助手。以下是当前复习计划的状态：

【日期】今天是 ${today}，最终考试 2026-06-16
【进度】
${progress}

【用户调整原因】
${reason}

【未完成任务列表】
${taskSummary}

【过期任务数】${overdue.length} 个

请根据调整原因，重新安排未完成的任务。规则：
1. 不能安排在课程时间（参考秘书守则的课程表）
2. 午休12:15-13:30不可用
3. 00:00硬截止
4. 优先级：微积分>物理>高代>英语>其他
5. 保留运动时间17:00-18:00
6. 过期任务要重新安排到最近可用时段

返回JSON数组，每个元素：{"id":任务ID,"date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","reason":"简短说明"}
只输出JSON，不要其他文字。如果某些任务建议删除，在reason中说明"建议删除"。`;

    const el = document.getElementById('rvAiStatus');
    if (el) {
      el.style.display = 'flex';
      el.innerHTML = '<span class="spinner"></span>AI 正在重新规划...';
    }

    try {
      const dsKey = await Auth.loadDeepSeekKey();
      if (!dsKey) { UI.toast('请先在设置中填入 DeepSeek API Key', 'error'); return; }

      const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + dsKey },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2000,
          temperature: 0.15,
        }),
      });
      const d = await r.json();
      const raw = d.choices?.[0]?.message?.content || '';

      // Parse JSON from response
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('AI 返回格式异常');
      const changes = JSON.parse(jsonMatch[0]);

      let applied = 0;
      changes.forEach(c => {
        if (c.reason?.includes('建议删除')) {
          deleteTask(c.id);
          applied++;
        } else {
          const task = plan.tasks.find(t => t.id === c.id);
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
      calEvents = await Cal.loadEventsRange(today, '2026-06-16');
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

    // Scroll to today or selected date
    requestAnimationFrame(() => {
      const target = scrollDate || today;
      const el = document.getElementById('rv-day-' + target);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      scrollDate = null;
    });
  }

  function renderEmpty() {
    return '<div class="rv-empty">'
      + '<div class="rv-empty-icon">📋</div>'
      + '<div class="rv-empty-title">还没有复习计划</div>'
      + '<div class="rv-empty-sub">点击下方按钮生成 28 天备考计划<br>基于你的课程日历和考试安排</div>'
      + '<button class="btn btn-primary rv-gen-btn" onclick="Review.generate()">生成复习计划</button>'
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
    html += '<div class="rv-subj-bars">';
    SUBJECTS.forEach(s => {
      const h = calcSubjectHours(s.id);
      if (h.count === 0) return;
      const donePct  = h.totalMins ? Math.round(h.doneMins / h.totalMins * 100) : 0;
      const doneH    = (h.doneMins/60).toFixed(1);
      const totalH   = (h.totalMins/60).toFixed(1);
      html += '<div class="rv-bar-row">'
        + '<div class="rv-bar-label">'
        + '<span class="rv-bar-dot" style="background:' + s.color + '"></span>'
        + s.short + '</div>'
        + '<div class="rv-bar-track">'
        + '<div class="rv-bar-fill" style="width:' + donePct + '%;background:' + s.color + '"></div></div>'
        + '<div class="rv-bar-val">' + doneH + '/' + totalH + 'h</div></div>';
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
      + 'placeholder="例如：明天下午有临时会议，需要空出 14:00-16:00\n或：微积分进度比预期快，想多分配时间给物理"></textarea>'
      + '<div style="display:flex;gap:8px;margin-top:12px">'
      + '<button class="btn btn-primary" onclick="Review._doReschedule()">开始调整</button>'
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
      + '<div class="rv-form-row"><label>任务名</label><input class="form-input" id="addName" placeholder="例如：微积分-真题第3套"></div>'
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

  function _doEditTask(taskId) {
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
    UI.toast('已更新', 'success');
  }

  function generate() {
    if (hasPlan() && !confirm('已有复习计划，重新生成将覆盖。继续？')) return;
    generateDefaultPlan();
    UI.toast('28 天复习计划已生成！', 'success');
    render();
  }

  function resetPlan() {
    if (confirm('确定清空全部复习计划？此操作不可撤销。')) {
      plan = { tasks: [], version: 2, created: null };
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
    toggleDone, deleteTask, confirmDelete,
    setFilter, openReschedule, _doReschedule,
    openAddTask, _doAddTask,
    openEditTask, _doEditTask,
    syncToCalendar, smartReschedule,
    hasPlan, SUBJECTS, SUBJECT_MAP,
  };
})();
