# DEF.1 — Run-pipeline blockers (F1/F2/F3) (run ledger)

- **Ticket:** `docs/tickets/55_DEF.1__run-pipeline-blockers.md` — fix the three delivery-blocking
  defects that killed STB.3 live legs (~511 committed credits absorbed to F1 alone).
- **Branch:** `stevevitali/def-1-run-pipeline-blockers` (stacks on `stevevitali/p1-22-launch-checks`).
- **Gate status:** **$0 Stage A (code + tests)** — all deterministic gates green. **Stage B
  (deploy + bounded re-runs of the killed legs at their original caps) is operator-gated and NOT
  yet executed** — see §5.
- **Spend:** $0 (no deploy, no live legs this run).

## 1. Root-cause diagnoses (AC1)

### F1 — missing/unparseable `.rhema/phase-result.json` (outline, research_burst, profile_voice kills)

Three distinct defects composed:

1. **Stale `assistant` tool list on a seeded database.** `agent_types` rows are code-seeded
   `on conflict (key) do nothing`, so a database seeded before P1.11 kept the P0.02-era assistant
   tools — `read, web_search, web_fetch, measure, propose_outline, read_artifact, start_workflow` —
   with **no `write` token** (and no `subagent`). The §12.6 hook enforces `agent_types.tools`, so
   every assistant-seat `Write`/`Edit`/`Agent` was denied (`[hook] Write deny — the assistant seat
   may not use Write`); the agent produced nothing, wrote no `.rhema/phase-result.json`, and the
   oracle failed leg (b). Live kills: outline `01M3DC1VYGJXM1G36TAR9D7F8W`, research
   `01M3DETHZ8ENTRTSXH3SJ6Y2FW` (~511cr absorbed).
2. **Persona-root `.rhema/` unmounted.** The `persona_builder` seat table granted `profile/**`
   readwrite but no `.rhema/**` — the persona-root control dir the phase contract writes to. The
   live profile-voice run's `Write /work/personas/<id>/.rhema/phase-result.json` was denied
   "write outside the seat namespace" (run `01M3DJ5V3D99NCC8JSZGTPM17P`). Compounding: the
   harness-created `profile/**` dirs were harness-owned 0755, so even the *granted* mount was
   EACCES for uid `agent`.
3. **Phase-result contract invisible where `sidecar` wasn't opted in.** The runspec only injected
   the phase-result contract hint inside the `sidecar` block; `profile_voice`'s `defaultInputs`
   carry no `sidecar: true`, and the ported skill gates the write on that flag — so the phase ran
   to `sdk=success` and emitted no phase-result at all.

### F2 — `second_read_producer_checked` unsatisfiable (memo kill)

The review `second_read` phase declares `phaseClass:"judge"` + `allowsSubagents:false` +
`second_read_producer_checked` — a predicate requiring the phase artifact to be produced by an
**orchestrator-launched input-scoped query** whose `producerQueryId` matches `.rhema/second-read.json`.
Live STB.3 (`01M3DKQR0TY6ADGV2D1RTJBVG5`): the harness ran `second_read` as a NORMAL seat-agent
phase; the hook correctly denied the model's `Agent(second-reader)` call (a judge seat may not
spawn), and nothing ever wrote `producerQueryId`/`expectedProducerQueryId` — the predicate had no
satisfiable path (both facts null on the wire). This is the live manifestation of D-P0.15h-5: the
scoped machinery (`buildScopedLaunchSpec`, `scoped-runner.sh`) existed for in-query subagents but
the **phase-level** scoped launch — runspec minting the id + recording `subagent_launches`,
the harness executing `scoped-query.js` for the phase, the marker write — was unbuilt.

### F3 — `structure-plan.json` anchor contract mismatch (draft kill)

The draft run `01M3DGGCZR2CWV99FJTN19VD2T` died at `sidecar_validates:structure`: the emitted plan
carried prose placeholders / non-canonical anchor objects (`{kind,detail}`/`{source,location}`)
where `anchorSchema` requires the §11.3 verbatim shape (`blockId/quote/startOffset/endOffset/
confidence`). The schema itself is correct — a forward plan (new writing) must **omit** `anchor`;
anchors are only for reverse-outlining an existing draft. The defect was guidance: neither the
sidecar contract hint nor the SKILL text said that, so the model invented anchors.

## 2. Fixes (per defect)

### F1

