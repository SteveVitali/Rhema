# DEF.1 — Run-pipeline blockers (F1/F2/F3) (run ledger)

- **Ticket:** `docs/tickets/55_DEF.1__run-pipeline-blockers.md` — fix the three delivery-blocking
  defects that killed STB.3 live legs (~511 committed credits absorbed to F1 alone).
- **Branch:** `stevevitali/def-1-run-pipeline-blockers` (stacks on `stevevitali/p1-22-launch-checks`).
- **Gate status:** **Stage A (code + tests) DONE** — all deterministic gates green. **Stage B
  (deploy + bounded re-runs of the killed legs at their original caps) EXECUTED 2026-09-26** on
  prod — see §7. Four of five legs completed within caps; the research leg died at `plan` on an
  honest `{"status":"blocked"}` model verdict (documented §7.3 → **D-DEF.1-1**, fetch/distill
  still unexercised live).
- **Spend:** committed **2,053 credits** across six re-runs (each under its original cap;
  metered usage in §7.2).

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

- **D-P0.15h-5 → DONE** (`DEFERRALS.md`): the phase-level scoped second-read is wired
  end-to-end, deterministically proven, AND **verified live on prod at Stage B** (§7.2 —
  `producerQueryId` minted, launch row recorded, marker + committed version all
  `01M3EGB57986KDQVE7AA2Q82W8`, predicate green).
- **D-DEF.1-1 opened** (`DEFERRALS.md`): the research_burst `fetch`/`distill` path is still
  unexercised live — the Stage-B research leg blocked at `plan` on an honest model verdict for a
  thread-local question (§7.3).
- **Stage B EXECUTED 2026-09-26** — `pulumi up` prod deploys + migration 0043 + bounded re-runs
  of only the affected legs at their **original caps**. Per-leg evidence in §7.

## 6. Residuals / honest caveats

- The scoped second-read's kernel isolation is the SAME `unshare`+stash+overmount+bind sequence
  the in-image `privsep-check.sh` AC4 leg proves — exercised for real on prod at Stage B (§7.1:
  the probe pod ran the production-shaped check to `ALL PRIVSEP CHECKS PASSED`, and the live
  `second-reader` ran the real namespace inside a paid run).
- Guided-retry `opts.guidance` is ignored by the scoped branch (the scoped prompt is fixed); a
  retry re-runs the same launch order — acceptable, noted.
- The marker file `agents/<seat>/.rhema/second-read.json` is harvested (only the two transient
  basenames are excluded) — it persists as a version row, which is the intended provenance.

## 7. Stage B — prod deploy + bounded re-runs (executed 2026-09-26)

### 7.1 Deploys, migration, provenance

