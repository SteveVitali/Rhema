# R6DEP.7 — maintenance deploy of `main` to prod (run ledger)

- **Spec:** operator-directed insert (no manifest ticket file) — deploy `main` to prod under the
  same discipline as R6DEP.6/R6DEP.5: image build → pin → `pulumi preview --diff` classify →
  `pulumi up` → provenance → deployments row → CDN invalidation → golden re-run classification →
  records. Authorization: operator direction 2026-11-24 ("you're running it. I confirm
  authorization. proceed"). mergePolicy=OPERATOR.
- **Normative loads:** `docs/tickets/DEFERRALS.md` (read first); `infra/PROD-BRINGUP.md`;
  `docs/build/runs/R6DEP.6.md` (recipe); `docs/ops/golden-rerun-rule.md`.
- **Deploy target:** `bf5650ea` (merged main tip — #408+#409+#410 tail stack).
- **Branch:** `stevenvitali/r6dep-7-main-deploy`.
- **Harness:** devin-cli/swe-2-high.
- **Started:** 2026-11-24T~20:45Z.

## Production mutations (named scope)

- `gcloud builds submit` image-set (all 10 services) at `_GIT_SHA=bf5650ea`.
- `pulumi preview --diff` + `pulumi up --stack prod` (image rolls + classified config changes).
- `scripts/live/record-deployment.mjs`.
- `scripts/live/cdn-invalidate-demo.mjs --path '/bff/p/demo~*'`.
- `scripts/live/nightly-golden-driver.mjs --cohort minimal` (protocol-affecting → rule armed).
- Rollback: `git revert` + redeploy of `279f45d3` (digest pins in `Pulumi.prod.yaml` history);
  no migrations in payload → no migration rollback.

## Pre-state (recorded BEFORE mutations, 2026-11-24)

- prod `/healthz` web+api = `279f45d363e270778e5a63995dc575b7010a12b6` —
  `reports/2026-11-24_R6DEP.7/prestate-healthz-*.json`.
- No migrations in payload (ceiling stays `0065`) → no migrate-first ordering needed.
- **Payload `279f45d3..bf5650ea`:** 316 dossier-desk harness repairs + F-R6FIX.45-1 evidence;
  317 SSE client-abort race fix (F-R6FIX.45-2 — api 503 bursts + SSR 500s); 318
  claim_ledger_closed placeholder-note hole fix (F-R6FIX.45-1 — `PLACEHOLDER_NOTE` exclusion,
  checkpoint-contract pin, SKILL.md Closure paragraph → `PROTOCOLS_VERSION`
  `0.4.0+07b1ad37ddaaa6f4`); plus earlier-window merges (dom-contract `data-kind` declaration,
  journeys quiet-hours/desk/ride arms, reports+records).
- **Golden re-run: ARMED** — `packages/protocols` diff (SKILL.md Closure + upstream-port
  manifest + re-frozen version) and run/dispatch-path diff (orchestrator runspec,
  event-stream, run-task work-reader) ⇒ protocol-affecting by the rule's list. At most ONE
  minimal-cohort re-run under `GOLDEN_HARD_CAP_USD` ($100); estimate committed before dispatch;
  `GOLDEN_BUDGET_RULING=approved` one-shot for this attempt.

## Log

- **Image build** — Cloud Build `145bea91-ba08-4f40-9e0d-ddf8fde03627` SUCCESS (~22 min), all
  10 services at `_GIT_SHA=bf5650ea718f6b2aee1b4ab2ba390e3445ebf989` (run-task vendored-SDK
  gate files present; in-build contents assert passed). Digests pinned into
  `Pulumi.prod.yaml` (`rhema:gitSha` + dated comments): api `76f962e8…b6f51` · web
  `c848ccbc…b72c` · worker `a1e0885e…f32d0` · fetcher `e1259c49…786f2` · convert
  `94110524…723ee5` · export `b2dd66bf…f4a72` · collab `b161abde…b709f` · turbo-cache
  `dddbd18f…326a2` · run-task `e93b576c…a6120` · egress-proxy `8a295857…ab391`.
- **Preview** — `pulumi preview --diff --stack prod`: **10 updates + 1 replacement +
  0 creates/deletes, 185 unchanged** — 9 Cloud Run image rolls + the convert Job + the
  stateless `rhema-prod-proxy-tmpl` replace (egress-proxy pin rolls the MIG). Zero stateful
  touches — no Cloud SQL/GKE/bucket/LB diffs.
- **Apply** — `pulumi up --stack prod` **update 188**, 10 updated + 1 replaced, 1m43s, zero
  destructive ops.
- **Provenance** — `check-deploy-provenance --expect bf5650ea… --healthz rhema.tools
  --healthz api.rhema.tools` → **all-PASS** (both origins serve the new SHA; poststate bodies
  recorded).
- **Deployments row** — `record-deployment.mjs` (IAP tunnel :15433, system-role DSN, never
  printed): `prod:bf5650ea…` + all 10 digests, `protocols_version=0.4.0+07b1ad37ddaaa6f4`.
  (Tunnel reset mid-write once → re-established via `gcloud compute ssh … --tunnel-through-iap`
  to `rhema-prod-proxy-ww75`; row verified absent before retry — no duplicate.)
- **CDN** — `cdn-invalidate-demo.mjs --path '/bff/p/demo~*'` submitted on
  `rhema-prod-urlmap-6f2b86e` (host `rhema.tools`).
- **Golden re-run (armed)** — cohort estimate committed (`cohort-estimate.json`: $46.94
  list / 6572 cr, within the $100 cap); jrn-a topped to 13,822 cr via audited `house-grant`
  (ledger `01M87PTZPW99KV7KKGTVJPJR93`, audit `01M87PTZVXFG7XQWQDQBXN9YEH`,
  `RHEMA_OPERATOR_ID=devin-cli:r6dep-7`); session via cached jrn-a storageState (the
  GOLDEN_MINT_SESSION bare-fetch verify hits the interstitial POST — noted for the driver).
  Dispatch tag `r6dep7-a`, legs: golden-essay `01M87PWP6HZ2RK2S8DX0AZDP36` first.
- **Golden cohort — COMPLETE 2026-11-25T00:25Z, 4/4 legs, $39.07 list measured** (est $46.94,
  cap $100). `golden-scores.json`: every leg `schemaValid` + `citedFetched` + 0 attestation
  violations — essay $9.07/1780cr (`01M87PWP6HZ2RK2S8DX0AZDP36`), academic $12.23/2160cr
  (`01M87RXEBGQTBY7SQFDNRE5DVH`), op-ed $11.41/1978cr (`01M87VZV849D03JBFATM4BC1JG`),
  memo $6.36/1130cr (`01M87ZCRHKZYGZBF9H8AMW8KF5`). The driver's 45-min leg bound tripped
  twice on hiccup-resumed runs (academic, op-ed); same-tag re-dispatch deduped terminal legs
  cleanly each time. Post-deploy live datums: **zero placeholder claim rows** cohort-wide
  (F-R6FIX.45-1's gate hole closed — op-ed/memo's all-`unverifiable` researched rows on
  fictional fixtures honestly fired `run.unverified`+`cost.refunded`, the designed REQ-SPEC-31
  path); **zero `ERR_INVALID_STATE`/5xx** in the api log window 21:00Z–00:30Z (F-R6FIX.45-2's
  crash class did not reproduce under ~3h of live SSE).
