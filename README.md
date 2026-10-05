# LogChecker 3D

A fatigue audit portal for heavy vehicle drivers. It checks work and rest records against the NHVR rules under the Heavy Vehicle National Law (Standard Hours and BFM, solo drivers), finds breaches with their risk category, and tracks NCRs (non-conformance reports) through to close-out.

## Features

- **3D fatigue view**: one row per day and one column per 15-minute block. Work shows as raised blocks, rest lies flat, the 10pm–8am night window is shaded, and each breach has a pulsing beacon. Drag to orbit, scroll to zoom, and click a day to open it.
- **Work diary page**: drag in the WORK or REST lane to record time in 15-minute blocks, the same as the national work diary. There are also fields for diary number and page, and buttons to copy the previous day or clear a page. Breaches recalculate as you edit.
- **Breach engine** (`src/engine.js`):
  - Standard Hours: 5½ h, 8 h, 11 h, 24 h, 7 day and 14 day limits, including 7 h and 24 h continuous rest and night rest breaks.
  - BFM: 6¼ h, 9 h, 12 h, 24 h and 14 day limits, plus 24 h rest after no more than 84 h of work.
  - Each breach is graded minor, substantial, severe or critical.
- **NCRs**: raise one from any breach with a short-term action, long-term action, due date and assignee. Status can be set to open, in progress or closed, and overdue NCRs are flagged.
- **Compliance report**: per-driver scores, breaches by severity, and serious breaches that have no NCR. You can copy the whole report as text.
- **Rule book**: shows the limits and the way time is counted.

## Run it

It is a static site with no server.

```bash
node scripts/build.mjs   # inlines src/ into index.html (and dist/artifact.html)
npx serve .              # or open index.html directly
```

To publish it, enable GitHub Pages on this repository (Settings → Pages → deploy from branch, root). `index.html` is the whole app.

Records and NCRs are saved in the browser's local storage. The example fleet is illustrative.

> LogChecker is an audit aid. Confirm every finding against the driver's work diary and the current HVNL and Heavy Vehicle (Fatigue Management) National Regulation before taking action. AFM limits are operator-specific and are not audited.