- `packages/db/migrations/0043_assistant_run_tools.sql` (new) — stamps the current §7.1/P1.11
  assistant tool list **plus `subagent`** (the research_burst `fetch` phase declares
  `allowsSubagents:true` and the PRB.24 `research_fanout` contract instructs the seat to fan out —
  without the token the hook denies `Agent`). `packages/db/src/seed/code-seed.ts` synchronized so
  fresh installs carry the identical list.
- `packages/hooks/src/seat-tables.ts` — `persona_builder` gains `{glob:".rhema/**", root:"persona",
  mode:"readwrite"}`; project-side `.rhema/` stays unmounted (the signed mount contract stays
  read-only to every seat). Seat-table tests assert the persona-root phase-result/agent-result
  writes allow while project `.rhema` still denies.
- `apps/run-task/src/harness-main.ts` — `makeTreeAgentWritable(roots.persona)` so the granted
  `profile/**` + `.rhema/**` dirs are actually writable by uid `agent` (0777 dirs; mounted input
  files stay 0444).
- `packages/orchestrator/src/runspec.ts` — `sidecar: true` + `phase_result_contract` are now
  **unconditional** phase inputs (harness control-plane contract, not a model option); the
  persona-builder variant names the persona-root `.rhema/` path, project seats get
  `agents/<seat>/.rhema/`.
- `apps/run-task/src/work-reader.ts` — `readWorkRoots` merges the persona root (project wins
  collisions) so persona-root control/output files reach the oracle + harvest; transient
  `phase-result.json`/`agent-result.json` basenames stay excluded from harvest.

### F2 — orchestrator-owned input-scoped second read (§12.6)

- `packages/orchestrator/src/runspec.ts` — when the phase's `completionPredicates` include
  `second_read_producer_checked`, the server mints `producerQueryId`, **records a
  `subagent_launches` row** (`label:"second-reader"`, `inputsKind:"explicit_files"`, the draft's
  manifest path — the row `checkSecondReadProducer` + the §12.6 attestation read), and ships
  `HarnessRunSpec.scopedLaunch` (role, files=[the mounted draft only], prompt=
  `SECOND_READ_PROMPT`, outputPath=`agents/<seat>/<artifact>`, markerPath=
  `agents/<seat>/.rhema/second-read.json`, model/budget/turns). **No mounted draft ⇒ no launch
  order** — the predicate then fails honestly rather than a scoped read over nothing.
- `apps/run-task/src/harness-main.ts` — a `spec.scopedLaunch` phase routes to `runScopedPhase`
  instead of the seat agent (the judge-class `Agent` deny stays correct — the parent never could
  and still cannot launch it), wrapped in `subagent.started`/`finished` §12.5 events.
- `apps/run-task/src/scoped-phase.ts` (new) — builds the `unshare --mount --propagation private`
  plan (`buildScopedLaunchSpec`), writes the spec file under `/config`, spawns the runner, and —
  because the scoped query has **no Write tool** — the HARNESS persists the returned text as the
  phase artifact + writes the `.rhema/second-read.json` marker (`producerQueryId` ===
  `expectedProducerQueryId` === the orchestrator-minted launch id) + `.rhema/agent-result.json` +
  `.rhema/phase-result.json` (status `done`/`blocked` — a dead scoped query still lands an honest
  blocked phase-result, not a missing-file F1 kill).
- `apps/run-task/src/scoped-query.ts` (new) — one vendored-SDK `query()` with
  `tools/allowedTools:["Read"]`, `maxConcurrentSubagents:0`, cwd = the scoped root, scrubbed env
  (the `ALLOWED_AGENT_ENV_KEYS` set only — no token, no credential; the loopback injector URL +
  the non-secret placeholder key). Prints the result JSON on stdout — the only channel that
  crosses the private namespace.
