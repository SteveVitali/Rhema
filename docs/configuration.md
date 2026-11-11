# Configuration

You can install, build and run the deterministic tests without cloud credentials or a private
evaluation checkout. Running the services requires additional configuration and provisioned
dependencies. This page separates those two paths and points to the code that owns each setting.

## Build and test configuration

| Setting                                  | Needed for local development?     | Behavior                                                                                                                                                                                                            |
| ---------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RHEMA_EVALS_PATH`                       | No                                | An absolute path to an optional private evaluation checkout. When unset, `evals-stub` supplies `@rhema/evals`. The pnpm hook applies the choice at installation.                                                    |
| `TURBO_API`, `TURBO_TOKEN`, `TURBO_TEAM` | No                                | Optional remote build-cache configuration. Local builds work without remote-cache credentials.                                                                                                                      |
| `DATABASE_URL`                           | Only for the server-Postgres test | Enables a test that migrates, seeds and changes roles in its target database. Use a disposable database as described in [Testing](./testing.md#server-postgres-tests). Leave it unset for the in-process test path. |

The dependency choice is implemented in [`.pnpmfile.cjs`](../.pnpmfile.cjs). It concerns only
`@rhema/evals`; `packages/protocols` is an ordinary committed member that ships public with the
repository (operator ruling 2026-11-02).

Runtime entry points read `process.env`. The checked-in start commands do not automatically load
a `.env` file. Export the needed values in your shell or have your process/deployment manager
provide them. Do not copy deployment credentials into examples or Git.

## Web host

These settings are read by [`apps/web/src/main.ts`](../apps/web/src/main.ts).

| Variable                 | Default when unset                | Purpose                                                                                                    |
| ------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `PORT`                   | `8080`                            | HTTP listen port.                                                                                          |
| `API_BASE_URL`           | `http://api:8080`                 | API origin for server-side calls. Set an explicit localhost origin for a local API.                        |
| `APP_BASE_URL`           | Request origin for auth callbacks | Public web origin; keep it consistent with the API's auth configuration.                                   |
| `COLLAB_WS_URL`          | No explicit override              | Collaboration WebSocket URL supplied to the Page client.                                                   |
| `SIGNUP_MODE`            | `invite`                          | Admission mode; allowed values are `invite` and `open`.                                                    |
| `INTERNAL_AUTH_AUDIENCE` | Unset                             | Enables the deployed web-to-API OIDC identity channel. It is not needed to inspect the local public pages. |
| `RHEMA_BUILD_GIT_SHA`    | Unset                             | Build revision reported by health/provenance responses. Images supply it at build time.                    |
| `RHEMA_DEMO_CORPUS_ROOT` | Installed `@rhema/demo-corpus`    | Demo corpus root (the dir holding `snapshots/` + `corpus/`). Point at `packages/demo-corpus/fixtures/synthetic` to serve the committed test fixture. |

