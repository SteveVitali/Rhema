# R6OPS.2 — prod preview classification (GD-DEPLOY.R6 four conditions)

`pulumi preview --diff --stack prod` @ `stevevitali/r6ops-2-alert-channels` (`infra/pulumi`),
2026-10-23T21:3xZ — full output: `preview-diff.txt` (verbatim; `labels.url` renders `[secret]` —
zero `run.app` occurrences, no plaintext URL anywhere in the output).

## Per-resource classification

| Resource | Op | Class |
|---|---|---|
| `gcp:monitoring/notificationChannel:NotificationChannel` `rhema-prod-ops-webhook` | **+ create** | new webhook_tokenauth channel (`displayName "rhema-prod ops alert webhook"`, `enabled`, `labels.url:[secret]`) — the finding's missing resource |
| `gcp:monitoring/alertPolicy:AlertPolicy` ×14 (`rhema-prod-route-5xx` + 13 `rhema-prod-slo-*`) | **~ update** | `+ notificationChannels: [[0]:[unknown]]` — each gains the channel reference, nothing else changes |

`Resources: +1 to create, ~14 to update, 158 unchanged.` Zero replace, zero delete.

## Condition check

1. **Zero replace/delete on stateful resources — PASS.** No replace/delete at all; the only
   creates/updates are Monitoring resources (no DB, bucket, SA, secret-version, or service
   resource touched).
2. **Additive-migration lint — n/a.** No migrations in this change (no `packages/db` diff).
3. **Cost delta ≤ $15 — PASS (~$0).** NotificationChannels carry no charge; alert policies are
   unchanged in kind (channel reference only). No compute/storage delta.
4. **Provenance all-PASS after — recorded honestly.** This up rolls no images (no
   `serviceImages`/`gitSha`/`runTaskImageDigest` change ⇒ zero `cloudrun`/`run`/job resource in
   the diff ⇒ deployed SHA unchanged at `80db0d5…`). `check-deploy-provenance` remains true of the
   already-deployed set; `record-deployment` is not owed (no `deployments` row — nothing to
   attest a new SHA for). Recorded in `runs/R6OPS.2.md` evidence log.

**Verdict: inside the envelope — `pulumi up --stack prod` proceeds.**
