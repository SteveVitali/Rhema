# R6FIX.57 — placeholder default → digest-pinned hello (F-R7UX.1-1)

Harness: devin-cli/swe-2-high (direct implementation, no subagent)

- **Finding:** `gcr.io/google-containers/pause:3.9` pruned — tag list now ≤3.2 + `deprecated-public-image-*`.
  `pulumi up` without image pins failed all 8 Cloud Run creates (pr-418: all-8 image-pull failures;
  pr-420 same class). Prod unaffected (own override `us-docker.pkg.dev/cloudrun/container/hello`,
  `Pulumi.prod.yaml:55`).
- **Fix:** default → `us-docker.pkg.dev/cloudrun/container/hello@sha256:9654ebfdd31387ad4c1b79ca025ce55ed157d55abb29bdd6ec2231f754d8da0e`
  (manifest list digest, verified 200 on `us-docker.pkg.dev/v2/cloudrun/container/hello/manifests/latest` 2026-11-26).
  Rationale: digest survives the exact failure mode (tag GC); hello == prod's override (one posture);
  hello serves HTTP where pause never could.
- **Stage A:** `@rhema/infra` typecheck + lint + vitest 155/155 green.
- **Owed:** D-R6FIX.57-1 — live datum at the next unpinned preview bring-up (spend ruling).
