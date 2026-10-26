# R6CNT.3 — live §12.8 exercise evidence (D-R6SECR.1-1 dated tail)

Source run: **`01M5NGSTDRVN42JHTAA9C2SDDW`** — `review`/`full_board`/`base`, dispatched
2026-10-23T23:16:17Z on prod `80db0d5` against the flagged `is_test` workspace
`01M5M2C6NC3058T528ZX2D44SG`, terminal `completed` at 2026-10-23T23:52:48Z, 7 phases
committed. Metered $10.68 list / 1,991 cr across 117 `usage_records` rows
(`regen-scores.json`, `showcase-bundle.json`).

This is the live-exercise half the deferral piggybacks: what the one real run actually
exercised on the live surface. Legs that need hostile fixture content stayed unexercised —
they are carried, not claimed.

## Exercised live by this run

| §12.8 control | Evidence | Where |
|---|---|---|
| (a) full-board research fetch through `fetcher` | **41 `fetch` + 185 `search` egress rows, all `decision='allow'`, all tagged `agent_label='editor'`** — real source fetches (en.wikipedia.org Pulmonata/Land_crab/Colorado_potato_beetle, bgs.ac.uk, fieldmuseum, trilobites.info…) and searches routed through the credential-injecting proxy (pod log: `credential injector listening at http://127.0.0.1:37799 → http://10.8.16.4:8443`). | `fetch_log` rows in `showcase-bundle.json → runCard.fetches` (341 rows verbatim); `regen-scores.json → secrEvidence` |
| tool-scope hook layer (the mount allow-list's own ledger) | the run's own `access_log`: **Read/Glob/Bash/Write/Agent decisions** — `Bash deny ×12` (`path escapes the sandbox root`, `/dev/null` writes refused), `Glob deny ×20` (`recursive operation over the root`), with the allows for `/work/project/**` and `/app/skills/**` | `access_log` rows in `showcase-bundle.json → runCard.accessLog`; pod log `[hook] … deny/allow` lines (`run-pod-log-final.txt`) |
| (e) second-read isolation from fetched pages | `subagent_launches`: **`second-reader` launched `inputs_kind=explicit_files`, `file_count=1`, `input_paths=["drafts/v1.md"]`** — the second read saw only the draft; no fetched source, no editor finding could reach it. Its `fetch_log`/`access_log` footprint is empty (all rows are `agent_label='editor'`). | `run_mounts`/`subagent_launches` prod rows, recorded here |
| (f) harness/agent uid separation | harness `uid=10001` (capEff `setgid,setuid,sys_chroot,sys_admin`) vs agent `uid=10002` (**capEff none**); the credential injector + harness-secrets mount live under the harness uid only; the agent held no run token or provider key | pod spec `run-pod-spec.yaml` (AppArmor `rhema-run-task`, readOnlyRootFilesystem, drop-ALL, fsGroup 10001, secrets ro 0440); identity lines in `run-pod-log-t0.txt`/`run-pod-log-final.txt` |
| run-task sandbox posture | AppArmor `rhema-run-task`, readOnlyRootFilesystem, drop ALL caps + the four harness adds, tmpfs work/config/tmp mounts — observed live, not asserted | `run-pod-spec.yaml` |
| cited⇒fetched attestation (vacuous) | `citedButUnfetched: 0` — no claim escaped the attestation path because the run attached **zero** cited URLs; the ledger stayed honest rather than asserting unfetched sources (see F-R6CNT.3-1 — the verification phase never closed its claims). | `regen-scores.json → secrEvidence` |
| honest-money invariants (REQ-SPEC-32) | the two phases the run itself reported unclosed (`verification` 256 cr, `discourse` 120 cr) were **auto-refunded** in `credit_ledger`; the breaker absorbed 374 cr (`adjustment`); net charge 323 cr after hold release — `spent_credits` 697 = metered proxy rows exactly. | `credit_ledger` rows, this ledger §spend |

## Carried — NOT exercised (no hostile content on the Wells essay)

| §12.8 control | Why it stayed unexercised | Still owed (D-R6SECR.1-1) |
|---|---|---|
| (b) untrusted-document wrapping | exercised only implicitly inside the proxy (every fetched page is untrusted); no explicit marker leg was observable from the run's own rows | a leg asserting the wrapper's stamp on fetched content end-to-end |
| (c) suspicious Tier-1 → `unverifiable` downgrade | zero suspicious-source rows in `fetch_log` (all decisions `allow`); the Wells sources are benign — nothing to downgrade | a planted suspicious-source fixture driving a downgrade |
| (d) proxy limits — >256-char query, per-run domain cap, ≥12-word draft n-gram | zero `deny` rows; the run's queries/queries were ordinary | planted-fixture legs producing `suspicious_query` refusals |
| `egress.denied` end-to-end pause (REQ-ARCH-32) | no egress denial occurred — the pause path never armed | a planted exfiltration attempt producing the pause card end-to-end |

## Live-found finding recorded by this run

**F-R6CNT.3-1 — `verification`/`discourse` phase done-gates accept a schema-valid but
unclosed ledger.** At `base` tier the verification agent consumed its phase budget on
research (185 searches / 41 fetches) and exited 0 with `claimRowCount:14` but
`inventoryCount:0` — every claim row a placeholder `unverifiable`, zero `claim_sources`.
The sidecar schema check passed a skeleton; the run completed and *honestly self-reported*
the gap as blocking findings 0–1 ("Verification never closed… Discourse mapping never
closed"), capped `evidence_accuracy`/`originality_situatedness` at 2 with the entailment
reasons, and the platform refunded both unclosed research phases. The honesty machinery
worked; the phase-completion gate is the defect — it should require N claims checked
(or degrade the phase to `failed(partial)`) rather than pass a placeholder ledger.
Recorded in LEDGER OPEN FINDINGS; root cause + fix ticket owed.