- Migration **`0043_assistant_run_tools.sql` applied on prod** — the pre-P1.11 seeded
  `agent_types` assistant row stamped with the current tool list incl. `write`/`subagent`
  (F1 cause #1).
- Iterative `pulumi up` rolls on prod as Stage-B surfaced pod-level defects the deterministic
  suite cannot see; every image digest pinned in `infra/pulumi/Pulumi.prod.yaml`, every roll
  stamped via `scripts/live/record-deployment.mjs`:
  - `def1c` (commits `5d40868`/`63eba26`) — `work-perms.ts` chmods the walked tree **root**, not
    just its contents: the persona dir itself was harness-owned `0755`, so the granted
    persona-root `.rhema/` mount was still EACCES for uid `agent` (F-StageB-2).
  - `28ccd1f` — missing `waiting_gate → finalizing` state-machine edge (F-StageB-1; final-phase
    gate approvals 500'd instead of finalizing the run).
  - `def1e` (commits `edf725a`/`69c72a3`/`dd69ff9`) — seat-table read grant for the baked
    `/app/skills` tree + staged `${CLAUDE_CONFIG_DIR}/skills` mount + `draft-ledger` contract
    hint (F-StageB-3/-4: the draft phase couldn't read its canonical `draft-ledger.md`
    reference and improvised a prose ledger that failed the parser).
  - `def1f` (commits `7fdfcb8`/`fa0e9f2`) — run-task pod AppArmor profile `Unconfined`
    (F-StageB-5: the default profile denied `unshare`/mount ops even with `SYS_ADMIN` —
    `write /proc/self/uid_map: Operation not permitted`).
  - `def1g`/`def1h` (commits `82179e1`/`8ff1e69`/`6a36dde`/`9876286`) — `setpriv --reuid 0`
    wrapper between `unshare` and `scoped-runner.sh` (F-StageB-6: util-linux `mount` checks the
    **real** uid, so ambient `CAP_SYS_ADMIN` at ruid≠0 still fails — "must be superuser"; the
    binary's setuid bit is not enough) + a passwd entry + `HOME` for the scoped uid
    (F-StageB-7).
- Production-shaped pod proof (`apps/run-task/docker/privsep-check.sh`, `runs` ns):
  `ALL PRIVSEP CHECKS PASSED` — harness uid cannot mount without the ruid-0 wrapper (negative
  control), the wrapper performs stash→tmpfs-overmount→ro-bind, the scoped uid sees only the
  enumerated file and cannot write it.
- Provenance rows (deployments table): `prod:edf725a8b0f2de2bcff496e9ee832ae5a0f53520`,
  `prod:dd69ff9377f6cc69892361e9126889b9b5ba7167`, `prod:fa0e9f21cc57818afcee8cc544a5bbd1aeafd019`,
  `prod:82179e1356b1d574739f759f1eecb111af73729b`, `prod:6a36ddea9d503cbf3b215e2e589e81d224a87658`
  (final, 09:21Z — run-task `@sha256:3f48c17f8b841ec5609227971bfdfacd5820b9278d3732f3a1aee1b21c94544d`,
  protocols `0.4.0+ec61156725a895ab`). One stray short-sha stamp `prod:82179e1`
  (`0.4.0+test`, 09:04Z) is a first-attempt artifact — superseded by the full-sha row 39 s later.

### 7.2 Per-leg results (prod, original committed caps)

| Leg | Run | Terminal | Committed (cap) | Metered usage | Evidence |
|---|---|---|---|---|---|
| Outline | `01M3E2EC1TH87TBVECMRN918SM` | **completed** | **127 / 947** | 270 in / 106,204 out tok | 4/4 steps `predicatesPassed` (harvest/classify/spine/gaps); committed `agents/assistant/research/outline-<run>/{00-harvest,01-claims,02-spine}.md` + `agents/assistant/.rhema/outline.json` + `agents/author/outline/my-first-project.{json,md}` — F1's outline kill closed. |
| Research | `01M3E89ZXBHDQ2KHMB1AZ202NS` | failed | 19 / 765 | 22 in / 5,431 out tok | Re-run authoring error — `inputs.question` absent (the original STB.3 run also carried `question:null`); model had nothing to decompose → `blocked`. Superseded by the row below. |
| Research | `01M3EGS55XHHFBT6CNS7Z3F5N9` | failed | 25 / 765 | 34 in / 5,561 out tok | `phase_blocked` at `plan` — honest model verdict, NOT a harness defect. See §7.3. |
| Profile voice | `01M3E8CX4B2ST2A46877CVAQ0T` | **completed** | **408 / 420** | 672 in / 380,466 out tok | 6/6 steps `predicatesPassed` (census→close_reading→voice→substance→calibration→package) — the persona-root `.rhema/` mount + writability fixes proven; F1's voice kill closed. |
| Draft | `01M3E8F8Z2TG2Q8FR62C7V1QJP` | **completed** | **1,027 / 1,068** | 926 in / 619,385 out tok | 8/8 steps `predicatesPassed` (intake→delivery); `sidecar_validates:structure` passed — `02-structure-plan.json` (3,021 B) emitted in canonical anchor-free forward-plan shape → **F3 closed live**; delivered `drafts/v8.md` + `correspondence/drafting_note/1/` (structure-plan, claim-ledger, access-report). |
| Review | `01M3EAAZG2AQ289B6ZFEP5XYN2` | **completed** | **447 / 1,083** | 7,082 in / 356,141 out tok, 12 searches / 3 fetches | All committed steps `predicatesPassed` (intake/craft/verification/second_read/argument/letter); **F2 closed live** — see below; delivered `correspondence/review/1/` (editors-letter 27,163 B, findings.json, rubric.json, second-read, access-report). `boundary.attested` violations=0; `cost.final` 447/1083. |

**F2 live proof (run `01M3EAAZG2AQ289B6ZFEP5XYN2`, attempt 7):**

- `subagent_launches` row `01M3EGB57BNWVTXGQHGY9K4K46`: `label=second-reader`,
  `inputs_kind=explicit_files`, `input_paths=["drafts/v1.md"]`, `file_count=1`,
  `producer_query_id=01M3EGB57986KDQVE7AA2Q82W8` — the orchestrator-launched, draft-only
  scoped query (six launches recorded across attempts 2–7, one per attempt as designed).
- Committed `agents/editor/.rhema/second-read.json` (GCS bytes verified):
  `{"producerQueryId":"01M3EGB57986KDQVE7AA2Q82W8","expectedProducerQueryId":"01M3EGB57986KDQVE7AA2Q82W8"}`.
- Committed `agents/editor/05-second-read.md` v1 (1,804 B) carries
  `artifact_versions.producer_query_id = 01M3EGB57986KDQVE7AA2Q82W8` — provenance on the
  artifact row itself.
- `second_read` step committed `predicatesPassed:true` — `second_read_producer_checked` green
  for the first time live. The run rode the `waiting_gate → finalizing` edge through a real
  gate resolve and `resume_partial` resolutions to `completed`.
- The access report records the scoping honestly: `Subagent scoping — second-reader:
  explicit_files (1 files)`.

**F1 live proof (every completed leg):** every phase of every completed run committed
`{"status":"done"}` phase-results the harness parsed (the STB.3 signature
`missing or unparseable .rhema/phase-result.json [leg=phase_result]` does not appear on any
Stage-B step), and the failed research leg proves the *enforcement* half: a model-written
`.rhema/phase-result.json` was harvested and enforced as `phase_blocked` instead of silently
missing.

### 7.3 The research leg — honest blocked, documented (D-DEF.1-1)

Run `01M3EGS55XHHFBT6CNS7Z3F5N9` was created with the verbatim thread question
("please look at this thread and tell me what this project is about in two sentences" —
confirmed the real user turn, `agents/assistant/threads/01M3D31PA64R0BX4NHXW6VD6RN/session/
01M3DEKKNXC5Y354BRFK79KY1H-user.md`, 99 B) plus `threadId`/`fromRunId`/`sources=5`. The mount
manifest carried the thread session file, prior outline research, drafts, and figure assets;
the `key=value` prompt lines carried `question=…` + `phase_output` (verified in
`runspec.ts` — `inputs` merge `hyd.inputs`).

The agent ran 24 events (Bash/Glob/Read/Write), **read the thread file and the mounted
project materials, wrote a nonempty `00-plan.md`, and wrote
`.rhema/phase-result.json` = `{"status":"blocked"}`**. The harness harvested it, parsed it,
and failed the phase honestly (`phase_blocked`, `retryable:false`, `errorClass:blocked`) —
the F1 harvesting contract working exactly as designed on the failure path.

Verdict: this is a **defensible model judgment, not a pipeline defect**. The skill's contract:
"decompose `question` into a fetch plan — the sub-questions and the ≤N candidate URLs or
search queries… A burst that cannot decompose the question writes the plan with the
sub-questions it could form and reports `{"status":"blocked"}` — it never silently proceeds."
A thread-summarization question decomposes into **zero external fetches** — every fact is in
the mounted thread. Whether a thread-local question *should* be routable to `research_burst`
at all (vs `chat_turn` answering directly, or the burst emitting a zero-fetch note + `done`)
is a product/skill-contract question beyond DEF.1's repair scope. The `fetch`+`distill`
phases have still never been exercised live (STB.3's original also died at `plan`) —
deferred as **D-DEF.1-1**.

Also observed (already a named STB.3 finding, **F7**): the SDK's startup
`api.anthropic.com/api/hello` probe is still denied by run allowlists (`egress.denied` 403 at
seq 4) — inference itself ran fine (`/v1/messages` ×19 allowed).

### 7.4 Stage-B spend + disposition

- Committed debits: **2,053 credits** total — outline 127, voice 408, draft 1,027, review 447,
  research 19 + 25 — every leg under its original committed cap; no cap was raised.
- Disposition: F1 **closed live** (all completed legs + enforcement path), F2 **closed live**
  (§7.2), F3 **closed live** (draft plan sidecar validated). The one leg that did not reach a
  delivered artifact — research — is documented honestly above and deferred, not claimed.
- Probe pod `def1-scoped-probe` (runs ns) deleted after verification.
