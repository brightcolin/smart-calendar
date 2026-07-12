/* ═══════════════════════════════════════════════════
   stats.js — Statistics, charts, weekly report
═══════════════════════════════════════════════════ */

const Stats = (() => {
  let weekOffset = 0;

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
    const start = d.toISOString().slice(0, 10);
    d.setDate(d.getDate() + 6);
    return { start, end: d.toISOString().slice(0, 10) };
  }

  async function render() {
    const { start, end } = getWeekRange(weekOffset);
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

  return { shiftWeek, render, weekReport };
})();
