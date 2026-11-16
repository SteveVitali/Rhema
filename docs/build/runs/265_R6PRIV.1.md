# 265_R6PRIV.1 — public-repo artifact cleanup (operator ruling P-1 / GD-PRIVACY.R6)

**Date:** 2026-11-15 · **Worker:** devin-desktop/swe-2-high/subagent · **Branch:** `stevevitali/r6priv-1-cleanup` · **Base:** `main` @ `040e36a9` · **Spend:** $0 (no paid legs, no live contact) · **Method:** normal commits at HEAD — **no history rewrite** (ruling literal).

## Ruling P-1 — per-item execution

### 1. Four Pulumi stack exports → deleted, privately retained, pointer notes

Each file verified present, copied byte-identical to
`~/agent-scratch/private-artifacts/2026-11-15_r6priv/` (outside the repo), sha256 of
original == sha256 of private copy, then `git rm` + `stack-export-pre.REMOVED.md`
pointer note committed beside it (what it was, sha256, private path, ruling ref).

| Repo path | sha256 | Content verified |
|---|---|---|
| `reports/2026-10-22_R6DEP.1/prod-preflight/stack-export-pre.json.gz` | `8a7939c457a2e5e24c1db80ae7abf7b855819703641ffed13c3325b725782221` | deployment v3, 174 resources; operator email ×37 (`14SteveVitali@gmail.com`×35 + `14stevevitali@gmail.com`×2) |
| `reports/2026-10-22_R6INF.1/stack-export-pre.json.gz` | `8ed171c0a4da95764c522cf977478ab894eaaf3e37a037285de675c415333085` | deployment v3, 174 resources; operator email ×37 |
| `reports/2026-10-24_proxy-ilb-drill/stack-export-pre.json.gz` | `aafd6f94fea428ac5afe631faa02b48ebbba4aa8c1ef8b30fec895c284159b81` | deployment v3, 175 resources; operator email ×37 |
| `reports/2026-10-26_R6DEP.2/prod-preflight/stack-export-pre.json.gz` | `b0d56a17669dcdc71de3a4cc878d779dfc00ad8e4f570c7ee484bdd428fd42e4` | deployment v3, 178 resources; operator email ×37 |

Each also carries the full prod resource graph (service-account identities, internal
addressing, image digests). Private copies verified identical before deletion.

### 2. Three unredacted gitleaks reports → deleted-as-unredacted, redacted form committed

Email class re-verified on each (ruling precondition): every finding's `Email` field =
`14stevevitali@gmail.com` — 91/91, 220/220, 129/129. The OSS-readiness records cite
these files as committed evidence (`open-source-readiness.md` § Audit evidence + both
`findings-disposition.md`), so the evidence is retained in **redacted** form.

**Method — judgement call (recorded in both disposition docs):** a literal
`gitleaks --redact` rescan "over the same range" is not reproducible — the 2026-11-03
all-refs set was pruned post-flip, and the 11-11 branch's patch series changed
post-merge (the recorded `29897095..HEAD` range now yields 490 findings vs the
original 129). The committed JSONs were therefore **redacted in place**: identical
finding sets (files/commits/fingerprints/classes preserved — this is *the same
scan's* output, strictly more faithful to "the same range" than a rescan), with
`Secret` → `REDACTED`, the secret substring inside `Match` → `REDACTED`, and `Email`
→ `REDACTED` (the class the ruling names; author name retained — OSS attribution).

### 3. Two magic-link tokens → masked

`reports/2026-11-08_R7DEP.2/prod-stageb/report.json` — verified exactly two
`token=` literals at **L37** (N1 leg error) and **L76** (N3 leg error), each appearing
twice per line (URL + call-log echo). Values replaced with `<redacted>`; JSON
re-validated.

### 4. `.gitleaks.toml` — blanket `docs/` skip → targeted entries

Probe: removing `'''docs/.*'''` surfaces **794 findings over full history**, all
`generic-api-key`, all dispositioned classes:

| Class | Count | Allowlist entry |
|---|---|---|
| Scanner-report files re-firing their own captured literals (self-referential evidence; HEAD now redacted but pre-redaction blobs persist in history) | 691 | path: `docs/build/reports/.*/gitleaks-[^/]*\.json$` |
| `"api": "<40-hex>"` provenance fields in report.json + `api:`/`sha256:` provenance prose | 98 | `^[0-9a-f]{40}$` / `^[0-9a-f]{64}$` |
| `MAX_USD_PER_RUN=10` env-name literal (OPS.1 prose) | 1 | `^MAX_USD_PER_RUN=[0-9]+$` |
| `quarantine/<id>(/<id>)?/` object-key paths in prose | 2 | `^quarantine/[A-Za-z0-9]+(/[A-Za-z0-9]+)?/?$` |
| `obligations/new` doc-path literal | 1 | `^obligations/[a-z]+$` |

Ruling-named classes verified **non-firing** under the default ruleset (no entry
needed): expired GCS signed URLs (`X-Goog-Signature=<512-hex>` — no adjacent keyword),
test-cookie placeholders (`Cookie: <session>` masked literals), `PROXY_PLACEHOLDER_*`
(source files, placeholder shape), `Signature=AAAA…` (no literal exists in the tree).

**Result:** `gitleaks git --config .gitleaks.toml` over full HEAD history —
**0 leaks, 1,753 commits scanned** (report `[]`).

### 5. Standing rule committed

- `AGENTS.md` § Launched posture → prod-artifact hygiene bullet (P-1 verbatim scope).
- `docs/build/LEDGER.md` OPERATING MODE → P-1 rule line + GD-PRIVACY.R6 gate row.

## Acceptance

- [x] gitleaks with narrowed config green on HEAD history: **0 leaks / 1,753 commits**
- [x] none of the four `.gz` / three unredacted reports / two token values at HEAD
- [x] `check-append-only --base origin/main` — **OK** (deletions ruling-named, expected)
- [x] `ci-boundary.sh --pr 342` — **pass #342@22acc89** (run 43780638869 — all seven
  legs + `ci-pass` anchor: fast-path · typecheck/lint/unit · contracts · integration ·
  images · public-safe [gitleaks/markers/licence] · anchor)
- [x] `check-current-state` — OK · `check-build-memory` — 42 violations all inherited
  classes (insert-ticket filename grammar incl. 265's own, DEFERRALS 'R' statuses/dup
  ids, legacy index/gate cells); the only new `~` warnings are the maintenance-mode
  `nextTicket` note — honest per GD-MAINT.R6

## Deferrals / backlog

None opened, none closed — no OPEN row is unblocked by this ticket (D-R6OSS.1-1 is
DONE; open rows are deploy-bound).

## Judgement calls

- **In-place redaction over rescan** (item 2): rescan is unfaithful to "the same
  range" post-prune/post-merge; the redacted files preserve the exact original
  finding sets — the stronger evidence-preserving read of the ruling's intent.
- **`Email` masked** in the redacted reports though commit metadata keeps it
  (STAYS-ruled): P-1 names the email class as the deletion's reason; the artifact
  shouldn't re-carry what the rule removes. Author name retained (OSS attribution).
- **Pointer-note naming** `stack-export-pre.REMOVED.md` (not `.gz.REMOVED.md`):
  the note documents the removed `.gz`; the extension signals "this is a note".
- **No entries for non-firing named classes** (item 4): allowlist entries must be
  justified by actual findings; the verification is recorded here instead.
