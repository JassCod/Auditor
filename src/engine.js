/* LogChecker fatigue engine
 * Evaluates work/rest records against NHVR rule sets under the Heavy Vehicle
 * National Law (HVNL) and the Heavy Vehicle (Fatigue Management) National Regulation.
 *
 * Time is held as 15-minute slots (96 per day), the unit work diaries are kept in.
 * A slot value of 1 is work time, 0 is rest time.
 */
(function (root) {
  'use strict';

  const SPD = 96;          // slots per day
  const SLOT_MIN = 15;     // minutes per slot
  const H = 4;             // slots per hour

  // Breach risk categories. Thresholds are minutes over the limit (work) or
  // minutes short of the requirement (rest): [minor, substantial, severe].
  // Anything beyond the third number is critical.
  const CAT_SHORT = [15, 30, 45];
  const CAT_11H = [45, 60, 75];
  const CAT_24H = [45, 75, 90];
  const CAT_MULTI = [90, 150, 180];
  const CAT_REST = [45, 75, 90];

  const RULESETS = {
    standard: {
      id: 'standard',
      name: 'Standard Hours',
      sub: 'Solo driver',
      rules: [
        { id: 'w5h', label: '5½ hours', len: 5.5 * H, maxWork: 5.25 * H, cat: CAT_SHORT,
          text: 'Max 5¼ h work · min 15 min continuous rest' },
        { id: 'w8h', label: '8 hours', len: 8 * H, maxWork: 7.5 * H, cat: CAT_SHORT,
          text: 'Max 7½ h work · min 30 min rest in 15 min blocks' },
        { id: 'w11h', label: '11 hours', len: 11 * H, maxWork: 10 * H, cat: CAT_11H,
          text: 'Max 10 h work · min 60 min rest in 15 min blocks' },
        { id: 'w24h', label: '24 hours', len: 24 * H, maxWork: 12 * H, cat: CAT_24H,
          minRest: 7 * H, restCat: CAT_REST,
          text: 'Max 12 h work · min 7 continuous hours stationary rest' },
        { id: 'w7d', label: '7 days', len: 7 * SPD, maxWork: 72 * H, cat: CAT_MULTI,
          minRest: 24 * H, restCat: CAT_REST,
          text: 'Max 72 h work · min 24 continuous hours stationary rest' },
        { id: 'w14d', label: '14 days', len: 14 * SPD, maxWork: 144 * H, cat: CAT_MULTI,
          nightMin: 2, nightConsecutive: 2,
          text: 'Max 144 h work · min 2 night rest breaks, 2 on consecutive days' }
      ]
    },
    bfm: {
      id: 'bfm',
      name: 'BFM',
      sub: 'Basic Fatigue Management · solo',
      rules: [
        { id: 'b6h', label: '6¼ hours', len: 6.25 * H, maxWork: 6 * H, cat: CAT_SHORT,
          text: 'Max 6 h work · min 15 min continuous rest' },
        { id: 'b9h', label: '9 hours', len: 9 * H, maxWork: 8.5 * H, cat: CAT_SHORT,
          text: 'Max 8½ h work · min 30 min rest in 15 min blocks' },
        { id: 'b12h', label: '12 hours', len: 12 * H, maxWork: 11 * H, cat: CAT_11H,
          text: 'Max 11 h work · min 60 min rest in 15 min blocks' },
        { id: 'b24h', label: '24 hours', len: 24 * H, maxWork: 14 * H, cat: CAT_24H,
          minRest: 7 * H, restCat: CAT_REST,
          text: 'Max 14 h work · min 7 continuous hours stationary rest' },
        { id: 'b14d', label: '14 days', len: 14 * SPD, maxWork: 144 * H, cat: CAT_MULTI,
          nightMin: 4, nightConsecutive: 2,
          text: 'Max 144 h work · min 4 night rest breaks, 2 on consecutive days' },
        { id: 'b84', label: '84 h before 24 h rest', len: 0, cumulative: 84 * H, cat: CAT_MULTI,
          text: 'Max 84 h work · min 24 continuous hours stationary rest before more work' }
      ]
    }
  };

  const SEVERITY = ['minor', 'substantial', 'severe', 'critical'];

  function categorise(minutes, t) {
    if (minutes <= t[0]) return 'minor';
    if (minutes <= t[1]) return 'substantial';
    if (minutes <= t[2]) return 'severe';
    return 'critical';
  }

  // ---- date helpers (ISO yyyy-mm-dd, UTC arithmetic so time zones never shift a day)
  function isoAdd(iso, n) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function isoDiff(a, b) {
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
  }

  /** Flatten a driver's day records into one contiguous slot timeline. */
  function buildTimeline(days) {
    const keys = Object.keys(days).filter(k => days[k] && days[k].length === SPD).sort();
    if (!keys.length) return null;
    const start = keys[0];
    const nDays = isoDiff(start, keys[keys.length - 1]) + 1;
    const N = nDays * SPD;
    const slots = new Uint8Array(N);
    const known = new Uint8Array(nDays);
    for (const k of keys) {
      const d = isoDiff(start, k);
      known[d] = 1;
      const s = days[k];
      for (let i = 0; i < SPD; i++) slots[d * SPD + i] = s.charCodeAt(i) === 49 ? 1 : 0;
    }
    return { start, nDays, N, slots, known };
  }

  function prefixSums(slots) {
    const P = new Int32Array(slots.length + 1);
    for (let i = 0; i < slots.length; i++) P[i + 1] = P[i] + slots[i];
    return P;
  }

  function restRuns(slots) {
    const runs = [];
    let s = -1;
    for (let i = 0; i <= slots.length; i++) {
      const rest = i < slots.length && slots[i] === 0;
      if (rest && s < 0) s = i;
      if (!rest && s >= 0) { runs.push([s, i]); s = -1; }
    }
    return runs;
  }

  function longestRestIn(runs, a, b) {
    let best = 0;
    for (const [s, e] of runs) {
      if (e <= a) continue;
      if (s >= b) break;
      const len = Math.min(e, b) - Math.max(s, a);
      if (len > best) best = len;
    }
    return best;
  }

  /** Night rest break: 7 continuous hours stationary rest between 10pm and 8am, or 24 continuous hours rest. */
  function nightRests(tl, runs) {
    const nights = [];
    for (let n = 0; n < tl.nDays; n++) {
      const a = n * SPD + 22 * H, b = a + 10 * H;
      if (b > tl.N) { nights.push(null); continue; }
      let ok = false;
      for (const [s, e] of runs) {
        if (e <= a || s >= b) continue;
        if (Math.min(e, b) - Math.max(s, a) >= 7 * H || e - s >= 24 * H) { ok = true; break; }
      }
      nights.push(ok);
    }
    return nights;
  }

  /**
   * Evaluate a timeline. Time is counted forward from the end of each rest break
   * (and from the first record), which is how the HVNL counts "any period".
   */
  function evaluate(days, rulesetId) {
    const rs = RULESETS[rulesetId] || RULESETS.standard;
    const tl = buildTimeline(days);
    if (!tl) return { timeline: null, breaches: [], nights: [] };
    const { slots, N } = tl;
    const P = prefixSums(slots);
    const runs = restRuns(slots);
    const nights = nightRests(tl, runs);

    // Short periods count from the end of any rest break; periods of 24 hours or
    // more count from the end of a relevant major rest break (7 continuous hours).
    const starts = [], majorStarts = [];
    for (let i = 0; i < N; i++) if (slots[i] === 1 && (i === 0 || slots[i - 1] === 0)) starts.push(i);
    const firstWork = starts.length ? starts[0] : 0;
    majorStarts.push(firstWork);
    for (const [s, e] of runs) if (e - s >= 7 * H && e < N && e > firstWork) majorStarts.push(e);

    const raw = [];
    for (const rule of rs.rules) {
      if (rule.cumulative) { raw.push(...cumulativeCheck(rule, slots, runs)); continue; }
      for (const s of (rule.len >= SPD ? majorStarts : starts)) {
        const full = s + rule.len <= N;
        const e = Math.min(s + rule.len, N);
        const work = P[e] - P[s];
        if (work > rule.maxWork) {
          let t = s;
          while (t < e && P[t + 1] - P[s] <= rule.maxWork) t++;
          const over = (work - rule.maxWork) * SLOT_MIN;
          raw.push({ rule, kind: 'work', ws: s, we: e, at: t, value: work * SLOT_MIN,
            limit: rule.maxWork * SLOT_MIN, amount: over, severity: categorise(over, rule.cat) });
        }
        if (rule.minRest && full) {
          const longest = longestRestIn(runs, s, e);
          if (longest < rule.minRest) {
            const short = (rule.minRest - longest) * SLOT_MIN;
            raw.push({ rule, kind: 'rest', ws: s, we: e, at: e - 1, value: longest * SLOT_MIN,
              limit: rule.minRest * SLOT_MIN, amount: short, severity: categorise(short, rule.restCat) });
          }
        }
        if (rule.nightMin && full) {
          const inside = [];
          for (let n = 0; n < nights.length; n++) {
            const a = n * SPD + 22 * H;
            if (a >= s && a + 10 * H <= e) inside.push(nights[n]);
          }
          const count = inside.filter(Boolean).length;
          let pair = false;
          for (let k = 1; k < inside.length; k++) if (inside[k] && inside[k - 1]) pair = true;
          if (count < rule.nightMin || !pair) {
            const missing = Math.max(0, rule.nightMin - count);
            const severity = count === 0 ? 'critical' : missing >= 2 ? 'severe' : missing === 1 ? 'substantial' : 'minor';
            raw.push({ rule, kind: 'night', ws: s, we: e, at: e - 1, value: count, limit: rule.nightMin,
              amount: missing, pair, severity });
          }
        }
      }
    }
    return { timeline: tl, breaches: cluster(raw, tl), nights };
  }

  function cumulativeCheck(rule, slots, runs) {
    const out = [];
    let work = 0, from = 0, flagged = null;
    let r = 0;
    for (let i = 0; i < slots.length; i++) {
      while (r < runs.length && runs[r][1] <= i) r++;
      if (slots[i] === 0) {
        const run = runs[r];
        if (run && run[0] === i && run[1] - run[0] >= 24 * H) { work = 0; from = run[1]; flagged = null; }
        continue;
      }
      work++;
      if (work > rule.cumulative) {
        const over = (work - rule.cumulative) * SLOT_MIN;
        if (!flagged) {
          flagged = { rule, kind: 'work', ws: from, we: i + 1, at: i, value: work * SLOT_MIN,
            limit: rule.cumulative * SLOT_MIN, amount: over, severity: categorise(over, rule.cat) };
          out.push(flagged);
        } else {
          flagged.we = i + 1; flagged.value = work * SLOT_MIN; flagged.amount = over;
          flagged.severity = categorise(over, rule.cat);
        }
      }
    }
    return out;
  }

  /** Overlapping windows report the same event many times; keep one breach per event. */
  function cluster(raw, tl) {
    raw.sort((a, b) => a.at - b.at);
    const groups = [];
    for (const b of raw) {
      const key = b.rule.id + ':' + b.kind;
      const gap = Math.max(b.rule.len, 24 * H) / 2;
      const g = groups.find(x => x.key === key && b.at - x.first < gap);
      if (!g) { groups.push({ key, first: b.at, best: b }); continue; }
      if (b.amount > g.best.amount) g.best = Object.assign({}, b, { at: g.best.at });
    }
    return groups.map(g => {
      const b = g.best;
      const dayIdx = Math.floor(b.at / SPD);
      return Object.assign({}, b, {
        ruleId: b.rule.id,
        date: isoAdd(tl.start, dayIdx),
        slot: b.at % SPD,
        wsDate: isoAdd(tl.start, Math.floor(b.ws / SPD)), wsSlot: b.ws % SPD,
        weDate: isoAdd(tl.start, Math.floor((b.we - 1) / SPD)), weSlot: (b.we - 1) % SPD,
        key: b.rule.id + '|' + b.kind + '|' + isoAdd(tl.start, dayIdx) + '|' + (b.at % SPD)
      });
    }).sort((a, b) => (a.date + pad(a.slot)).localeCompare(b.date + pad(b.slot)));
  }

  function pad(n) { return String(n).padStart(3, '0'); }

  /** Work totals over the 1, 7 and 14 days that end at the close of `iso`. */
  function totals(days, iso) {
    const out = {};
    for (const n of [1, 7, 14]) {
      let work = 0, rec = 0;
      for (let k = 0; k < n; k++) {
        const s = days[isoAdd(iso, -k)];
        if (!s) continue;
        rec++;
        for (let i = 0; i < SPD; i++) if (s.charCodeAt(i) === 49) work++;
      }
      out[n] = { work: work * SLOT_MIN, rest: (rec * SPD - work) * SLOT_MIN, days: rec };
    }
    return out;
  }

  const api = { SPD, SLOT_MIN, H, RULESETS, SEVERITY, evaluate, totals, isoAdd, isoDiff, categorise };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Fatigue = api;
})(typeof window !== 'undefined' ? window : globalThis);