The [local web instructions](./development.md#inspect-the-web-host) start the host for public-page
and asset work. Supplying an API URL alone does not provision an API, account, database, or model
runtime. Authenticated pages and actions depend on those services.

## Service dependencies

The environment readers and composition roots are the complete references. The table highlights
the dependencies that prevent a clean source checkout from being a complete local installation.

| Service       | Core configuration                                                                                                                                        | Source                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| API           | `DATABASE_URL`, `REDIS_URL`, `OBJECTS_BUCKET`, `RUN_TOKEN_PRIVATE_KEY_SECRET`, `RUN_TOKEN_PUBLIC_KEY_SECRET`; a separate system DSN for queue/system work | [Reader](../apps/api/src/env.ts), [wiring](../apps/api/src/server.ts)                             |
| Worker        | User and system database DSNs, Redis, objects bucket, run-token secret references, run-task image and Kubernetes launch settings                          | [Reader](../apps/worker/src/env.ts), [wiring](../apps/worker/src/main.ts)                         |
| Collaboration | `DATABASE_URL` for the collaboration role and `OBJECTS_BUCKET`; Google credentials for the content store                                                  | [Reader](../apps/collab/src/env.ts), [wiring](../apps/collab/src/server.ts)                       |
| Egress proxy  | `DATABASE_URL`, `ANTHROPIC_KEY_SECRET`, deployed network/TLS configuration                                                                                | [Entrypoint](../apps/egress-proxy/src/main.ts), [server](../apps/egress-proxy/src/server.ts)      |
| Run task      | Worker-generated run specification, isolated filesystem, internal API/proxy bindings and a populated SDK image                                            | [Image](../apps/run-task/Dockerfile), [SDK build prerequisite](../apps/run-task/vendor/README.md) |

The API parser accepts `SYSTEM_DATABASE_URL` as optional, but its live pg-boss transport falls
back to `DATABASE_URL` when it is absent. The restricted user-serving role has no pg-boss schema
privileges. A deployment using the intended role separation must provide the system connection;
elevating the user-serving connection is not a substitute. The worker requires
`SYSTEM_DATABASE_URL` explicitly and has no fallback.

Variables ending in `_SECRET` or `_SECRET_NAME` in these service readers generally identify
Secret Manager versions. For example, `RUN_TOKEN_PRIVATE_KEY_SECRET` is a resource name such as
`projects/example-project/secrets/run-token-private/versions/latest`, not the key bytes. Service
identities also need permission to read the referenced versions. Keep real provider credentials
out of the model agent, browser bundles, and web/collaboration service configuration.

## Optional integrations and admission modes

An optional setting can leave a feature unavailable; it does not mean the service can emulate
that integration. In the API's [live wiring](../apps/api/src/server.ts):

| Feature                      | Configuration                                                                                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Better Auth / Google sign-in | `BETTER_AUTH_SECRET_NAME`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET_NAME`, and `APP_BASE_URL` must all be present to construct auth. Magic-link delivery also needs the worker's mail configuration. |
| Billing                      | `STRIPE_SECRET_KEY_NAME` binds Checkout/Portal; `STRIPE_WEBHOOK_SECRET_NAME` separately binds webhook verification. Purchase admission is still controlled by `PURCHASE_MODE`.                                    |
| Export rendering             | `EXPORT_SERVICE_URL` points to the isolated export service.                                                                                                                                                       |
| Import preview               | `USER_CONTENT_BUCKET` and `CONVERT_JOB` bind the import-preview path; `CONVERT_SERVICE_URL` adds the warm conversion service.                                                                                     |
| Remote ingestion             | `FETCHER_SERVICE_URL` binds the guarded fetch service.                                                                                                                                                            |
| Notification mail            | The worker's `RESEND_API_KEY_SECRET`, sender and application origins, plus shared `EMAIL_ACTION_SECRET_NAME` for signed email actions.                                                                            |

The API environment parser uses these defaults for missing or unknown values:

| Variable             | Accepted values               | Parser default |
| -------------------- | ----------------------------- | -------------- |
| `SIGNUP_MODE`        | `invite`, `open`              | `invite`       |
| `PURCHASE_MODE`      | `closed`, `open`              | `closed`       |
| `DEBIT_MODE`         | `committed`, `metered`        | `committed`    |
| `REFUND_WINDOW_MODE` | `off`, `test_tenants`, `open` | `off`          |

These are **parser defaults**, not a statement about a running deployment. Stage configuration
can supply different values. Changes to money or admission policy follow their operator
procedures; see the [debit-mode runbook](./ops/debit-mode-flip.md).

The old SPA renderer flags and request overrides are removed. Do not add `SPA_SURFACES`,
`SPA_OVERRIDES`, `?renderer=spa`, or `?ssr=1` to a setup recipe.

## Deployment prerequisites

The repository has no single-command local service stack. Its infrastructure implementation is
GCP-specific: managed Postgres, Redis, GCS buckets, Secret Manager, Cloud Run services, a GKE
task environment, and an egress proxy. [Stage configuration](../infra/config/stages.ts) selects
AlloyDB for `dev`/previews and Cloud SQL for `prod`; this describes the program, not current
resource health.

The [Pulumi guide](../infra/pulumi/README.md) covers the separate infrastructure project, cloud
identity and billing prerequisites, service images, generated non-production secrets, migrations,
and preview lifecycle. All `pr-<n>` stack operations use
[`scripts/live/preview-stack.mjs`](../scripts/live/preview-stack.mjs). The
[production runbook](../infra/PROD-BRINGUP.md) is for maintainers operating an authorized deployment.

A clean checkout does not contain the SDK trees needed by a working run-task image. CI explicitly
opts into a placeholder SDK image for image-shape checks; that artifact cannot perform a live
model run. Follow the [vendor instructions](../apps/run-task/vendor/README.md) for the separate
runtime prerequisite. The [release record](./open-source-readiness.md) covers the public-release
boundary and its post-flip follow-ups.
