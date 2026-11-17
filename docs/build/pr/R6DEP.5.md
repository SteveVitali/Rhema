# R6DEP.5 — maintenance deploy of `main` to prod (`73902381`), two live-found defects repaired en route

## Summary

Deploys `main` to prod under the operator's 2026-11-17 ruling (preview → classified diff →
`pulumi up` → provenance → deployments row → rollback recipe → CDN invalidation → four-fixture
golden re-run, ≤$100 measured). The deploy took **three merges** because the walk surfaced two
prod-affecting defects in the payload and one infra precondition failure:

- **#385** (`05c1e8dd`) — deploy carrier: migration `0065_account_issuer_default` (better-auth
  1.7.25's runtime schema check rejects `account.issuer NOT NULL`, a column it never writes —
  reproduced against prod's live schema), the monitoring `ALIGN_COUNT` fix, ADR accepts.
- **#386** (`bb6192fc`) — F-R6DEP.5-2 hotfix: the RH-23 same-origin mutation guard honored
  `x-forwarded-proto` (container-internal `http:` vs browser `https:` → ~13 min write-path
  403 outage on prod).
- **#387** (`73902381`) — F-R6DEP.5-1 park: `sslMode` back to
  `ALLOW_UNENCRYPTED_AND_ENCRYPTED` (the `ENCRYPTED_ONLY` premise — stored DSNs carry
  `sslmode=require` — was false; `SecretVersion.secretData` is write-only + drift-ignored).
- **#388** — prod stack pin record at the deployed `73902381` digest set.

## What landed on prod

`040e36a9 → 73902381`: migrations `0063`/`0064`/`0065` applied migrate-first; all-10 images
rolled (api forced via `dep5b` revision after a transient Secret-Manager `CANCELLED` startup
flake on `00112-tcb`); +8 monitoring/redirect creates; AR cleanup + bucket lifecycles; proxy
MIG template replace. Provenance PASS both origins; deployments row + CDN invalidation done;
sign-in browser-verified end-to-end (the interim web-rollback outage is resolved).

## Incidents (full narrative in `runs/R6DEP.5.md`)

- **F-R6DEP.5-1** — `pg_hba … no encryption` crash-loop; reverted + parked; re-land
  precondition (DSN re-seed → consumer roll → verify → re-flip) appended to `D-R6SEC.3-1`.
- **F-R6DEP.5-2** — origin-guard write-path outage + interim magic-link interstitial 404;
  fixed + verified live.
- **F-R6DEP.5-3** — journeys N1/N3 don't perform the interstitial's deliberate confirm click
  (harness gap; product verified manually).

## REQ-WRT + golden

REQ-WRT-1/-2 verified already applied; REQ-WRT-3 tombstone executed + destruction verified;
T8 mint `--fresh` → leg PASS $0; BL-78 both arms seeded on re-provisioned/funded jrn-a.
Golden `r6dep5-a`: essay $9.91 · academic $10.05 · op-ed $6.56 measured; memo measured at
close (driver's DB watch died mid-MIG-roll — finished by its own queries).
