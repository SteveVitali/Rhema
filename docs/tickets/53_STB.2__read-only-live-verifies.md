# STB.2 — Read-only live verify bundle ($0)

- **Sequence:** 53 · **Phase:** post-P1 closeout · **Tag:** ops
- **base_branch:** `main` (post-merge; any small code fixes land as a normal stacked PR).
- **Depends on:** STB.1 (deployed dev/prod carrying the merged tree). RCN.1 should have run first —
  it may already have closed some of these rows.
- **Scope (one line):** every Stage-B leg that needs only a deploy and no inference — the headless
  asserts across the P1 surfaces, the small live-binding code fixes, and the read-only half of the
  P1.22 launch bundle.
- **Spec §§:** 5.1–5.13 surfaces (as verified live), 13.5 (SLO evidence).
- **REQ coverage:** whatever each closed deferral row covers — see the row list below.
- **Run:** `implement-spec spec=docs/tickets/53_STB.2__read-only-live-verifies.md`
- **Gate status:** no new credentials; deploy from STB.1 is the only prerequisite.
- **Live stage:** this ticket IS live work — $0 inference throughout.

## Goal

Close every deferral row whose only missing ingredient is "deployed code + a read-only check" or a
small live-binding fix. This is the big cheap win of the Stage B bundle: ~20 rows that cost
nothing but attendance.

## Row list (as of authoring; RCN.1 may re-map)

**Deploy-verify legs (headless asserts over the deployed tree):**
- D-P1.01-1 (IDE shell pane document + theme stamp), D-P1.01-2 (deep-link routes `/v/:n`,
  `/r/:run`, `/f/:finding`, `/a/:artifact`, `/chat/:thread` resolve with focus targets)
- D-P1.03-1 (WSS collab upgrade + two-connection convergence + reconnect resume)
- D-P1.04-1 (/app attention groups + search + upload preview round-trip)
- D-P1.05-1 (Timeline renders delivered runs; run-card estimate-vs-actual)
- D-P1.06-1 (estimates endpoint + palette parse, no run launched)
- D-P1.07-1 (findings surface over delivered dossier: Margin/Desk/Apply/disposition/deep link)
- D-P1.08-1 (version rail + three compare layouts + restore-point apply + Files pane)
- D-P1.09-1 (approval card anatomy + settings section + guidance CRUD)
- D-P1.17-2 (marketing pages live; showcase seed + precedence on a fresh signup)
- D-P1.18-1 (export job: live pdf/latex/rtf/html + account-zip email leg, $0)
- D-P1.19-2 (phone-width smoke at ~375 px emulation)
- D-P1.20-1 (settings tree, email-change link, support-access grant, export-zip, grace-end
  hard-delete on a throwaway account)
- D-P1.22-2 read-only half (SLO dashboard live, usercontent headers, backup/PITR verify,
  pause-transport deploy assert)

**Small code + live-verify legs** (each is a small patch; PR-stacked onto main):
- D-P1.04-2 (`deleted_at` → `project.purge` enqueue + sweep wiring)
- D-PRB.01-3 (tenant-scoped `db` binding for `listProjectStates` — run inside `withTenant`)
- D-PRB.03-2 (live per-draft estimate inputs: resolve word/claim counts from the draft)
- D-PRB.03-3 (obligation scope line fetched live into the run sheet)
- D-PRB.04-2a (SSE EventSource subscription on `GET /runs/:id/events` — verify live during the
  STB.3 runs rather than here; keep the row open until then)
- D-PRB.11-2 (Substack-flavoured Markdown profile — the ticket's "include if trivial" call)
- D-PRB.13-1 (shared throttle store — assess whether the deployed topology needs it yet)
- D-P1.22-1 (SLO instrumentation gaps — client-ack event-delivery metric + autosave timing, if the
  code legs are small; else keep open)

## Acceptance

- **AC1** — every row in the list gets a disposition: DONE with live evidence cited, or
  explicitly re-deferred into STB.3/STB.4/HUMAN with a reason.
- **AC2** — small code fixes land as stacked PRs off `main` with the usual gates green
  (`turbo build lint typecheck`, `pnpm test`, licenses, protocol-markers, build-memory).
- **AC3** — `$0` inference spend total; any leg that would cost money is deferred to STB.3.

## Verify

- Per-row evidence in `docs/build/runs/STB.2.md`; `check-build-memory.sh .` clean; LEDGER
  PHASE LOG + BUILD_INDEX rows.
