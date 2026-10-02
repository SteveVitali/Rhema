# ONB.1 — Text import in ≤ 20 s, a held draft that survives until consumed, faithful imports

REQ-GROWTH-1's promise is now mechanised: a text-format import (`.md`/`.txt`/`.html`/`.docx`)
rides a **warm `convert-svc` Cloud Run service** instead of the cold-batch Job that took
3.5–5.6 minutes on a 1,003-word file — the api's converter calls the service first and falls
back to the Job (which stays, untouched, for batch/`ingest.sync`/PDF/resilience). The
landing-dropped draft is now **durable**: it re-hydrates the file input on *every* `/app/new`
load until a server-echoed token proves a project consumed it, or the user hits **Discard** —
claim-on-attach is gone. An imported manuscript's own `# H1` becomes the project's title
default (consumed at convert — never a demoted body-H2 duplicate), and a relative figure path
that was never uploaded becomes a warning + an inert placeholder the Page never fetches. The
new §13.5 signal **`import_preview_p95_s`** samples presign→preview-ready latency into
`slo_samples` (format-kind `detail`, test-tenant-excluded) with an IaC alert at p95 > 40 s.

Ticket: `docs/tickets/71_ONB.1__import-latency-and-held-draft.md` (chain row 71, round 3;
absorbs BL-60 PR-R4 + BL-64 PR-R5).
Base: `stevevitali/act-1-trial-entitlement` @ `dfbb466` (stacks on the ACT.1 tip).
Merge policy: **OPERATOR — do not merge.**
ADRs: **ADR-044** (warm convert-svc topology — the §12.1 interactive-leg deviation, every
isolation property preserved), **ADR-045** (leading H1 → title, extracted at convert, default
at create), **ADR-046** (unresolved relative figures → warning + inert placeholder, never a
live URL), **ADR-047** (the held-draft consumed handshake — token-matched server echo or
Discard, never a page view).
Requirement ids: **REQ-GROWTH-1** (amended — the 20 s clause + hold-until-consumed),
**REQ-ARCH-23**, **REQ-ARCH-4** (convert has no network), **REQ-ARCH-34** (the new §13.5 row),
**REQ-INGEST-7** (the unresolved-figure warning).
Deferrals: **D-ONB.1-1** (Stage B deploy + timing matrix + cost delta + egress probe),
**D-ONB.1-2** (N1/N3 journey flips + screenshots on the deployed stage). Both need the deployed
stage; `pulumi preview` is already gate-clean (below).

## The defects (PR-R4 / PR-R5, 2026-09-30 prod review)

- A 1,003-word `.md` took **3.5–5.6 min** to preview — the convert Job's cold start — behind
  copy that admitted "a cold start can take a few minutes".
- A landing-held draft attached on the **first** post-signup `/app/new` view only: the island
  `markClaimed()`-ed the IDB record at hydrate time, so every later visit showed "your held
  file is here" over an **empty** input.
- `# The Title` came back as a body `## The Title` under a filename-derived project title —
  the document's own heading demoted and duplicated.
- `![](figure_1_five_questions.png)` shipped verbatim into the canonical body — the rendered
  Page issued live 404 requests for files never uploaded.

## What changed

**Warm service-first conversion (ADR-044).** `apps/convert` gains a `--serve` HTTP mode
(`server.ts`: `POST /convert {quarantineKey}` → read via the same gcsfuse `/usercontent` mount
→ the same `convertBytes` → write `converted/<ws>/<id>.json` → return the result). The SAME
image, the SAME convert SA (bucket read + conditioned `converted/`-only write), **no
`vpcAccess`**, no DB credential, no GCS client in-process — ingress is internal-LB and
`roles/run.invoker` is granted to the api SA only (OIDC token per hop). `minInstanceCount: 1`
on prod (est. ≈$13/mo idle), 0 non-prod. `packages/live-clients`' `createConvertServicePreview`
orders read-back → bounded `POST /convert` → **Job fallback** on 5xx/transport; a
deterministic 4xx throws (the Job would fail identically); a client timeout returns `null` =
pending because the service still writes `converted/`.

