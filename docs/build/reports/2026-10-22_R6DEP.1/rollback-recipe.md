# R6DEP.1 — Rollback recipe (prod tip deploy → previous SHA)

Rollback target: `ffbb8ad3f2dedd690a5b9d8a86528128fd25fa23` (ARMB.2 — previous prod deploy SHA,
ancestor of the deployed tip; verified `git merge-base --is-ancestor ffbb8ad dc7fb15` = true).

**Pre-state anomaly (recorded 2026-10-22):** prod's live `/healthz` reports
`ffbb8ad01b4383ab7f11088c8427b668bc442b01` — a SHA not present anywhere in the repository
(`git cat-file -t` fails locally and post-fetch; `git rev-list --all` has no match). The
ARMB.2 image set was almost certainly built at the pre-history-repair chain tip before
`d65d7ec`/`ffbb8ad3` rewrote the branch — an orphaned provenance stamp, not foreign code.
Consequence: rollback by digest repin (Option A) restores the ARMB.2 image set but its
`/healthz` will continue to report the orphaned SHA; `check-deploy-provenance` against
`ffbb8ad3f2de` will report NO-MATCH on the stamp, so a provenance-clean rollback prefers
Option B (rebuild at the in-repo `ffbb8ad3f2de` tree).

Deploys are image-digest-pinned Pulumi ups. Rolling back = serve the image set built at
`ffbb8ad` again. Two options; prefer A (no new build — the ffbb8ad image set is already in
`rhema-prod` AR from the ARMB.2 deploy, digest-pinned and immutable).

## Option A — repin the existing ffbb8ad digest set (fastest, no rebuild)

The ARMB.2 digests recorded in `infra/pulumi/Pulumi.prod.yaml` history (git show the file at the
deploy-parent commit, or `git log -p infra/pulumi/Pulumi.prod.yaml`):

```bash
# 1. Retrieve the prior pins.
git show <pre-deploy-commit>:infra/pulumi/Pulumi.prod.yaml > /tmp/prod-prev.yaml
grep -E "serviceImages|runTaskImageDigest|proxyImage" /tmp/prod-prev.yaml

# 2. Restore them on the live prod stack (operator env, no secrets touched).
pulumi -C infra/pulumi config set rhema:serviceImages '<prior JSON>' --stack prod
pulumi -C infra/pulumi config set rhema:runTaskImageDigest <prior digest> --stack prod
pulumi -C infra/pulumi config set rhema:proxyImage <prior digest> --stack prod
pulumi -C infra/pulumi config set rhema:gitSha ffbb8ad3f2dedd690a5b9d8a86528128fd25fa23 --stack prod

# 3. Redeploy.
cd infra/pulumi && pulumi up --stack prod --yes

# 4. Prove provenance.
node scripts/check-deploy-provenance.mjs \
  --expect ffbb8ad3f2dedd690a5b9d8a86528128fd25fa23 \
  --healthz https://rhema.tools/healthz \
  --healthz https://api.rhema.tools/healthz
```

## Option B — git revert + rebuild + redeploy (when Option A digests are unavailable)

```bash
# 1. Revert the deploy chain back to the ffbb8ad tree (new commit, history intact).
git checkout -b rollback/r6dep-1 <deploy-branch>
git revert --no-commit dc7fb15a0aa7caa5d47734656d06514d5b75b127..<deploy-head>
# …repeat for the r6dep-1 commits so the tree == ffbb8ad's tree; or simply:
git checkout ffbb8ad3f2dedd690a5b9d8a86528128fd25fa23 -- .
git commit -m "revert(r6dep-1): roll back prod to ffbb8ad tree"

# 2. Rebuild the image set at the reverted SHA into rhema-prod AR.
gcloud builds submit --config infra/cloudbuild/image-set.yaml \
  --project rhema-507501 \
  --substitutions "_AR=us-central1-docker.pkg.dev/rhema-507501/rhema-prod,_TAG=rollback-ffbb8ad,_GIT_SHA=ffbb8ad3f2dedd690a5b9d8a86528128fd25fa23"

# 3. Pin the emitted Digest: lines into Pulumi.prod.yaml (serviceImages JSON,
#    runTaskImageDigest, proxyImage) + rhema:gitSha=ffbb8ad3f2dedd690a5b9d8a86528128fd25fa23,
#    then `pulumi up --stack prod` and rerun the provenance check from Option A step 4.
```

## After rollback

- Record the rollback in `deployments` via `scripts/live/record-deployment.mjs`
  (`GIT_SHA=ffbb8ad3…`, `IMAGE_DIGESTS` = the repinned set, `STAGE=prod`).
- The metered-notice send is NOT rolled back (it is a one-shot comm, not code).
- Cloud SQL schema is additive-only (GD-DEPLOY.R6 enforced pre-up) — no DB rollback needed;
  the migrate Job's additive migrations are compatible with the older binary.
