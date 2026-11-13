#!/usr/bin/env node
// check-adr-banners.mjs — banner-presence gate (253_R7REC.1, REQ-CLOSE-3; extended 205_R6REC.2,
// REQ-TAIL-3). Enumerates every (ADR, file, anchor) pair the spec fold-backs say must carry a
// dated banner — round-7's ADR-126…130 set plus round-6's ADR-111/112/113 launch-posture set —
// and fails when any banner is absent from its owning section.
// Exit 0 = every banner present; exit 1 = missing banners listed. Read-only.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const PAIRS = [
  // ADR-128 — information architecture v2 (design spec owning sections)
  { adr: 'ADR-128', file: 'docs/rhema-design-spec.md', anchor: /REQ-IDE-2.*ADR-128|ADR-128 \(2026-11-05, R7SHELL\.1a\)/s, name: 'REQ-IDE-2 rail→sidebar' },
  { adr: 'ADR-128', file: 'docs/rhema-design-spec.md', anchor: /Amended 2026-11-06 \(R7HOME\.1 \/ ADR-128/, name: 'REQ-IDE-4/-6 flat list' },
  { adr: 'ADR-128', file: 'docs/rhema-design-spec.md', anchor: /REQ-IDE-5\..*ADR-128, R7HOME\.2b/s, name: 'REQ-IDE-5 blank Page create' },
  { adr: 'ADR-128', file: 'docs/rhema-design-spec.md', anchor: /REQ-IDE-8\..*R7PANE\.1 under ADR-128/s, name: 'REQ-IDE-8 + DS §5.1 regions' },
  { adr: 'ADR-128', file: 'docs/rhema-design-spec.md', anchor: /ADR-128, R7HOME\.2b, 2026-11-06: a project opens to its head draft's Page/, name: 'REQ-IDE-48 opens-to-Page' },
  { adr: 'ADR-128', file: 'docs/rhema-design-spec.md', anchor: /ADR-128, R7HOME\.2b, 2026-11-06: the empty-state card/, name: 'REQ-GROWTH-12 non-modal tour' },
  { adr: 'ADR-128', file: 'docs/rhema-design-spec.md', anchor: /REQ-IDE-41.*ADR-128.*kept unchanged/s, name: 'REQ-IDE-41 kept' },
  // ADR-129 — component stack (DS §15)
  { adr: 'ADR-129', file: 'docs/rhema-design-spec.md', anchor: /## 15\. Landing page.*ADR-129 \(2026-11-08/s, name: 'DS §15 component stack' },
  // ADR-130 — retire the generated walkthrough (REQ-IDE-19, DS §5.5 D20 / §5.6)
  { adr: 'ADR-130', file: 'docs/rhema-design-spec.md', anchor: /Walkthrough and run report \(ledger D20\).*ADR-130 \(2026-11-08/s, name: 'DS §5.5 D20 walkthrough retired' },
  { adr: 'ADR-130', file: 'docs/rhema-design-spec.md', anchor: /REQ-IDE-19.*ADR-130 2026-11-08.*record-composed|REQ-IDE-19.*ADR-130 2026-11-08.*deterministically/s, name: 'REQ-IDE-19 matrix row' },
  // ADR-126 — demo SPA read-only on every device class (SPA spec, REQ-ED-12/ADR-108)
  { adr: 'ADR-126', file: 'docs/frontend-spa-spec.md', anchor: /REQ-ED-12 amended via ADR-108.*ADR-126 \(2026-11-08.*demo Pages render SPA read-only on every device class/s, name: 'REQ-ED-12 demo SPA read-only' },
  // ADR-128 — REQ-UX-8 / REQ-IDE-49 (? sheet kept; REQ-KEYS remaps chords)
  { adr: 'ADR-128', file: 'docs/frontend-spa-spec.md', anchor: /ADR-128 \(2026-11-08.*REQ-UX-8 \/ REQ-IDE-49/s, name: 'REQ-UX-8/REQ-IDE-49 ? sheet kept' },
  // REQ-NAVM-7 discharged by REQ-SPEED-3 (post-spa spec §2.6)
  { adr: 'ADR-128', file: 'docs/post-spa-disposition-spec.md', anchor: /REQ-NAVM-7.*discharged by REQ-SPEED-3/s, name: 'REQ-NAVM-7 discharged' },
  // ADR-127 — corpus carve-out + hero-recording asset entry (LICENSES.md)
  { adr: 'ADR-127', file: 'LICENSES.md', anchor: /CC BY-NC-ND 4\.0.*ADR-127/s, name: 'corpus licence carve-out' },
  { adr: 'ADR-127', file: 'LICENSES.md', anchor: /hero-tour\.mp4.*780,708 bytes.*sha256|hero recording landed at the declared paths/s, name: 'hero-recording bytes+sha256' },
  // ADR-111 — launch decoupled from G2 + §17 Phase-1 exit amended (round-6 fold, 205_R6REC.2)
  { adr: 'ADR-111', file: 'docs/rhema-design-spec.md', anchor: /Amendment — 2026-10-20: the public launch is decoupled from G2.*recorded in \*\*ADR-111\*\*/s, name: '§17 2026-10-20 amendment banner' },
  { adr: 'ADR-111', file: 'docs/rhema-design-spec.md', anchor: /Fold-check — 2026-11-11 \(205_R6REC\.2 \/ REQ-TAIL-3\).*GATE-LAUNCH.*[Gg]olden.*[Ff]irst finding.*GD-WATCH\.R6/s, name: '§17 launch-evidence fold-check' },
  { adr: 'ADR-111', file: 'docs/rhema-design-spec.md', anchor: /Addendum 2026-10-20 — REQ-BETA-19.*ADR-111/s, name: 'A.13 REQ-BETA-19/-20 addendum' },
  { adr: 'ADR-111', file: 'docs/rhema-design-spec.md', anchor: /2026-10-20 \(round-6 launch posture — \*\*ADR-111\*\*/s, name: 'status-line 2026-10-20 entry' },
  // ADR-112 — external pen test → post-launch obligation; in-round adversarial review gated launch
  { adr: 'ADR-112', file: 'docs/rhema-design-spec.md', anchor: /Amendment — 2026-10-20 \(ADR-112; operator ruling `GD-PEN\.R6b`/s, name: '§12.8 pen-test banner' },
  { adr: 'ADR-112', file: 'docs/rhema-design-spec.md', anchor: /Public product running without independent security testing.*ADR-112|external pen-test \*\*\(ADR-112, 2026-10-20/s, name: '§16.4/§17 security rows' },
  // ADR-113 — API-minted v4 usercontent URLs (§13.3 banner + as-built check)
  { adr: 'ADR-113', file: 'docs/rhema-design-spec.md', anchor: /Amendment — 2026-10-21 \(R6UCD\.1 \/ ADR-113\): user-content delivery is API-minted GCS V4/s, name: '§13.3 ADR-113 banner' },
  { adr: 'ADR-113', file: 'docs/rhema-design-spec.md', anchor: /Checked as built — 2026-11-11 \(205_R6REC\.2 \/ REQ-TAIL-3\).*mintUserContentUrl/s, name: '§13.3 as-built check' },
  // REQ-TAIL-3 fold note in the round-6 spec's own §4.10
  { adr: 'ADR-111', file: 'docs/round-6-draft-spec.md', anchor: /Post-ratification note, 2026-11-11 — folded at `205_R6REC\.2`/s, name: '§4.10 REQ-TAIL-3 fold note' },
];

const missing = [];
for (const p of PAIRS) {
  let text = '';
  try { text = readFileSync(resolve(root, p.file), 'utf8'); }
  catch { missing.push(`${p.adr} ${p.file} — file unreadable`); continue; }
  if (!p.anchor.test(text)) missing.push(`${p.adr} ${p.file} — banner missing: ${p.name}`);
}

console.log(`check-adr-banners: ${PAIRS.length} (ADR, file, anchor) pairs enumerated`);
if (missing.length) {
  for (const m of missing) console.log(`  ✗ ${m}`);
  process.exit(1);
}
console.log('  ✓ every enumerated ADR banner present, dated, in its owning section');
