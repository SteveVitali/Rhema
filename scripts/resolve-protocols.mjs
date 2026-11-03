#!/usr/bin/env node
/**
 * preinstall logger for private-package resolution (REQ-ARCH-37). Reports which source will back
 * `@rhema/evals` for this install. The ACTUAL rewiring happens in `.pnpmfile.cjs` (read automatically
 * by pnpm); this script only surfaces the decision and must never fail the install — hence the
 * defensive try/catch and unconditional exit 0.
 *
 * NOTE (2026-09-01, amended 2026-11-03): `@rhema/protocols` is a COMMITTED workspace member
 * (`packages/protocols`) that ships PUBLIC (operator ruling 2026-11-02, R6OSS.1) — it is not
 * path-resolved, and `packages/protocols-stub` is a dormant fallback, not an export swap. Only
 * `@rhema/evals` is still path-resolved (RHEMA_EVALS_PATH → `evals-stub`).
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveProtocols } from "./lib/protocols-resolver.mjs";

const probe = (p) => existsSync(resolve(p, "package.json"));

try {
  const root = process.cwd();
  const evals = resolveProtocols({
    privatePath: process.env.RHEMA_EVALS_PATH,
    stubPath: resolve(root, "evals-stub"),
    exists: probe,
  });
  console.log(`[rhema] @rhema/evals -> ${evals.source} (${evals.path})`);
  if (evals.source === "stub") {
    console.log(
      "[rhema] Building @rhema/evals with the public stub (set RHEMA_EVALS_PATH for the private checkout).",
    );
  }
} catch (err) {
  console.warn("[rhema] resolve-protocols logger skipped:", err?.message ?? err);
}
process.exit(0);
