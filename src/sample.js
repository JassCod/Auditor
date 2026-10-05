/* Example fleet used on first load. These are illustrative records, not real drivers. */
(function (root) {
  'use strict';
  const SPD = 96;
  const START = '2026-09-14'; // a Monday
  const DAYS = 21;

  function toSlot(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 4 + Math.round(m / 15); }

  // blocks alternate work, rest, work, rest... in minutes, starting at `at` on `day`
  function build(plan) {
    const a = new Uint8Array(DAYS * SPD);
    for (const [day, at, blocks] of plan) {
      let i = day * SPD + toSlot(at);
      blocks.forEach((min, k) => {
        const n = Math.round(min / 15);
        if (k % 2 === 0) for (let j = 0; j < n && i + j < a.length; j++) a[i + j] = 1;
        i += n;
      });
    }
    const days = {};
    for (let d = 0; d < DAYS; d++) {
      let s = '';
      for (let i = 0; i < SPD; i++) s += a[d * SPD + i];
      const dt = new Date(START + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + d);
      days[dt.toISOString().slice(0, 10)] = s;
    }
    return days;
  }

  const weekday = d => d % 7 < 5;
  const range = (n, f) => Array.from({ length: n }, (_, d) => d).filter(f);
  const NORMAL = [240, 30, 210, 30, 210];          // 11h work, 5:00 to 17:00

  function diaries(base, firstPage) {
    const out = {};
    for (let d = 0; d < DAYS; d++) {
      const dt = new Date(START + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + d);
      out[dt.toISOString().slice(0, 10)] = { no: base, page: String(firstPage + d) };
    }
    return out;
  }

  const drivers = [
    {
      id: 'd1', name: "Liam O'Connor", licence: 'NSW 1849 3021', rego: 'XQ 47 LM', base: 'Wetherill Park NSW',
      ruleset: 'standard', diary: diaries('WD 448 210', 12),
      days: build(range(DAYS, weekday).map(d => [d, '05:00', NORMAL]))
    },
    {
      id: 'd2', name: 'Priya Sharma', licence: 'VIC 0921 7740', rego: 'BFM 220', base: 'Laverton North VIC',
      ruleset: 'bfm', diary: diaries('WD 512 007', 40),
      days: build(range(DAYS, weekday).map(d => [d, '04:00', d === 9 ? [330, 30, 300, 30, 240] : [300, 30, 300, 30, 180]]))
    },
    {
      id: 'd3', name: 'Daniel Nguyen', licence: 'QLD 6602 1185', rego: 'XV 19 DN', base: 'Larapinta QLD',
      ruleset: 'standard', diary: diaries('WD 377 954', 3),
      days: build([
        ...range(7, d => d < 6).map(d => {
          if (d === 1) return [d, '06:00', [330, 30, 270, 30, 60]];
          if (d === 3) return [d, '04:00', [300, 30, 300, 30, 210]];
          if (d === 4) return [d, '00:30', [300, 30, 300]];
          return [d, '06:00', [300, 30, 300, 30, 60]];
        }),
        ...range(DAYS, d => d >= 7 && d < 14).map(d => [d, '06:00', [300, 30, 300, 30, 60]]),
        ...range(DAYS, d => d >= 14 && weekday(d)).map(d => [d, '06:00', [300, 30, 270, 30, 90]])
      ])
    },
    {
      id: 'd4', name: 'Sarah Mitchell', licence: 'NSW 7713 0456', rego: 'XN 82 SM', base: 'Chullora NSW',
      ruleset: 'standard', diary: diaries('WD 601 338', 71),
      days: build([
        ...range(DAYS, d => d % 7 < 4).map(d => [d, '20:00', [240, 30, 240, 30, 180]]),
        [11, '14:30', [120]]
      ])
    },
    {
      id: 'd5', name: 'Jack Thompson', licence: 'SA 2280 9917', rego: 'SB 61 JT', base: 'Wingfield SA',
      ruleset: 'standard', diary: diaries('WD 290 115', 55),
      days: build(range(DAYS, weekday).map(d => [d, '06:00', d === 16 ? [270, 15, 225, 30, 120] : [240, 30, 240, 30, 180]]))
    }
  ];

  const api = { drivers, START, DAYS, lastDay: '2026-10-04' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SampleFleet = api;
})(typeof window !== 'undefined' ? window : globalThis);
