# R6DEP.2 — rollback recipe (prod `e04a8c8` → `80db0d5`)

If prod must roll back to the prior deployed SHA
(`80db0d521b55fbbb760be80220508cb2dc11812a` — the R6SECR.1 deploy):

1. Revert the three image pins in `infra/pulumi/Pulumi.prod.yaml` to the
   `80db0d5` digests (git revert of the R6DEP.2 pin edit, or restore verbatim):

   ```
   rhema:serviceImages: {"api":"…/rhema-prod/api@sha256:627ca4f2c8f19979fba572759c8b8ca669f9ae864c29d7188793e7181f967ab5",
     "web":"…/web@sha256:c202a0d52d6c154cb1517edf750a584fec7e5d70e5a3136c01b3594dfc555b2f",
     "worker":"…/worker@sha256:15ec4ab0cf19a9503c6139b7ac4da6978af892e7a6bbbf623684461d3e3dc3ae",
     "fetcher":"…/fetcher@sha256:7ef950414595f8e2256cc989905ecfb485ff483a2383611e250b8db2e469c899",
     "convert":"…/convert@sha256:e7eb248cbde039d044f4a67b3532bd5f9396caf7d046b1160405a774b2801bae",
     "export":"…/export@sha256:292e16e6d1e87bb29f19577a6de157fa9a74aeedb501cca062ef4394853b30e0",
     "collab":"…/collab@sha256:16ec90359011a1fc79601f1a485220989809c5cd2a20b327eb3de64dd8a949e7",
     "turbo-cache":"…/turbo-cache@sha256:37cceed778ee422eb5ce52ed73d4fe9e93742d790fc8917e3f621c3a5e01caef"}
   rhema:runTaskImageDigest: …/run-task@sha256:b90023479a0d027090b990c3471966c998b5359c45413c216fabbd98b9a4cd3c
   rhema:proxyImage: …/egress-proxy@sha256:86d0655feb2e727e585be85a24f90950a72c0bf53adba50f181c00b54ac98c03
   ```

   (`…` = `us-central1-docker.pkg.dev/rhema-507501`. These digests remain in the
   `rhema-prod` AR repo — no rebuild needed.)

2. `cd infra/pulumi && pulumi up --stack prod` — same shape as this deploy
   (service image rolls + the stateless proxy-template replace → MIG re-roll).

3. Provenance: `node scripts/check-deploy-provenance.mjs \
   --expect 80db0d521b55fbbb760be80220508cb2dc11812a \
   --healthz https://rhema.tools --healthz https://api.rhema.tools`.

4. `scripts/live/record-deployment.mjs` over the IAP tunnel with the `80db0d5`
   digests (`prod:80db0d521b55fbbb760be80220508cb2dc11812a` was already recorded
   2026-10-23; a rollback writes a NEW deployments row for the re-deploy event).

5. Optional code rollback (if the revert includes source): `git revert` the
   payload commits + a fresh image-set build — the config-only path above is
   sufficient for a same-images rollback.

No data migration reversal is needed: the `80db0d5..e04a8c8` diff carried zero
`packages/db/migrations` files (additive-lint PASS), so the schema at `_migrations`
max `0058` is identical under both SHAs.
