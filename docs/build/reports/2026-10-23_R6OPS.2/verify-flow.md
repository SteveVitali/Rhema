# R6OPS.2 — live verification record (prod `rhema-507501`, 2026-10-23T21:3xZ)

## What was verified live (all reads `gcloud`/`curl` on prod)

1. **Channel exists + correctly shaped.** `gcloud alpha monitoring channels list` → exactly 1
   `NotificationChannel` `projects/rhema-507501/notificationChannels/11368222885303875371`,
   `type: webhook_tokenauth`, `enabled: true`, `displayName: "rhema-prod ops alert webhook"`,
   `creationRecord.mutateTime: 2026-10-23T21:32:35Z` (the `pulumi up`). See `channels-list.json`
   (`labels.url` redacted in the file — the value is the SM secret, never committed).
2. **URL byte-equality.** `channels describe` `labels.url` == SM `rhema-prod-ops-alert-webhook-url`
   `versions/latest` payload — byte-for-byte (68 chars, sha256 equal; compared in-memory, never
   printed). The channel pages the same proven sink the worker posts to.
3. **All 14 AlertPolicies reference it.** `gcloud alpha monitoring policies list` → 14 policies,
   **14/14 carry `notificationChannels: […/11368222885303875371]`, 0 empty** — the route-5xx
   composite + all 13 per-signal SLO policies. See `policies-channels.txt`.
4. **Sink is live.** `ops_alert_received` receipts continue at the catcher (latest in-window
   2026-10-23T15:56Z, `unverified_delivery` kind — the worker direct-POST path, unchanged).

## Test-notification path — recorded honestly

- **`channels verify` / `sendVerificationCode`: not applicable to this channel type.** gcloud
  alpha has no `verify` verb for channels; the REST
  `POST …/notificationChannels/11368222885303875371:sendVerificationCode` returns
  `400 FAILED_PRECONDITION "Cannot generate verification codes for a channel of this type."`
  — `webhook_tokenauth` channels need no verification and deliver on the first incident open.
  Verbatim API response recorded (it is the only "send a test" surface GCP exposes for channels;
  there is no per-policy test-notification verb in gcloud or the v3 API).
- **No synthetic breach fabricated.** Triggering a real notification would require writing a
  forged `[slo] violation` line under the prod worker's resource (a prod-telemetry mutation
  creating a fake SLO incident) or inducing a real 5xx — neither is in this ticket's authorized
  mutation set ("wire the channel"), and the finding's own remediation named only
  config-bind + `up`. The verify-flow alternative is exhausted (above); the sink's POST→200
  contract on this exact URL is already live-proven (488+ worker receipts).
- **Owed-by-nature:** the first natural incident open (next real `[slo] violation` / LB 5xx
  breach — zero violations in the last 6 h, no open incidents at deploy) delivers the first
  Monitoring-shaped receipt at the catcher. That observation is recorded as the residual on
  D-P1.22-2 leg (e); it does not block the finding close — the page path is armed, bound,
  referenced on all 14 policies, and terminates at a proven sink.

## Deploy record

`pulumi up --stack prod` — update 157: `+1 created ~14 updated 158 unchanged`, 26 s. Channel-only
change: **no image roll** (`serviceImages`/`gitSha`/`runTaskImageDigest` untouched ⇒ zero
cloudrun/job resources in the diff ⇒ deployed SHA stays `80db0d5…`; `check-deploy-provenance`
remains true of the deployed set; `record-deployment`/`deployments` row not owed — nothing new to
attest). Preview classification: `preview-classification.md` (GD-DEPLOY.R6: zero stateful
replace/delete ✓ · additive lint n/a — no migrations ✓ · cost ~$0 ✓ · provenance unchanged ✓).