- `apps/run-task/docker/scoped-runner.sh` — rewritten for DEF.1: applies the spec's
  stash→overmount→ro-bind sequence (`stashBinds` outside `/work` BEFORE the tmpfs overmount hides
  the seat tree; then `binds` into the scoped root), stages a world-readable spec copy inside the
  0777 scoped root (the scoped uid can't traverse `/config`), then `setpriv`-drops to the distinct
  scoped uid (`agentUid + roleOffset`) and execs `scoped-query.js` under `env -i` with exactly the
  scrubbed allowlist. `stashDir` now defaults to `/tmp/scoped-stash/<role>` at the harness call
  site — `/run` is read-only in the pod (only the read-only secrets mount lives there), while
  `/tmp` is the fsGroup-writable emptyDir outside the `/work` overmount.
- `packages/protocols/src/second-read.ts` (new) + `index.ts` — `SECOND_READ_PROMPT`: the verbatim
  phase-5 independent-read instruction, rewritten for the scoped context ("your working directory
  contains exactly one file — the draft"). Stub parity export in `packages/protocols-stub`.
- `apps/run-task/src/work-reader.ts` — the harvested `NewVersion` for `launch.outputPath` now
  carries `producerQueryId` (persists to the version row — §12.6 provenance on the artifact
  itself, not only the transient marker).

### F3

- `packages/contracts/src/sidecars.ts` — `structure-plan.json` contract hint now states: **OMIT
  `anchor` on a forward plan**; emit it ONLY when reverse-outlining an existing draft, and then as
  the exact `{blockId,quote,startOffset,endOffset,confidence}` object (optional `unanchored:true`)
  — any other shape fails validation. Schema unchanged (canonical `anchorSchema` already correct —
  the defect was guidance, not the contract).
- `packages/protocols/skills/draft-from-outline/SKILL.md` + the `upstream-port.manifest.mjs`
  source — same anchor guidance in the skill text (sanctioned `sidecar` delta; upstream-diff gate
  green).

## 3. Regression tests (AC1 — each fails against pre-fix code)

- `packages/orchestrator/src/runspec.test.ts` — F2: second_read spec carries `scopedLaunch` AND a
  recorded `subagent_launches` row; non-second_read phase carries neither; **no mounted draft ⇒
  no launch order**. F1: `phase_result_contract` injected unconditionally (contains `"done"` even
  with no declared sidecars).
- `apps/run-task/src/scoped-phase.test.ts` (new) — launch spec (unshare argv, one-file mount set,
  uid `agentUid+1`, `tools:["Read"]`, scrubbed runner env — every `FORBIDDEN_AGENT_ENV_KEYS`
  absent); persistence contract: artifact + marker + agent-result + phase-result on success;
  `blocked` phase-result + no artifact/marker on failure; empty text ≠ produced.
- `apps/run-task/src/work-reader.test.ts` — persona-root outputs merge into the oracle/harvest
  map; scoped artifact carries `producerQueryId`.
- `packages/contracts/src/sidecars.test.ts` — canonical anchor shape validates; `relStart`/
  `relEnd` and prose/string anchors reject; forward-plan sections without anchors pass.
- `packages/hooks/src/seat-tables.test.ts` — persona-builder `.rhema/**` writes allowed at the
  persona root; project `.rhema` + persona `docs/**` stay denied.

## 4. Gates (all green, 2026-09-26)

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | **132/132 tasks** |
| `pnpm test` | **3,534 pass / 3 skip / 376 files** (1 fail → fixed: `PROTOCOLS_VERSION` re-frozen `0.4.0+619079b3ba004cf1` → `0.4.0+ec61156725a895ab`, 43 trio files) |
| `pnpm check:licenses` | OK — 607 packages |
| `pnpm check:protocol-markers` | OK — 45 files |
| `pnpm check:no-cookies` | OK — 28 files |
| `node scripts/check-upstream-diff.mjs` | OK — 22 ported files, sanctioned edits only |
| `check-build-memory.sh .` | 0 violations |

## 5. Deferrals + Stage B

- **D-P0.15h-5 → DONE in code** (`DEFERRALS.md`): the phase-level scoped second-read is wired
  end-to-end and deterministically proven. **Live leg owed at Stage B:** a memo/review with
  `second_read` enabled committing `second_read_producer_checked` green on prod.
- **No new deferrals opened.**
- **Stage B (operator-gated, NOT run):** `pulumi up` deploy (image build + migration 0043) then
  bounded re-runs of only the affected legs at their **original caps** — outline ≤945 (listed
  ≤$3), research ≤765 (≤$5), draft ≤1068 (≤$10), memo ≤1083 (≤$15) — combined ≤$33. Record per-leg
  evidence back here before STB.4.

## 6. Residuals / honest caveats

- The scoped second-read's kernel isolation is the SAME `unshare`+stash+overmount+bind sequence
  the in-image `privsep-check.sh` AC4 leg already proves; the new legs (runner reads the spec
  file, `/tmp` stash) are deterministic-asserted but not yet exercised in a real pod — first
  exercise is Stage B.
- Guided-retry `opts.guidance` is ignored by the scoped branch (the scoped prompt is fixed); a
  retry re-runs the same launch order — acceptable, noted.
- The marker file `agents/<seat>/.rhema/second-read.json` is harvested (only the two transient
  basenames are excluded) — it persists as a version row, which is the intended provenance.
