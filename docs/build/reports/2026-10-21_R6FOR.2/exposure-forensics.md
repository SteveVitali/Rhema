# R6FOR.2 — RLS-exposure forensics + disclosure verdict (2026-10-21)

**REQ-FOR-4 · GD-EXPOSURE.R6 · closes D-SEC.1-2 (residual-class sign-off readout:
`docs/build/readouts/2026-10-21_R6FOR.2-d-sec-1-2.md`)**

**Access:** IAP tunnel (`rhema-prod-proxy`, us-central1-c) → system-role `postgres` DSN on
`127.0.0.1:15433` → prod `rhema` DB, `BEGIN READ ONLY`. Read-only; tunnel closed after the
session. No writes, no sends, $0 spend. The app-login DSN was deliberately **not** used — under
`FORCE RLS` it would read back zero rows and blind the join (ADR-093 class hazard).

**De-identification.** Everything below is aggregates, route names, date ranges, and stable
`real-ws-N` pseudonyms assigned in first-seen order. No log lines, IPs, user agents, emails,
names, workspace/persona/project/run ids appear in this file or any committed file.

---

## Verdict

**YES — real (non-`is_test`) workspaces' data was served to other real workspaces' sessions
during the RLS-only window.** 252 confirmed cross-tenant read events plus 4 cross-tenant-write
candidates (weak attribution — see limits). Per `GD-EXPOSURE.R6` the yes branch applies: a
plain-language notice is drafted at
`docs/build/reports/2026-10-21_R6FOR.2/notice-draft.md` — **DRAFT, UNSENT — HUMAN-H11 approval
owed before any send. The send is a named mutation and was not performed.**

**Materiality note for the approver.** Every workspace involved — requester and owner sides —
is operator/staff-controlled: internal `rhema.tools` mailboxes (including the two-tenant probe
fixtures created through the real signup funnel for the SEC.1 Stage-B checks) and the
operator's own consumer-mail account. **Zero external / non-staff accounts existed in
production during the window** (the eighth real workspace was created 2026-10-21, after the
window closed). The mechanical verdict is still `yes` because the affected tenants are not
marked `is_test`, and the ticket contract keys on `is_test` alone — so the notice is owed and
drafted, but its practical recipients are the operator's own accounts. HUMAN-H11 decides
whether the send still goes out for the record.

## Per-route verdicts

| route family | verdict | cross-tenant events | first → last | requester real-ws | owner real-ws |
|---|---|---|---|---|---|
| `GET /voices` (persona list; api + web SSR surfaces) | **yes** | 206 | 2026-09-22T16:17Z → 2026-10-01T02:02Z | 2 | 2 |
| `GET /voices/:id` + persona detail/estimate/connections (residual bucket A) | **yes** | 31 | 2026-09-22T18:10Z → 2026-10-01T01:27Z | 1 | 1 |
| `GET /projects/:id/chat…` (`loadProject`) | **yes** | 4 | 2026-10-01T00:27Z → 2026-10-01T01:26Z | 1 | 3 |
| `GET /projects/:id` + sub-resources (residual bucket A) | **yes** | 8 | 2026-10-01T00:27Z → 2026-10-01T01:26Z | 1 | 3 |
| `GET /projects/:id/review/:runId/dossier` | **yes** | 3 | 2026-09-25T20:49Z → 2026-09-25T22:09Z | 1 | 1 |
| `GET /runs/:id` family | no | 0 | — | — | — |
| `GET /billing/…` id routes | no | 0 | — | — | — |
| `GET|POST /projects/:id/outline…` | no | 0 | — | — | — |
| `GET|POST|PATCH|DELETE /projects/:id/chat…` writes | no | 0 | — | — | — |
| writes → `POST /voices/:id/connections` | **yes (write)** | 2 | 2026-09-25T23:48Z | 1 | 1 |
| writes → `POST /projects/:id/…` | **yes (write)** | 1 | 2026-09-26T13:11Z | 1 | 1 |
| writes → `POST /runs/:id/gates/…` | **yes (write)** | 1 | 2026-09-26T08:39Z | 1 | 1 |
| `POST /billing/…` | no | 0 | — | — | — |

Pairwise (de-identified; requester→owner):

- `GET /voices`: real-ws-1→real-ws-2 ×202 (09-22T16:17Z → 10-01T02:02Z), real-ws-2→real-ws-1 ×4
  (09-26T04:16Z → 10-01T00:26Z).
- `GET /voices/:id`: real-ws-1→real-ws-2 ×31 (09-22T18:10Z → 10-01T01:27Z).
- dossier: real-ws-1→real-ws-2 ×3 (09-25T20:49Z → 22:09Z) — all pre-fix; the nine later dossier
  requests land after the STB.2 fix boundary and classify `post-fix`.
- chat + `/projects/:id`: real-ws-1→real-ws-3 ×(4+2), →real-ws-4 ×(2+1), →real-ws-5 ×(2+1) —
  the SEC.1 Stage-B probe tenants; same minutes as the probe's own two-tenant pass.
- write candidates: real-ws-2→real-ws-1 ×4 total — see limits.

**Totals:** 252 confirmed cross-tenant reads across 5 route families; 4 cross-tenant-write
candidates; 1 unresolved-possible request; overall `anyYes: true`.