**Fidelity (ADR-045/046).** `ConversionResult.title?` (additive); `extractLeadingTitle` +
`inertUnresolvedImages` (packages/markdown) run inside `convertBytes` before normalize — the
leading H1 is consumed into the title and can never demote into the body, and non-`https?`/
`data:` image targets (incl. reference-style defs) rewrite to `![]()` so the PM figure node
renders its existing `src=""` placeholder — zero requests. Each inerted path emits an
`image_dropped` warning ("wasn't included — add it or remove the reference") and degrades
`clean`→`partial`. Title resolution at create is typed → H1 → filename-stem.

**The hold is durable (ADR-047).** The island ignores the legacy `claimed` flag; `/app/new`
renders `data-held` + notice + `landing.js` unconditionally; the hold re-attaches via
`DataTransfer` on every load. `heldToken` rides form → poll → preview → create; the success
redirect carries `?hc=<token>`; the project page stamps `data-held-consumed` and the island
deletes the hold **only on a token match**. Discard deletes it locally. The pre-auth beacon
still carries token + kind + size only.

**The SLO (REQ-ARCH-34).** Migration `0052` adds `slo_samples.detail` (format kind — a slow
PDF can't pollute the text-format p95). The api stamps a Redis first-seen key
(`rhema:ipr:<qk>` NX EX 900) at presign and samples `import_preview_ms` on the ready hop;
the probe is `percentile_cont(0.95)` over `detail in ('md','txt','html','docx')` excluding
`workspaces.is_test`; `SLO_ALERT_SIGNALS` + `docs/ops/slo-review.md` carry the row.

**Honest wait copy (deliverable 2).** "a cold start can take a few minutes" is gone —
`convertingCopy` picks seconds-copy for known text extensions, the PDF warning for `.pdf`,
and a both-bounds line for unlabeled key-only polls.

**Journeys.** N1 (drop → real magic-link → three `/app/new` loads, attached each time) and N3
(held draft → project, preview ≤ 20 s, `?hc=` consumption) are implemented as real one-context
walks — IndexedDB is context-partitioned, so the sign-in happens inside the holding context.
Both stay `expected:"red"` until Stage B flips them.

## Verify

`pnpm turbo build lint typecheck` — **135/135**. `pnpm test` — **4,111 pass / 0 fail**.
`check:licenses` 609 OK; `check:protocol-markers` OK; `check-build-memory` 0 violations;
additive-migrations +0052 clean. Scoped suites: `convert.test.ts` 15, `server.test.ts` 4
(incl. the no-egress conversion round-trip), `ingest.test.ts` 26, `import-doc.test.ts`,
`figure-placeholder.test.ts` 4, `landing.test.ts` 16, `import.test.ts` 11 (incl. the
`import_preview_ms` + `detail` write), `slo.test.ts` 16 (format scoping + test-tenant
exclusion + breach), `compute.test.ts` 10 (no vpcAccess, invoker-only, warm-prod, env), web
`server.test.ts` 98.

## `pulumi preview` (prod, 2026-10-02) — gate-clean

+3 create (`convert-svc`, `api-invokes-convert-svc`, `slo-import-preview-p95-s` AlertPolicy),
~6 update (api template env + pre-existing `-scaling` normalization noise), **0 replace /
0 delete** — the convert Job and the user-content bucket are untouched. Estimated delta
**≈$13/mo** (idle min-instance 1 vCPU + 1 GiB) ≤ the $15 pre-authorization — the Stage B
leg records the measured figure.

## Owed (deferred — never claimed)

- **D-ONB.1-1:** Stage B deploy (Cloud Build → pin digests → apply `0052` → `pulumi up` —
  a bare up would boot a convert image with no `--serve` mode) + the ≥20 preview-only timing
  imports (≥3 after ≥15 min idle → p95 ≤ 20 s) + measured cost delta + live egress probe +
  $0-inference confirmation.
- **D-ONB.1-2:** N1/N3 `ready-to-flip` on the deployed stage → registry flips + screenshots
  under `docs/build/reports/`.
