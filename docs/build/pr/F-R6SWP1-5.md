# F-R6SWP.1-5 — test-mailbox identities ride a dedicated bounded throttle bucket

**Summary.** Two scheduled nightlies on `main` (40689727097, 40876457031) failed with ~13 legs
429-blocked: every `test+*/signup` leg trips "Too many attempts — wait a few minutes" because the
suite mints ~20+ sessions per run while each submit crosses **two** shared admission throttles —
`rl:signup` (perIp=10/h) on `POST /signup` and `rl:magiclink` (perIp=20/h, perEmail=4/h) on the
send gate — all keyed on one GitHub-runner IP. The finding's option (a) is implemented, amended
(ADR-124): `test[+<tag>]@<TEST_MAILBOX>` identities now count on a **dedicated, higher-ceiling,
still-bounded** bucket `rl:testidentity` (perIp=240, perEmail=120, 1 h ≈10× suite demand) at all
three admission call sites. The exemption moves the ceiling; it never removes it (ADR-039's
never-unlimited posture holds).

**Security reasoning.** A magic link addressed to `test+anything@rhema.tools` can only ever
deliver to OUR OWN pinned DWD test mailbox — the third-party email-bombing surface the limiter
exists to close cannot open. What stays bounded: account-creation row churn (every created
workspace is `is_test`-flagged, 26 h-purged, 0-credit, unverifiable) and send volume to our own
mailbox, each capped by the bucket's ceiling. Invite/mode admission is untouched — a `test+` send
in invite mode still refuses without a valid code. The boundary is exactly `matchesTestMailbox`
(the ADR-020 flag predicate): `test+x@other.test`, `tesseract@rhema.tools`, `test@rhema.tools.evil`
never match and keep the production limits. Unconfigured (`TEST_MAILBOX` or the bucket unset) ⇒
no exemption anywhere — fail-closed default.

**What changed.**

- `apps/api/src/auth.ts` — `AuthAdmission.testMailbox`/`testIdentityThrottle`,
  `TEST_IDENTITY_THROTTLE_DEFAULTS`, `admissionThrottle()` selection in `user.create.before` and
  the `sign-in/magic-link` send gate.
- `apps/api/src/signup.ts` — `SignupApiDeps.testIdentityThrottle` + the same selection in
  `POST /signup`.
- `apps/api/src/index.ts` — `BetaApiDeps.testIdentityThrottle` + wiring into `createSignupRoutes`.
- `apps/api/src/server.ts` — the shared+fallback `rl:testidentity` throttle, bound into the
  Better Auth `admission` and the app deps.
- `apps/api/src/auth.test.ts` + `apps/api/src/signup.test.ts` — 10 deterministic tests.
- `docs/adr/ADR-124-test-identity-throttle-bucket.md` — the amended option-(a) decision record.

**Why not the literal "exempt" / other options.** The finding said "the magic-link send limiter" —
measured, the `rl:signup` account-creation bucket binds sooner (perIp=10), so a send-only
exemption would not fix the suite. A full skip (no throttle for test+) was rejected: an unbounded
unauthenticated write/send path breaks ADR-039 even self-targeted. Runner-side pacing (b) is a
throughput workaround; pre-minted fixtures (c) defeat the fresh-identity legs' assert object.

**F-R6SWP.1-4 non-secret half — dispositioned, not implemented (needs two operator rulings).**
T8's 410 arm needs a backdated `account_exports` row; every self-supply channel reduces to a
system-role prod DSN in GitHub secrets + an authorized recurring prod write. Shrinking path
recorded in `runs/F-R6SWP1-5.md`: one-time re-mint on the purge-exempt `test+jrn-a` tenant + bind
`JOURNEY_T8_EXPORT_TOKEN` (harmless — only ever yields 410); full-automation recipe recorded, not
committed. `JOURNEY_DATABASE_URL` was NOT wired — a prod DSN in GitHub secrets is the operator's
posture call.

**Verification.** `vitest apps/api/src` 46 files / 575 pass (10 new tests: test+ routes off the
prod buckets at the exact boundary, real/near-miss addresses limited, unconfigured ⇒ no
exemption, test bucket still bounds, invite admission unexempted) · `pnpm turbo build lint
typecheck` 135/135 · `pnpm --filter @rhema/api lint`+`typecheck` clean · `pnpm format` is
pre-existing repo-wide red at base (recorded; new files prettier-clean).

**Live re-proof.** None runnable pre-merge: journey provenance refuses non-`main` refs. The next
scheduled/dispatch nightly on `main` post-merge is the re-proof (the finding's failure mode was
structural — the suite now physically cannot starve the prod buckets).

**Requirement ids:** REQ-BETA-19, REQ-SPEC-29. **Run ledger:** `docs/build/runs/F-R6SWP1-5.md`.
mergePolicy OPERATOR — never merged.

| AC | layer | verdict | evidence |
|---|---|---|---|
| test+ rides `rl:testidentity` at the exact boundary | engineered | met | both test files |
| real addresses unchanged; unconfigured ⇒ no exemption | engineered | met | safe-default legs |
| test bucket still bounds | engineered | met | "still bounds" legs |
| admission not exempted | engineered | met | invite-mode leg |
| F-R6SWP.1-4 T8 half | record | met-differently — operator-gated, recorded | run ledger |
| live re-proof | live-executed | carried — next nightly on `main` post-merge | — |