## What was exposed

- **Persona/voice data** — the unscoped `GET /voices` list returned every live persona row to
  any authenticated caller (both personas were real-workspace-owned), and `GET /voices/:id`
  detail/estimate/connections reads returned another workspace's persona.
- **Project + run context** — `loadProject` (chat/outline) and the residual `GET /projects/:id`
  id-lookups returned foreign projects: during the SEC.1 probe minutes, the operator's probe
  session read three freshly-created real tenants' projects via chat and project-detail routes.
- **Dossier/correspondence data** — three pre-fix dossier reads returned another workspace's
  review correspondence (correspondence_items + children).

## Method

Committed, reproducible: `scripts/live/rls-exposure-forensics.mjs` (unit-tested,
`rls-exposure-forensics.test.mjs`, 12 tests). Inputs:

- **Preserved logs (gitignored, local):** `docs/build/logs/sec1-2-exposure/`
  `window-all-api-web.json` — 18,482 entries, 2026-09-17T05:26Z → 2026-10-01T02:51Z; 16,931 are
  HTTP request entries — plus the 444-entry `leak-route-requests.json` subset.
- **Prod read-only snapshot:** 330 workspaces (322 `is_test`, 8 real), 41 sessions (31
  overlapping the window), 2 personas (both real-workspace-owned), 10 projects, 80 runs,
  7 users; plus id→workspace owner maps over personas, projects (+slugs), runs, artifacts,
  figures, timeline_events, checkout_sessions, threads, connections.

Pipeline per request entry:

1. **Classify** into route families (`classifyPath`); the four confirmed leak families plus the
   residual bucket-A families (`/projects/:id`, `/runs/:id`, `/billing/*`) and write variants.
   Census-only families: `list-route` (every list route carried the predicate per the exposure
   doc + `listProjectStates`' `workspace_id = $1`), `user-keyed` (`/session`, `/inbox`,
   `/usage` — bucket D, route-enforced `principal.userId`), `public-page` (the `/p/*` Page
   family, public by design), `web-doc`, `non-app` (14,441 entries — scanner noise + non-app
   paths, including the 6 unrelated requests in the leak subset).
2. **Owner resolution** — every ULID/slug in the request path maps to its workspace via the
   prod owner tables; `GET /voices` resolves to the set of personas live at request time
   (ULID-minted `created_at` ordering + `deleted_at`).
3. **Requester attribution** — sessions carry mostly-blank `ip_address` and log remote IPs do
   not overlap session IPs, so attribution is inferential: per-(ip, user-agent-class) buckets
   accumulate the workspaces of every resolvable-id request; a request with no id takes its
   bucket's modal workspace; web SSR `GET /voices` entries pair with the same-second api
   `/voices` call (BFF leg). Buckets with zero resolvable ids are `unattributed`.
4. **Verdict** — `exposed` (served 2xx + foreign owner + real requester + real owner, pre-fix),
   `own`, `own-or-empty`, `not-served`, `post-fix` (past the route's fix boundary + 15-min
   deploy skew), `test-tenant` (either side `is_test`), `unresolved-possible` (would-be
   exposure, requester unattributable).

Fix boundaries (deploy timestamps + 15 min skew): dossier **2026-09-25T22:29Z** (STB.2),
everything else **2026-10-01T02:09Z** (SEC.1 `987ce00` deploy / role switch ~01:52Z).

## Limits

- **1 unresolved-possible** — one `GET /voices` 200 (2026-10-01T01:26Z, browser-UA request
  hitting the api host directly) whose (ip, ua) bucket carries no resolvable ids; it would be
  an exposure iff its session was a real workspace's. It is counted honestly but not in the
  252.
- **4 write candidates are weakly attributed.** All four came from the operator-automation IP
  pool (the same `node`-UA automation hosts that ran the probes); the bucket-modal heuristic
  attributes them to a different real workspace than the resource owner. They are more likely
  same-owner writes misattributed (small buckets skew toward the victim workspace's ids), but
  they cannot be ruled out from logs alone — reported as candidates.
- **Session timing** was used only as corroboration, never as sole attribution.
- The `is_test` flag is the contract's only real/test boundary; staff/probe tenants that came
  through the real signup funnel are `is_test=false` and therefore count as "real".

## Sign-off basis (D-SEC.1-2)

- 0026-apply vs first deploy: exposure begins **2026-09-17** — confirmed.
- Switch timestamp: **2026-10-01 ~01:52Z** (migration 0045 + `rhema_app_login` switch) —
  confirmed; zero served cross-tenant events after the 02:09Z boundary+skew.
- Residual classes: every residual family scanned over the full 16,931-request window —
  `runs-id` (62 req), `billing-id`/`billing-write` (162), `user-keyed` (369), `list-route`
  (428) produced zero foreign-owner events beyond the `projects-id`/chat rows above, which are
  the same probe minutes already counted.

**Verdict words for the record:** *"Yes — cross-tenant exposure occurred in the window; every
identified party is an operator/staff-controlled account; a plain notice is drafted for
HUMAN-H11 and no send has occurred."* — the operator's own verdict words are owed in the
readout; nothing above substitutes for them.
