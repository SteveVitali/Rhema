# Pen-test findings — triage runbook (STB.4 Leg B / D-P1.22-3)

How a vendor finding becomes a ticket (or a carried DEFERRALS row) without any being silently
dropped. The engagement's report lands in `docs/build/readouts/`; every finding gets a `PT-NN` id
and one of three dispositions: **fix ticket**, **accepted-with-mitigation (DEFERRALS row)**, or
**backlog ticket**. Severity → action is mechanical — the scope doc's triage protocol is the law.

## 1. Finding record template (what the vendor files / what intake normalizes to)

```
### PT-NN — <short title>

- **Severity:** critical | high | medium | low          (rubric in §2)
- **Surface:** api | web | usercontent | egress proxy | run-task sandbox | fetcher/convert | tenancy | ingest | collab
- **Status:** received | confirmed | fix-ticketed | deferred | accepted-risk | closed-fixed | closed-wontfix
- **Summary:** one paragraph — what breaks, what the impact is.
- **Reproduction:** numbered steps, exact requests/payloads (object ids + paths, NEVER secret values).
- **Evidence:** response captures, log refs, screenshots — attached or linked, not pasted secrets.
- **Affected control:** which `pen-test-scope.md` controls-list item it defeats (or "new surface").
- **Suggested fix:** vendor's note — not binding.
- **Verifier:** how to re-test after the fix lands.
```

## 2. Severity rubric (verbatim from the scope doc)

| Severity | Definition (examples) | Disposition |
|----------|------------------------|-------------|
| **Critical** | auth bypass · cross-tenant read/write · secret disclosure · cap circumvention | **Launch-blocking** — fix before public launch, no exceptions. Reported ≤24h via the secure channel, not held for the report. |
| **High** | control bypass with material impact | Sized at intake; fix ticket, or accept-with-mitigation recorded as a DEFERRALS row with the operator's reason. |
| **Medium / Low** | everything else | Backlog ticket; batch at the next return pass. |

## 3. Intake workflow (the tickets-from-findings path)

1. **Receive** — the report lands in `docs/build/readouts/` (a `pen-test-<vendor-tag>.md` file) with
   each finding normalized to the §1 template. `<vendor-tag>` is filled at procurement.
2. **Number + dedupe** — assign `PT-NN` ids in report order. Cross-check each finding against the
   deterministic suite (`@rhema/security-checks` `injection-controls.test.ts`) and the live-smoke
   record: a finding the suite already guards is re-verified, not re-litigated; a finding that
   reproduces something the suite claims to cover is a **suite gap** and gets its own line.
3. **Confirm** — reproduce on the provisioned test accounts (or accept the vendor's evidence where
   reproducing is destructive). Status flips `received → confirmed` with the repro ref.
4. **Disposition** — per the §2 table:
   - *fix ticket*: file under `docs/tickets/` in the next sequence slot with the `PT-NN` id in the
     title; the runbook links ticket ↔ finding both ways.
   - *accepted-with-mitigation*: append a `DEFERRALS.md` row (id `D-PT-NN`) naming the mitigation,
     the risk owner, and the revisit trigger — an acceptance that is not in the ledger did not happen.
   - *backlog*: backlog ticket with the `PT-NN` id; no DEFERRALS row needed.
5. **Launch gate** — the launch-blocking list is every `critical` not yet `closed-fixed` plus any
   `high` carried without a DEFERRALS row. The §17 readout names the engagement, the finding counts
   by severity, and the open criticals honestly — a slipped or deferred engagement is stated, never
   smoothed over.
6. **Verify + close** — each fix ticket's verify step is the finding's own `Verifier` steps re-run on
   prod (or staging); the finding flips `closed-fixed` citing the ticket PR. Findings the vendor
   re-tests get the vendor's re-test note attached.

## 4. Standing rules

- **No silent drops.** Every received finding ends at a status; `received` findings older than the
  triage cadence are themselves a process bug to name in the readout.
- **Secrets never** enter findings, tickets, ledgers, or this repo — cite the disclosure *path*.
- **Compensating controls stay named** while the engagement is un-procured: the deterministic
  §12.8 suite + the Stage-B live smokes are the interim assurance, and the readout says so (per
  the scope doc — a slipped engagement is not a quiet skip).
- **Cross-link:** scope — `docs/security/pen-test-scope.md`; vendor package —
  `docs/security/pen-test-vendor-package.md`; deferral row — `D-P1.22-3` in `docs/tickets/DEFERRALS.md`.
