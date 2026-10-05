/* LogChecker 3D — application layer */
(function () {
  'use strict';
  const F = window.Fatigue;
  const SPD = F.SPD;
  const STORE = 'logchecker3d.v1';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const SEV_W = { minor: 3, substantial: 6, severe: 12, critical: 20 };
  const SEV_ORDER = ['critical', 'severe', 'substantial', 'minor'];

  const dt = iso => new Date(iso + 'T00:00:00Z');
  const fmtDay = iso => { const d = dt(iso); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
  const fmtLong = iso => { const d = dt(iso); return `${DOW_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const slotTime = s => String(Math.floor(s / 4)).padStart(2, '0') + ':' + String((s % 4) * 15).padStart(2, '0');
  const hm = min => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // ---------------------------------------------------------------- state
  const cache = new Map();
  let stage = null;
  let S = load();
  if (!S) S = seed();

  function load() {
    try { const raw = localStorage.getItem(STORE); if (!raw) return null; const s = JSON.parse(raw); if (!s.drivers || !s.drivers.length) return null; return s; }
    catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ drivers: S.drivers, ncrs: S.ncrs, seq: S.seq, sel: S.sel, span: S.span })); } catch (e) { /* storage blocked: work in memory */ }
  }
  function seed() {
    const s = { drivers: JSON.parse(JSON.stringify(window.SampleFleet.drivers)), ncrs: [], seq: 0, sel: 'd3', span: 14 };
    S = s;
    const pick = (id, sev) => evalFor(s.drivers.find(d => d.id === id)).breaches.find(b => b.severity === sev);
    const b1 = pick('d3', 'critical'), b2 = pick('d4', 'substantial');
    if (b1) addNcr(s.drivers[2], b1, { short: 'Driver stood down for required rest', long: 'Review rostering and scheduling', due: '2026-10-09', owner: 'Transport Manager', notes: 'Driver started 00:30 to make an early Brisbane pickup. Roster to be checked against customer window.', status: 'In progress', raised: '2026-09-21' });
    if (b2) addNcr(s.drivers[3], b2, { short: 'Driver interviewed and counselled', long: '', due: '2026-10-02', owner: 'Compliance Officer', notes: '', status: 'Open', raised: '2026-09-28' });
    cache.clear();
    return s;
  }

  function driver() { return S.drivers.find(d => d.id === S.sel) || S.drivers[0]; }
  function evalFor(d) {
    if (!cache.has(d.id)) cache.set(d.id, F.evaluate(d.days, d.ruleset));
    return cache.get(d.id);
  }
  function lastWorkDay(d) { const k = Object.keys(d.days).sort().reverse().find(x => d.days[x].includes('1')); return k || lastDay(d); }
  function lastDay(d) { const k = Object.keys(d.days).sort(); return k.length ? k[k.length - 1] : todayIso(); }
  function inRange(iso, end, n) { const k = F.isoDiff(iso, end); return k >= 0 && k < n; }
  function breaches14(d) { const end = lastDay(d); return evalFor(d).breaches.filter(b => inRange(b.date, end, 14)); }
  function score(list) { return Math.max(0, 100 - list.reduce((a, b) => a + SEV_W[b.severity], 0)); }
  function ncrFor(key) { return S.ncrs.find(n => n.breachKey === key); }
  function ncrOpen(n) { return n.status !== 'Closed'; }

  const ui = { day: null, range: '14', ncrScope: 'driver', focusKey: null };
  ui.day = lastWorkDay(driver());

  // ---------------------------------------------------------------- roster
  function ring(v) {
    const r = 19, c = 2 * Math.PI * r, col = v >= 90 ? 'var(--ok)' : v >= 70 ? 'var(--minor)' : v >= 50 ? 'var(--substantial)' : 'var(--severe)';
    return `<svg class="ring" viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="${r}" fill="none" stroke="var(--line)" stroke-width="4"/>
      <circle cx="23" cy="23" r="${r}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c * v / 100} ${c}" transform="rotate(-90 23 23)"/>
      <text x="23" y="28" text-anchor="middle">${v}</text></svg>`;
  }
  function renderRoster() {
    $('drivers').innerHTML = S.drivers.map(d => {
      const list = breaches14(d), sc = score(list);
      const counts = SEV_ORDER.filter(s => list.some(b => b.severity === s)).map(s => `<span class="dot" style="background:var(--${s})" title="${list.filter(b => b.severity === s).length} ${s}"></span>`).join('');
      return `<button class="driver" aria-pressed="${d.id === S.sel}" data-id="${esc(d.id)}">
        ${ring(sc)}
        <span style="min-width:0"><span class="nm" style="display:block">${esc(d.name)}</span>
        <span class="meta" style="display:block">${d.ruleset === 'bfm' ? 'BFM' : 'Standard Hours'} · ${esc(d.rego || 'No rego')}</span></span>
        <span class="flags"><span class="mono" style="font-size:12px">${list.length ? list.length + ' breach' + (list.length > 1 ? 'es' : '') : 'Clear'}</span><span style="display:flex;gap:3px">${counts}</span></span>
      </button>`;
    }).join('');
  }
  $('drivers').addEventListener('click', e => {
    const b = e.target.closest('.driver'); if (!b) return;
    S.sel = b.dataset.id; ui.day = lastWorkDay(driver()); ui.focusKey = null; save(); renderAll(true);
  });

  // ---------------------------------------------------------------- stage
  function windowEnd() {
    const d = driver(); let end = lastDay(d);
    if (ui.day > end) end = ui.day;
    if (F.isoDiff(ui.day, end) >= S.span) end = F.isoAdd(ui.day, S.span - 1);
    return end;
  }
  function windowDays() {
    const d = driver(), end = windowEnd(), out = [];
    for (let k = S.span - 1; k >= 0; k--) { const iso = F.isoAdd(end, -k); out.push({ iso, label: fmtDay(iso), str: d.days[iso] || null }); }
    return out;
  }
  function renderStage(animate) {
    const d = driver(), rs = F.RULESETS[d.ruleset];
    $('hudName').textContent = d.name;
    $('hudSub').textContent = `${rs.name} · ${rs.sub} · ${d.licence || 'Licence not recorded'} · ${d.base || ''}`.replace(/ · $/, '');
    if (!stage) return;
    const days = windowDays();
    const list = evalFor(d).breaches.map(b => ({ iso: b.date, slot: b.slot, severity: b.severity, key: b.key }));
    stage.select(ui.day);
    stage.setData(days, list, ui.day, animate);
  }
  $('span7').onclick = () => setSpan(7);
  $('span14').onclick = () => setSpan(14);
  function setSpan(n) { S.span = n; $('span7').setAttribute('aria-pressed', n === 7); $('span14').setAttribute('aria-pressed', n === 14); save(); renderStage(true); renderWeek(); }
  $('spinBtn').onclick = e => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); stage && stage.setSpin(on); };

  // ---------------------------------------------------------------- KPIs
  function renderKpis() {
    const d = driver(), list = breaches14(d), sc = score(list);
    const t = F.totals(d.days, lastDay(d));
    const open = S.ncrs.filter(n => n.driverId === d.id && ncrOpen(n)).length;
    const sevC = list.filter(b => b.severity === 'severe' || b.severity === 'critical').length;
    $('kpis').innerHTML = [
      [sc + '<span style="font-size:16px;color:var(--muted)">/100</span>', 'Compliance score, 14 days', sc >= 90 ? 'var(--ok)' : sc >= 70 ? 'var(--minor)' : 'var(--severe)'],
      [list.length, 'Breaches in 14 days', ''],
      [sevC, 'Severe or critical', sevC ? 'var(--critical)' : ''],
      [(t[7].work / 60).toFixed(1) + '<span style="font-size:16px;color:var(--muted)">h</span>', 'Work in last 7 days', ''],
      [open, 'NCRs open', open ? 'var(--accent)' : '']
    ].map(([v, l, c]) => `<div class="kpi"><div class="v" style="${c ? 'color:' + c : ''}">${v}</div><div class="l">${l}</div></div>`).join('');
  }

  // ---------------------------------------------------------------- diary
  function buildDiaryChrome() {
    const ax = $('axis'); let h = '';
    for (let i = 0; i <= 24; i++) {
      const l = i === 0 || i === 24 ? 'Midnight' : i === 12 ? 'Noon' : String(i % 12);
      h += `<span style="left:${i / 24 * 100}%">${l}</span><i style="left:${i / 24 * 100}%;height:10px"></i>`;
      if (i < 24) h += `<i style="left:${(i + .5) / 24 * 100}%;height:6px"></i><i style="left:${(i + .25) / 24 * 100}%;height:3px"></i><i style="left:${(i + .75) / 24 * 100}%;height:3px"></i>`;
    }
    ax.innerHTML = h;
    ['laneWork', 'laneRest'].forEach(id => {
      let c = '';
      for (let s = 0; s < SPD; s++) c += `<div class="c${s < 32 || s >= 88 ? ' nt' : ''}" data-s="${s}" title="${slotTime(s)}"></div>`;
      $(id).innerHTML = c;
    });
  }

  function paintCells(str) {
    const w = $('laneWork').children, r = $('laneRest').children;
    let work = 0;
    for (let s = 0; s < SPD; s++) {
      const v = str ? str[s] : null;
      w[s].classList.toggle('on', v === '1'); r[s].classList.toggle('on', v === '0');
      if (v === '1') work++;
    }
    $('totWork').textContent = hm(work * 15);
    $('totRest').textContent = str ? hm((SPD - work) * 15) : '—';
    $('totWork').style.color = work > 48 ? 'var(--severe)' : '';
  }

  function renderDiary() {
    const d = driver(), str = d.days[ui.day];
    $('dayPick').value = ui.day;
    $('diaryTitle').textContent = fmtLong(ui.day);
    const di = (d.diary && d.diary[ui.day]) || {};
    $('diaryNo').value = di.no || ''; $('pageNo').value = di.page || '';
    $('nodata').hidden = !!str;
    paintCells(str);
    // breach markers and window shading for this day
    const ev = evalFor(d);
    const today = ev.breaches.filter(b => b.date === ui.day);
    $('marks').innerHTML = today.map(b => `<b style="left:${(b.slot + .5) / SPD * 100}%;border-top-color:var(--${b.severity});color:var(--${b.severity})" title="${esc(b.rule.label)} · ${b.severity}"></b>`).join('');
    const sel = ui.focusKey && ev.breaches.find(b => b.key === ui.focusKey);
    const w = $('laneWork').children, r = $('laneRest').children;
    for (let s = 0; s < SPD; s++) { w[s].classList.remove('win'); r[s].classList.remove('win'); }
    if (sel && ui.day >= sel.wsDate && ui.day <= sel.weDate) {
      const a = ui.day === sel.wsDate ? sel.wsSlot : 0, z = ui.day === sel.weDate ? sel.weSlot : SPD - 1;
      for (let s = a; s <= z; s++) { w[s].classList.add('win'); r[s].classList.add('win'); }
    }
  }

  // painting
  let paint = null;
  function slotAt(lane, x) { const r = lane.getBoundingClientRect(); return Math.max(0, Math.min(SPD - 1, Math.floor((x - r.left) / r.width * SPD))); }
  function startPaint(lane, val, ev) {
    const d = driver();
    const arr = (d.days[ui.day] || '0'.repeat(SPD)).split('');
    const s = slotAt(lane, ev.clientX);
    paint = { lane, val, arr, last: s };
    arr[s] = val; paintCells(arr.join(''));
    lane.setPointerCapture(ev.pointerId);
  }
  function movePaint(ev) {
    if (!paint) return;
    const s = slotAt(paint.lane, ev.clientX);
    const [a, b] = s < paint.last ? [s, paint.last] : [paint.last, s];
    for (let i = a; i <= b; i++) paint.arr[i] = paint.val;
    paint.last = s; paintCells(paint.arr.join(''));
  }
  function endPaint() {
    if (!paint) return;
    const d = driver();
    d.days[ui.day] = paint.arr.join('');
    paint = null;
    commit();
  }
  [['laneWork', '1'], ['laneRest', '0']].forEach(([id, v]) => {
    const lane = $(id);
    lane.addEventListener('pointerdown', ev => { ev.preventDefault(); startPaint(lane, v, ev); });
    lane.addEventListener('pointermove', movePaint);
    lane.addEventListener('pointerup', endPaint);
    lane.addEventListener('pointercancel', endPaint);
  });

  function commit() {
    cache.delete(driver().id);
    save();
    renderRoster(); renderStage(false); renderKpis(); renderDiary(); renderWeek(); renderTotals(); renderBreaches(); renderNcrs();
  }

  function setDay(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    ui.day = iso; ui.focusKey = null;
    renderStage(false); renderDiary(); renderWeek(); renderTotals(); renderBreaches();
  }
  $('prevDay').onclick = () => setDay(F.isoAdd(ui.day, -1));
  $('nextDay').onclick = () => setDay(F.isoAdd(ui.day, 1));
  $('dayPick').onchange = e => setDay(e.target.value);
  $('copyPrev').onclick = () => {
    const d = driver(), prev = d.days[F.isoAdd(ui.day, -1)];
    if (!prev) { toast('The previous day has no record to copy'); return; }
    d.days[ui.day] = prev; commit(); toast('Copied ' + fmtDay(F.isoAdd(ui.day, -1)));
  };
  $('clearDay').onclick = () => {
    const d = driver(), old = d.days[ui.day]; if (!old) return;
    const day = ui.day; delete d.days[day]; commit();
    toast('Page cleared', 'Undo', () => { d.days[day] = old; commit(); });
  };
  ['diaryNo', 'pageNo'].forEach(id => $(id).addEventListener('change', () => {
    const d = driver(); d.diary = d.diary || {};
    d.diary[ui.day] = { no: $('diaryNo').value.trim(), page: $('pageNo').value.trim() }; save();
  }));

  // week / fortnight strips
  function renderWeek() {
    const d = driver(), days = windowDays().slice().reverse(), ev = evalFor(d);
    $('week').innerHTML = days.map(x => {
      let work = 0; if (x.str) for (const c of x.str) if (c === '1') work++;
      const marks = ev.breaches.filter(b => b.date === x.iso).map(b => `<span class="bm" style="left:${(b.slot + .5) / SPD * 100}%;background:var(--${b.severity})"></span>`).join('');
      return `<div class="wrow" data-iso="${x.iso}" aria-current="${x.iso === ui.day}" role="button" tabindex="0">
        <span class="d">${fmtDay(x.iso)}</span>
        <div class="wstrip"><canvas width="96" height="1" data-str="${x.str || ''}"></canvas>${marks}</div>
        <span class="t">${x.str ? hm(work * 15) : '—'}</span></div>`;
    }).join('');
    const css = getComputedStyle(document.documentElement);
    const cw = css.getPropertyValue('--work').trim(), cr = css.getPropertyValue('--rest').trim(), cn = css.getPropertyValue('--line-soft').trim();
    $('week').querySelectorAll('canvas').forEach(c => {
      const g = c.getContext('2d'), s = c.dataset.str;
      for (let i = 0; i < SPD; i++) { g.fillStyle = !s ? cn : s[i] === '1' ? cw : cr; g.fillRect(i, 0, 1, 1); }
    });
  }
  $('week').addEventListener('click', e => { const r = e.target.closest('.wrow'); if (r) setDay(r.dataset.iso); });
  $('week').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const r = e.target.closest('.wrow'); if (r) { e.preventDefault(); setDay(r.dataset.iso); } } });

  // ---------------------------------------------------------------- totals
  function renderTotals() {
    const d = driver(), t = F.totals(d.days, ui.day), rs = F.RULESETS[d.ruleset];
    const lim = { 1: rs.rules.find(r => r.len === 96).maxWork * 15, 7: d.ruleset === 'bfm' ? null : 72 * 60, 14: 144 * 60 };
    $('totTitle').textContent = 'Totals to end of ' + fmtDay(ui.day);
    $('totals').innerHTML = [1, 7, 14].map(n => {
      const x = t[n], L = lim[n], pct = L ? Math.min(100, x.work / L * 100) : 0;
      return `<div class="tot"><h4>${n === 1 ? '1 day' : n + ' days'}</h4>
        <div class="row"><span>Work</span><b style="color:var(--work)">${hm(x.work)}</b></div>
        <div class="row"><span>Rest</span><b style="color:var(--rest)">${hm(x.rest)}</b></div>
        ${L ? `<div class="meter"><b class="${x.work > L ? 'over' : ''}" style="width:${pct}%"></b></div><div class="lim">${Math.round(x.work / L * 100)}% of the ${L / 60} h ${n === 1 ? '24-hour' : n + '-day'} limit</div>` : `<div class="meter"></div><div class="lim">No 7-day work cap under BFM</div>`}
        <div class="lim">${x.days} of ${n} day${n > 1 ? 's' : ''} recorded</div></div>`;
    }).join('');
  }

  // ---------------------------------------------------------------- breaches
  function describe(b) {
    if (b.kind === 'night') return { head: `${b.rule.label} · night rest`, body: `${b.value} night rest break${b.value === 1 ? '' : 's'} taken, ${b.limit} required${b.pair ? '' : ', none on consecutive nights'}`, amt: b.amount ? `${b.amount} short` : 'not consecutive' };
    if (b.kind === 'rest') return { head: `${b.rule.label} · continuous rest`, body: `Longest stationary rest ${hm(b.value)}, needs ${hm(b.limit)}`, amt: `${hm(b.amount)} short` };
    if (b.rule.cumulative) return { head: b.rule.label, body: `Worked ${hm(b.value)} without a 24-hour rest, limit ${hm(b.limit)}`, amt: `${hm(b.amount)} over` };
    return { head: `${b.rule.label} · work time`, body: `Worked ${hm(b.value)} in ${b.rule.label}, limit ${hm(b.limit)}`, amt: `${hm(b.amount)} over` };
  }
  function filtered() {
    const d = driver(), all = evalFor(d).breaches;
    if (ui.range === 'all') return all;
    return all.filter(b => inRange(b.date, ui.day, +ui.range));
  }
  function renderBreaches() {
    const list = filtered().slice().reverse();
    const scope = ui.range === 'all' ? 'in all records' : ui.range === '1' ? 'on ' + fmtDay(ui.day) : `in the ${ui.range} days to ${fmtDay(ui.day)}`;
    $('brTitle').textContent = list.length ? `${list.length} breach${list.length > 1 ? 'es' : ''} ${scope}` : 'No breaches ' + scope;
    if (!list.length) { $('blist').innerHTML = `<div class="empty"><b>Compliant</b>No work or rest breaches ${scope} under ${F.RULESETS[driver().ruleset].name}.</div>`; return; }
    $('blist').innerHTML = list.map(b => {
      const t = describe(b), n = ncrFor(b.key);
      return `<div class="breach${b.key === ui.focusKey ? ' sel' : ''}" data-key="${esc(b.key)}">
        <span class="stripe" style="background:var(--${b.severity})"></span>
        <div style="min-width:0">
          <div class="t1"><span class="pill sev-${b.severity}">${b.severity}</span><span class="rl">${esc(t.head)}</span><span class="mono c-${b.severity}" style="font-size:13px">${t.amt}</span></div>
          <div class="t2">${esc(t.body)}</div>
          <div class="t2 mono" style="font-size:12px">${b.kind === 'work' ? 'Limit passed' : 'Period ended'} ${fmtDay(b.date)} ${slotTime(b.slot)} · counted from ${fmtDay(b.wsDate)} ${slotTime(b.wsSlot)}</div>
        </div>
        <div class="acts">
          <button class="btn sm" data-act="show">Show</button>
          ${n ? `<span class="ncr-tag" title="${esc(n.status)}">${esc(n.id)} · ${esc(n.status)}</span>` : `<button class="btn sm primary" data-act="ncr">Raise NCR</button>`}
        </div></div>`;
    }).join('');
  }
  $('blist').addEventListener('click', e => {
    const row = e.target.closest('.breach'); if (!row) return;
    const b = evalFor(driver()).breaches.find(x => x.key === row.dataset.key); if (!b) return;
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'ncr') { openNcr(b); return; }
    ui.focusKey = b.key; ui.day = b.date;
    renderStage(false); renderDiary(); renderWeek(); renderTotals(); renderBreaches();
    if (stage) { stage.focusOn(b.key); $('spinBtn').setAttribute('aria-pressed', 'false'); }
    $('stage').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document.querySelectorAll('[data-range]').forEach(c => c.onclick = () => {
    ui.range = c.dataset.range;
    document.querySelectorAll('[data-range]').forEach(x => x.setAttribute('aria-pressed', x === c));
    renderBreaches();
  });

  // ---------------------------------------------------------------- NCR
  let pending = null;
  function nextNcrId() { S.seq = (S.seq || 0) + 1; return 'NCR-' + String(S.seq).padStart(4, '0'); }
  function addNcr(d, b, f) {
    const t = describe(b);
    const n = Object.assign({ id: nextNcrId(), driverId: d.id, driverName: d.name, breachKey: b.key, rule: `${t.head} — ${t.amt}`, severity: b.severity,
      when: `${fmtDay(b.date)} ${b.date.slice(0, 4)} ${slotTime(b.slot)}`, raised: todayIso() }, f);
    S.ncrs.push(n); return n;
  }
  function openNcr(b) {
    pending = b;
    const d = driver(), t = describe(b);
    $('ncrNo').textContent = 'NCR-' + String((S.seq || 0) + 1).padStart(4, '0') + ' · ' + d.name;
    $('ncrRef').innerHTML = `<span class="pill sev-${b.severity}">${b.severity}</span> <b>${esc(t.head)}</b> <span class="mono c-${b.severity}">${t.amt}</span><br><span class="hint">${esc(t.body)} · ${fmtLong(b.date)} ${slotTime(b.slot)}</span>`;
    $('ncrShort').value = ''; $('ncrLong').value = ''; $('ncrNotes').value = ''; $('ncrErr').textContent = '';
    $('ncrOwner').value = 'Transport Manager';
    $('ncrDue').value = F.isoAdd(todayIso(), b.severity === 'critical' || b.severity === 'severe' ? 2 : 7);
    $('ncrDlg').showModal();
  }
  $('ncrCancel').onclick = () => $('ncrDlg').close();
  $('ncrForm').addEventListener('submit', e => {
    e.preventDefault();
    const short = $('ncrShort').value, due = $('ncrDue').value, owner = $('ncrOwner').value.trim();
    if (!short || !due || !owner) { $('ncrErr').textContent = 'Choose a short-term action, a due date and who it is assigned to.'; return; }
    const n = addNcr(driver(), pending, { short, long: $('ncrLong').value, due, owner, notes: $('ncrNotes').value.trim(), status: 'Open' });
    save(); $('ncrDlg').close(); renderRoster(); renderKpis(); renderBreaches(); renderNcrs();
    toast(n.id + ' raised');
  });
  function renderNcrs() {
    const all = ui.ncrScope === 'all';
    const list = S.ncrs.filter(n => all || n.driverId === S.sel).slice().reverse();
    const today = todayIso();
    if (!list.length) { $('ncrTable').innerHTML = `<tbody><tr><td><div class="empty" style="border:0">No NCRs ${all ? 'for the fleet' : 'for ' + esc(driver().name)} yet. Use Raise NCR on a breach to open one.</div></td></tr></tbody>`; return; }
    $('ncrTable').innerHTML = `<thead><tr><th>NCR</th>${all ? '<th>Driver</th>' : ''}<th>Breach</th><th>Short-term action</th><th>Long-term action</th><th>Assigned</th><th>Due</th><th>Status</th></tr></thead><tbody>` +
      list.map(n => `<tr>
        <td class="mono">${esc(n.id)}<div class="hint">Raised ${esc(n.raised)}</div></td>
        ${all ? `<td>${esc(n.driverName)}</td>` : ''}
        <td><span class="pill sev-${esc(n.severity)}">${esc(n.severity)}</span> ${esc(n.rule)}<div class="hint">${esc(n.when)}</div>${n.notes ? `<div class="hint">${esc(n.notes)}</div>` : ''}</td>
        <td>${esc(n.short)}</td><td>${esc(n.long) || '<span class="hint">—</span>'}</td><td>${esc(n.owner)}</td>
        <td class="num ${n.due < today && ncrOpen(n) ? 'overdue' : ''}">${esc(n.due)}${n.due < today && ncrOpen(n) ? '<div style="font-size:12px">Overdue</div>' : ''}</td>
        <td><select class="status" data-ncr-id="${esc(n.id)}" aria-label="Status of ${esc(n.id)}">${['Open', 'In progress', 'Closed'].map(s => `<option${s === n.status ? ' selected' : ''}>${s}</option>`).join('')}</select></td>
      </tr>`).join('') + '</tbody>';
  }
  document.addEventListener('change', e => {
    const id = e.target.dataset && e.target.dataset.ncrId; if (!id) return;
    const n = S.ncrs.find(x => x.id === id); if (!n) return;
    n.status = e.target.value; save(); renderRoster(); renderKpis(); renderBreaches(); renderNcrs(); renderReport();
    toast(`${n.id} set to ${n.status}`);
  });
  document.querySelectorAll('[data-ncr]').forEach(c => c.onclick = () => {
    ui.ncrScope = c.dataset.ncr;
    document.querySelectorAll('[data-ncr]').forEach(x => x.setAttribute('aria-pressed', x === c));
    renderNcrs();
  });

  // ---------------------------------------------------------------- drivers
  $('addDriverBtn').onclick = () => { $('drvForm').reset(); $('drvErr').textContent = ''; $('drvDlg').showModal(); };
  $('drvCancel').onclick = () => $('drvDlg').close();
  $('drvForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('drvName').value.trim();
    if (!name) { $('drvErr').textContent = 'Enter the driver’s full name.'; return; }
    const d = { id: 'u' + Date.now().toString(36), name, licence: $('drvLic').value.trim(), rego: $('drvRego').value.trim(), base: '', ruleset: $('drvRule').value, days: {}, diary: {} };
    S.drivers.push(d); S.sel = d.id; ui.day = todayIso(); save(); $('drvDlg').close(); renderAll(true);
    toast(name + ' added. Paint today’s diary page to start.');
  });
  $('resetBtn').onclick = () => {
    const before = JSON.stringify({ drivers: S.drivers, ncrs: S.ncrs, seq: S.seq, sel: S.sel, span: S.span });
    try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ }
    S = seed(); ui.day = lastDay(driver()); save(); renderAll(true);
    toast('Example data restored', 'Undo', () => { S = JSON.parse(before); cache.clear(); ui.day = lastDay(driver()); save(); renderAll(true); });
  };

  // ---------------------------------------------------------------- report
  function renderReport() {
    const rows = S.drivers.map(d => {
      const list = breaches14(d), end = lastDay(d), t = F.totals(d.days, end);
      const c = {}; F.SEVERITY.forEach(s => c[s] = list.filter(b => b.severity === s).length);
      const noNcr = list.filter(b => !ncrFor(b.key) && (b.severity === 'severe' || b.severity === 'critical')).length;
      return { d, list, end, c, sc: score(list), work: t[14].work, noNcr };
    });
    const ends = rows.map(r => r.end).sort();
    $('repPeriod').textContent = `14 days to ${fmtLong(ends[ends.length - 1])} · prepared ${fmtLong(todayIso())}`;
    const tot = rows.reduce((a, r) => a + r.list.length, 0);
    const sc = rows.reduce((a, r) => a + r.c.severe + r.c.critical, 0);
    const avg = Math.round(rows.reduce((a, r) => a + r.sc, 0) / Math.max(1, rows.length));
    const open = S.ncrs.filter(ncrOpen).length;
    const overdue = S.ncrs.filter(n => ncrOpen(n) && n.due < todayIso()).length;
    $('repKpis').innerHTML = [
      [avg + '<span style="font-size:16px;color:var(--muted)">/100</span>', 'Fleet compliance score', avg >= 90 ? 'var(--ok)' : avg >= 70 ? 'var(--minor)' : 'var(--severe)'],
      [rows.length, 'Drivers audited', ''],
      [tot, 'Breaches in 14 days', ''],
      [sc, 'Severe or critical', sc ? 'var(--critical)' : ''],
      [open + (overdue ? ` <span style="font-size:16px;color:var(--severe)">${overdue} overdue</span>` : ''), 'NCRs open', open ? 'var(--accent)' : '']
    ].map(([v, l, c]) => `<div class="kpi"><div class="v" style="${c ? 'color:' + c : ''}">${v}</div><div class="l">${l}</div></div>`).join('');
    $('repTable').innerHTML = `<thead><tr><th>Driver</th><th>Rule set</th><th class="num">Work 14 d</th><th class="num">Minor</th><th class="num">Substantial</th><th class="num">Severe</th><th class="num">Critical</th><th>Mix</th><th class="num">Score</th><th>Action needed</th></tr></thead><tbody>` +
      rows.map(r => {
        const n = r.list.length || 1;
        const bar = r.list.length ? F.SEVERITY.map(s => `<i style="width:${r.c[s] / n * 100}%;background:var(--${s})"></i>`).join('') : '<i style="width:100%;background:var(--ok);opacity:.5"></i>';
        return `<tr><td><button class="btn sm ghost" data-goto="${esc(r.d.id)}">${esc(r.d.name)}</button></td><td>${r.d.ruleset === 'bfm' ? 'BFM' : 'Standard'}</td>
          <td class="num">${hm(r.work)}</td>${F.SEVERITY.map(s => `<td class="num ${r.c[s] ? 'c-' + s : ''}">${r.c[s]}</td>`).join('')}
          <td><div class="sevbar">${bar}</div></td><td class="num"><b>${r.sc}</b></td>
          <td>${r.noNcr ? `<span class="overdue">${r.noNcr} severe or critical without NCR</span>` : r.list.some(b => b.severity === 'severe' || b.severity === 'critical') ? '<span class="hint">NCRs in place for severe and critical breaches</span>' : r.list.length ? '<span class="hint">Minor or substantial only. Review with driver</span>' : '<span style="color:var(--ok)">Compliant</span>'}</td></tr>`;
      }).join('') + '</tbody>';
    const today = todayIso();
    $('repNcr').innerHTML = S.ncrs.length ? `<thead><tr><th>NCR</th><th>Driver</th><th>Breach</th><th>Action</th><th>Assigned</th><th>Due</th><th>Status</th></tr></thead><tbody>` +
      S.ncrs.slice().reverse().map(n => `<tr><td class="mono">${esc(n.id)}</td><td>${esc(n.driverName)}</td><td><span class="pill sev-${esc(n.severity)}">${esc(n.severity)}</span> ${esc(n.rule)}<div class="hint">${esc(n.when)}</div></td>
        <td>${esc(n.short)}${n.long ? `<div class="hint">${esc(n.long)}</div>` : ''}</td><td>${esc(n.owner)}</td>
        <td class="num ${n.due < today && ncrOpen(n) ? 'overdue' : ''}">${esc(n.due)}</td><td>${esc(n.status)}</td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td><div class="empty" style="border:0">No NCRs raised.</div></td></tr></tbody>';
    S._rows = rows;
  }
  $('repTable').addEventListener('click', e => {
    const b = e.target.closest('[data-goto]'); if (!b) return;
    S.sel = b.dataset.goto; ui.day = lastDay(driver()); ui.focusKey = null; save(); location.hash = 'audit'; showView('audit'); renderAll(true);
  });
  $('copyReport').onclick = () => {
    const rows = S._rows || [];
    const L = [];
    L.push('APEX TRANSPORT AND DISTRIBUTION — FATIGUE COMPLIANCE REPORT');
    L.push($('repPeriod').textContent); L.push('');
    rows.forEach(r => {
      L.push(`${r.d.name} (${r.d.ruleset === 'bfm' ? 'BFM' : 'Standard Hours'}) — score ${r.sc}/100, work ${hm(r.work)} in 14 days`);
      if (!r.list.length) L.push('  No breaches.');
      r.list.forEach(b => { const t = describe(b), n = ncrFor(b.key); L.push(`  [${b.severity.toUpperCase()}] ${fmtDay(b.date)} ${slotTime(b.slot)} ${t.head}: ${t.body} (${t.amt})${n ? ' — ' + n.id + ' ' + n.status : ' — no NCR'}`); });
      L.push('');
    });
    L.push('NCR REGISTER');
    S.ncrs.forEach(n => L.push(`  ${n.id} ${n.driverName} — ${n.rule}; action: ${n.short}${n.long ? ' / ' + n.long : ''}; ${n.owner}; due ${n.due}; ${n.status}`));
    const text = L.join('\n');
    const done = () => toast('Report copied to clipboard');
    try {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text));
    } catch (e) { fallbackCopy(text); }
  };
  function fallbackCopy(text) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove(); toast(ok ? 'Report copied to clipboard' : 'Copy was blocked by the browser');
  }

  // ---------------------------------------------------------------- rule book
  function renderRules() {
    const band = (t, word) => `<span class="c-minor">≤ ${t[0]}m</span> · <span class="c-substantial">≤ ${t[1]}m</span> · <span class="c-severe">≤ ${t[2]}m</span> · <span class="c-critical">&gt; ${t[2]}m</span> ${word}`;
    $('rulebook').innerHTML = Object.values(F.RULESETS).map(rs => `<section class="panel">
      <div class="panel-head"><div><p class="eyebrow">${esc(rs.sub)}</p><h2 class="h">${esc(rs.name)}</h2></div></div>
      <div class="table-scroll"><table><thead><tr><th>In any period of</th><th>Maximum work</th><th>Minimum rest</th></tr></thead><tbody>
      ${rs.rules.map(r => { const [a, b] = r.text.split(' · '); return `<tr><td><b>${esc(r.label)}</b></td><td>${esc(a.replace(/^Max /, ''))}</td><td>${esc((b || a).replace(/^[Mm]in /, ''))}</td></tr>`; }).join('')}
      </tbody></table></div>
      <p class="eyebrow" style="margin-top:16px">Breach risk categories · minor · substantial · severe · critical</p>
      <div class="table-scroll"><table><tbody>
      ${rs.rules.map(r => `<tr><td><b>${esc(r.label)}</b></td><td class="mono" style="font-size:12.5px">${band(r.cat, 'over')}${r.restCat ? '<br>' + band(r.restCat, 'short of rest') : ''}${r.nightMin ? '<br><span class="hint">Night rest: 1 short substantial, 2+ short severe, none critical</span>' : ''}</td></tr>`).join('')}
      </tbody></table></div></section>`).join('');
  }

  // ---------------------------------------------------------------- shell
  function toast(msg, label, fn) {
    const t = $('toast');
    t.innerHTML = esc(msg) + (label ? ` <button class="btn sm" style="margin-left:8px;pointer-events:auto" id="toastAct">${esc(label)}</button>` : '');
    t.classList.add('on'); t.style.pointerEvents = label ? 'auto' : 'none';
    if (label) $('toastAct').onclick = () => { t.classList.remove('on'); fn(); };
    clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), label ? 6000 : 2400);
  }
  function showView(v) {
    if (!['audit', 'report', 'rules'].includes(v)) v = 'audit';
    document.querySelectorAll('.view').forEach(x => { x.hidden = x.id !== 'view-' + v; });
    document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.view === v));
    if (v === 'report') renderReport();
    if (v === 'audit' && stage) stage.resize();
  }
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => { location.hash = t.dataset.view; showView(t.dataset.view); window.scrollTo(0, 0); });
  window.addEventListener('hashchange', () => showView(location.hash.slice(1)));

  function renderAll(animate) {
    renderRoster(); renderStage(animate); renderKpis(); renderDiary(); renderWeek(); renderTotals(); renderBreaches(); renderNcrs(); renderReport();
  }

  buildDiaryChrome();
  $('span7').setAttribute('aria-pressed', S.span === 7); $('span14').setAttribute('aria-pressed', S.span !== 7);
  if (window.THREE && THREE.OrbitControls) stage = new window.Stage($('stage'), $('tip'), iso => setDay(iso));
  else $('stage').innerHTML = '<div class="nogl">The 3D view could not load. The diary and breach tools below still work.</div>';
  renderRules();
  renderAll(true);
  showView(location.hash.slice(1) || 'audit');
  // re-draw labels once web fonts arrive so sprites use the right face
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => renderStage(false));
})();
