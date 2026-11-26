# R6FIX.58 — vendored SDK via _SDK_BUNDLE_URI (F-R7UX.9-1)

Harness: devin-cli/swe-2-high (direct implementation, no subagent)

- **Finding:** placeholder-SDK run-task images can't execute the agent — the vendored SDK is
  gitignored operator-held state, so clean-worktree submits produce no-engine images
  (`ERR_MODULE_NOT_FOUND` at `step.started`; pr-426 run `01M8BF6BJMSF2NC56ZG5E2ZYDS` attempt 2).
- **Fix:** `_SDK_BUNDLE_URI` substitution + `sdk-bundle-fetch` step (before `image-set`'s context
  assert) — hydrates `claude-agent-sdk/` + `claude-agent-sdk-linux-x64/` from a private GCS
  tarball. Gated: `_SERVICES` has run-task, `_ALLOW_PLACEHOLDER_SDK != 1`, URI non-empty.
  Extraction asserts the two required files + chmods the native binary.
- **Bundle (seeded 2026-11-26):**
  `gs://rhema-507501_cloudbuild/run-task-sdk/3289386ff6e96478080e37ca78ac78267d46bdd2440660e459ce76337f9c2fcf.tar.gz`
  — 92.78 MiB, content-sha-named, private Cloud Build staging bucket (the SA already reads it;
  no IAM change). Created from the operator checkout's live vendor trees, tar root = the two dirs.
- **Stage A:** `infra/config/cloudbuild.test.ts` 7/7 (new leg: fetch ordering, cloud-sdk image,
  gating, hydrate targets) · `@rhema/infra` typecheck + lint green · object verified at URI.
- **Owed:** D-R6FIX.58-1 — a real `gcloud builds submit … _SDK_BUNDLE_URI=…` (build minutes,
  spend ruling).
