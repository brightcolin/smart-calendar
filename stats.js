/* ═══════════════════════════════════════════════════
   stats.js — Statistics, charts, weekly report
═══════════════════════════════════════════════════ */

const Stats = (() => {
  let weekOffset = 0;
  let statsMode  = 'week'; // 'week' | 'day'

  function setMode(m, btn) {
    statsMode = m;
    document.querySelectorAll('.stats-mode-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    render();
  }

  function shiftWeek(dir) {
    weekOffset += dir;
    document.getElementById('weekLbl').textContent =
      weekOffset === 0 ? '本周' :
      weekOffset === -1 ? '上周' :
      (weekOffset > 0 ? '+' : '') + weekOffset + '周';
    render();
  }

  function getWeekRange(offset) {
    const d   = new Date();
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1 + offset * 7);
    const fmt = dd => dd.getFullYear() + '-' + String(dd.getMonth()+1).padStart(2,'0') + '-' + String(dd.getDate()).padStart(2,'0');
    const start = fmt(d);
    d.setDate(d.getDate() + 6);
    return { start, end: fmt(d) };
  }

  function getDayRange() {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset);
    const fmt = dd => dd.getFullYear() + '-' + String(dd.getMonth()+1).padStart(2,'0') + '-' + String(dd.getDate()).padStart(2,'0');
    const ds = fmt(d);
    return { start: ds, end: ds };
  }

  /* ── Main line weekly targets (minutes) ── */
  const MAIN_LINES = [
    { label: '学习+课程', tags: ['学习','课程'], target: 1800, color: '#6b9fe0' },
    { label: '科研',      tags: ['科研'],         target: 420,  color: '#4dbdbd' },
    { label: '工作/自媒体',tags: ['工作'],         target: 210,  color: '#e06b6b' },
    { label: '运动',      tags: ['运动'],         target: 210,  color: '#e09b4d' },
    { label: '社工',      tags: ['社工'],         target: 0,    color: '#5dba8a' },
    { label: '娱乐',      tags: ['娱乐'],         target: 0,    color: '#e04d8a' },
  ];

  async function render() {
    const { start, end } = statsMode === 'day' ? getDayRange() : getWeekRange(weekOffset);
    let events = [];
    try {
      events = await Cal.loadEventsRange(start, end);
    } catch(e) {
      events = App.store.tasks.filter(t => t.date >= start && t.date <= end);
    }

    const done    = events.filter(e => e.done || e.actualMins != null);
    const doneCnt = done.length;
    const totalAct = done.reduce((s, e) => s + (e.actualMins || 0), 0);
    const totalEst = events.reduce((s, e) => s + (e.estMins || 0), 0);

    document.getElementById('sDone').textContent  = doneCnt;
    document.getElementById('sTotal').textContent = events.length;
    document.getElementById('sHours').textContent = fmtMins(totalAct);
    document.getElementById('sEst').textContent   = fmtMins(totalEst);

    renderCalChart(events);
    renderTagChart(done);
    renderGroupedChart(done);   // same-activity merge
    renderCompareChart(done);
    renderMainLineDashboard(events);
  }

  /* ── By calendar ── */
  function renderCalChart(events) {
    const calMap = {};
    events.forEach(e => {
      const key = e.calendarId || 'primary';
      if (!calMap[key]) calMap[key] = { mins: 0, count: 0 };
      calMap[key].mins  += e.actualMins || 0;
      calMap[key].count += 1;
    });
    const cals = Cal.getCalendars();
    const maxM = Math.max(...Object.values(calMap).map(v => v.mins), 1);
    document.getElementById('calChart').innerHTML = Object.entries(calMap).map(([id, v]) => {
      const cal  = cals.find(c => c.id === id);
      const name = cal?.name || id;
      const pct  = Math.round(v.mins / maxM * 100);
      return '<div class="bar-row">'
        + '<span class="bar-label" style="width:60px;font-size:11px">' + esc(name.slice(0, 6)) + '</span>'
        + '<div class="bar-wrap"><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + (cal?.color || '#888') + '"></div></div>'
        + '<div class="bar-pct">' + v.count + '个任务</div></div>'
        + '<span class="bar-time">' + (v.mins > 0 ? fmtMins(v.mins) : '—') + '</span>'
        + '</div>';
    }).join('') || '<div style="color:var(--text3);font-size:13px">暂无数据</div>';
  }

  /* ── By tag (prefix format: #标签) ── */
  function renderTagChart(done) {
    const tags    = ['学习','课程','科研','社工','运动','娱乐','工作','其他'];
    const tagMins = {}; tags.forEach(t => tagMins[t] = 0);
    done.forEach(e => { tagMins[e.tag] = (tagMins[e.tag] || 0) + (e.actualMins || 0); });
    const maxM  = Math.max(...Object.values(tagMins), 1);
    const total = Object.values(tagMins).reduce((s, v) => s + v, 0) || 1;
    document.getElementById('barChart').innerHTML = tags
      .filter(tag => tagMins[tag] > 0)
      .map(tag => {
        const m   = tagMins[tag];
        const pct = Math.round(m / maxM * 100);
        const pctOfTotal = Math.round(m / total * 100);
        // Display with prefix format: #工作
        const label = tag !== '其他' ? '#' + tag : tag;
        return '<div class="bar-row">'
          + '<span class="bar-label" style="width:48px;font-size:11px;color:' + (Cal.TAG_HEX[tag] || '#888') + '">' + esc(label) + '</span>'
          + '<div class="bar-wrap">'
          + '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + (Cal.TAG_HEX[tag] || '#888') + '"></div></div>'
          + '<div class="bar-pct">' + pctOfTotal + '%</div>'
          + '</div>'
          + '<span class="bar-time">' + fmtMins(m) + '</span>'
          + '</div>';
      }).join('') || '<div style="color:var(--text3);font-size:13px">完成任务后将显示数据</div>';
  }

  /* ── Grouped by activity name (same activity merged) ── */
  function renderGroupedChart(done) {
    // Group events by normalized name (strip tag prefix)
    const groupMap = {};
    done.forEach(e => {
      const key = e.name.toLowerCase().trim();
      if (!groupMap[key]) groupMap[key] = { name: e.name, tag: e.tag, totalMins: 0, count: 0 };
      groupMap[key].totalMins += e.actualMins || 0;
      groupMap[key].count     += 1;
    });
    // Only show activities that appear more than once OR have significant time
    const groups = Object.values(groupMap)
      .filter(g => g.count > 1 || g.totalMins >= 60)
      .sort((a, b) => b.totalMins - a.totalMins)
      .slice(0, 8);

    const el = document.getElementById('groupedChart');
    if (!el) return;
    if (!groups.length) {
      el.innerHTML = '<div style="color:var(--text3);font-size:13px">重复完成同一活动后将显示合并统计</div>';
      return;
    }
    el.innerHTML = groups.map(g => {
      const avgMins = Math.round(g.totalMins / g.count);
      const color   = Cal.TAG_HEX[g.tag] || '#888';
      const label   = g.tag !== '其他' ? '#' + g.tag : '';
      return '<div class="compare-row">'
        + '<div>'
        + '<div class="compare-name">' + esc(g.name) + (label ? ' <span style="font-size:10px;color:' + color + '">' + esc(label) + '</span>' : '') + '</div>'
        + '<div class="compare-vals">共' + g.count + '次 · 均耗' + fmtMins(avgMins) + '</div>'
        + '</div>'
        + '<div class="compare-detail">'
        + '<div style="font-size:14px;font-weight:500;color:var(--accent)">' + fmtMins(g.totalMins) + '</div>'
        + '<div style="font-size:10px;color:var(--text3)">总耗时</div>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  /* ── Compare chart ── */
  function renderCompareChart(done) {
    const cmp = done.filter(e => e.estMins && e.actualMins != null).slice(-8);
    if (!cmp.length) {
      document.getElementById('compareChart').innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0">完成任务后将显示对比数据</div>';
      return;
    }
    document.getElementById('compareChart').innerHTML = cmp.map(e => {
      const diff   = (e.actualMins || 0) - e.estMins;
      const isOver = diff > 0;
      const maxV   = Math.max(e.estMins, e.actualMins || 0, 1);
      const actPct = Math.round((e.actualMins || 0) / maxV * 100);
      const estPct = Math.round(e.estMins / maxV * 100);
      return '<div class="compare-row">'
        + '<div><div class="compare-name">' + esc(e.name) + '</div>'
        + '<div class="compare-vals">预估' + fmtMins(e.estMins) + ' 实际' + fmtMins(e.actualMins) + '</div>'
        + '<div class="compare-bar-wrap" style="width:100px">'
        + '<div class="compare-bar-fill" style="width:' + estPct + '%;background:var(--text3);height:4px;border-radius:2px;opacity:0.4"></div>'
        + '</div>'
        + '<div class="compare-bar-wrap" style="width:100px;margin-top:2px">'
        + '<div class="compare-bar-fill" style="width:' + actPct + '%;background:' + (isOver ? 'var(--red)' : 'var(--green)') + ';height:4px;border-radius:2px"></div>'
        + '</div>'
        + '</div>'
        + '<div class="compare-detail">'
        + '<div class="compare-diff ' + (isOver ? 'diff-over' : 'diff-under') + '">' + (isOver ? '+' : '') + fmtMins(Math.abs(diff)) + '</div>'
        + '<div style="font-size:10px;color:var(--text3)">' + (isOver ? '超时' : '节省') + '</div>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  /* ── Main line progress dashboard ── */
  function renderMainLineDashboard(events) {
    const el = document.getElementById('mainLineChart');
    if (!el) return;

    // Calculate actual minutes per main line
    const allWithTime = events.filter(e => e.actualMins != null || e.estMins > 0);
    const lines = MAIN_LINES.map(line => {
      const matching = allWithTime.filter(e => line.tags.includes(e.tag));
      const actual = matching.reduce((s, e) => s + (e.actualMins || e.estMins || 0), 0);
      return { ...line, actual };
    });

    // Check if there are non-main-line events
    const mainTags = MAIN_LINES.flatMap(l => l.tags);
    const otherEvents = allWithTime.filter(e => !mainTags.includes(e.tag));
    const otherMins = otherEvents.reduce((s, e) => s + (e.actualMins || e.estMins || 0), 0);

    let html = lines.map(l => {
      const pct = l.target > 0 ? Math.min(100, Math.round(l.actual / l.target * 100)) : (l.actual > 0 ? 100 : 0);
      const status = l.target > 0
        ? (pct >= 100 ? '✓ 达标' : (pct >= 60 ? '进行中' : '待加强'))
        : '';
      const statusCls = pct >= 100 ? 'color:var(--green)' : (pct >= 60 ? 'color:var(--accent)' : 'color:var(--red)');
      return '<div class="mainline-row">'
        + '<div class="mainline-header">'
        + '<span class="mainline-label" style="color:' + l.color + '">' + l.label + '</span>'
        + '<span class="mainline-nums">' + fmtMins(l.actual) + (l.target > 0 ? ' / ' + fmtMins(l.target) : '') + '</span>'
        + '</div>'
        + '<div class="mainline-bar-track">'
        + '<div class="mainline-bar-fill" style="width:' + pct + '%;background:' + l.color + '"></div>'
        + (l.target > 0 ? '<div class="mainline-target-line"></div>' : '')
        + '</div>'
        + (status ? '<div class="mainline-status" style="' + statusCls + '">' + status + ' · ' + pct + '%</div>' : '')
        + '</div>';
    }).join('');

    if (otherMins > 0) {
      html += '<div class="mainline-other">其他：' + fmtMins(otherMins) + '</div>';
    }

    el.innerHTML = html || '<div style="color:var(--text3);font-size:13px">暂无数据</div>';
  }

  /* ══ Weekly AI report ══ */
  async function weekReport() {
    const box = document.getElementById('aiWeekBox');
    const txt = document.getElementById('aiWeekText');
    box.classList.add('visible');
    txt.innerHTML = '<span class="spinner"></span>生成周报中...';
    const { start, end } = getWeekRange(weekOffset);
    let events = [];
    try { events = await Cal.loadEventsRange(start, end); } catch(e) { events = App.store.tasks.filter(t => t.date >= start && t.date <= end); }
    if (!events.length) { txt.textContent = '本周暂无任务数据。'; return; }

    const tags    = ['学习','课程','科研','社工','运动','娱乐','工作','其他'];
    const tagMins = {}; tags.forEach(t => tagMins[t] = 0);
    const done    = events.filter(e => e.done || e.actualMins != null);
    done.forEach(e => { tagMins[e.tag] = (tagMins[e.tag] || 0) + (e.actualMins || 0); });

    // Grouped activity stats for prompt
    const groupMap = {};
    done.forEach(e => {
      const key = e.name.toLowerCase().trim();
      if (!groupMap[key]) groupMap[key] = { name: e.name, count: 0, totalMins: 0 };
      groupMap[key].count    += 1;
      groupMap[key].totalMins += e.actualMins || 0;
    });
    const repeatedActivities = Object.values(groupMap)
      .filter(g => g.count > 1)
      .map(g => g.name + '×' + g.count + '共' + fmtMins(g.totalMins) + '均' + fmtMins(Math.round(g.totalMins/g.count)))
      .join('；') || '无';

    const tagSummary = tags
      .filter(t => tagMins[t] > 0)
      .map(t => '#' + t + ' ' + fmtMins(tagMins[t]))
      .join('，');

    try {
      const DS_BASE = 'https://api.deepseek.com/v1/chat/completions';
      const dsKey   = await Auth.loadDeepSeekKey() || document.getElementById('apiKey').value.trim();
      if (!dsKey) { txt.textContent = '请先设置 DeepSeek API Key。'; return; }
      const r = await fetch(DS_BASE, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + dsKey },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: '你是时间管理专家，用中文生成简洁周报，300字以内，包含：完成情况、按#标签的时间分布、重复活动汇总分析、预估偏差规律、下周改进建议。' },
            { role: 'user', content:
                '周期：' + start + ' 至 ' + end + '\n' +
                '完成率：' + done.length + '/' + events.length + '\n' +
                '各标签时长：' + tagSummary + '\n' +
                '重复活动：' + repeatedActivities + '\n' +
                '超时任务数：' + events.filter(e => (e.actualMins||0) > (e.estMins||0)).length + '\n' +
                '日历：' + Cal.activeCalendarName
            }
          ],
          max_tokens: 700,
          temperature: 0.5,
        })
      });
      const d = await r.json();
      txt.textContent = d.choices?.[0]?.message?.content || '生成失败';
    } catch(e) { txt.textContent = '生成失败：' + e.message; }
  }

  function fmtMins(m) { if (!m && m !== 0) return '—'; return m < 60 ? m + '分' : (m/60).toFixed(1) + 'h'; }

  return { shiftWeek, setMode, render, weekReport };
})();
