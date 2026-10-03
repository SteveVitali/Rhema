// privsep-ns-body.js — the INSIDE-NAMESPACE half of the production-image privsep self-test (SEC.3;
// privsep.docker.test.ts → privsep-check.js execs this as the tail of the REAL launch chain:
//   setpriv (harness, ambient caps) → unshare --mount --propagation private → setpriv --reuid 0 →
//   node /app/dist/privsep-ns-body.js <spec.json>
// It applies the serialized mount plan through the SAME `applyMountPlan` the scoped runner runs, then
// drops to the DISTINCT scoped uid (production's --no-new-privs drop) and probes the namespace:
//   • the scoped root contains exactly the enumerated file(s) — and nothing else;
//   • the scoped uid can Read the enumerated file;
//   • an out-of-set read fails at the KERNEL (the file does not exist in this namespace);
//   • a write to the ro-bound file fails at the kernel (the boundary's true zero).
// Prints PASS lines the outer check greps for; exits non-zero on any violation. Runs at ruid 0 —
// trusted setup code only, exactly like scoped-runner.js before its own uid drop.

import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { applyMountPlan, SETPRIV_BIN, type ScopedRunnerIo, type ScopedRunnerSpecFile } from "./scoped-runner.js";

const realIo: ScopedRunnerIo = {
  readFile: (p) => readFileSync(p, "utf8"),
  mkdir: (p) => void mkdirSync(p, { recursive: true }),
  writeFile: (p, d) => void writeFileSync(p, d),
  chmod: (p, m) => void chmodSync(p, m),
  copyFile: (a, b) => void copyFileSync(a, b),
  execFile: (f, a) => void execFileSync(f, [...a], { stdio: ["ignore", "inherit", "inherit"] }),
  spawn: (f, a, env) => spawnSync(f, [...a], { env, stdio: "inherit" }).status ?? 1,
  env: process.env,
  nodeBin: process.execPath,
};

function fail(msg: string): never {
  console.error(`NSFAIL: ${msg}`);
  process.exit(21);
}

/** execFileSync that returns the exit code instead of throwing. */
function run(file: string, args: string[]): number {
  try {
    execFileSync(file, args, { stdio: "inherit" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

export function main(): void {
  const specPath = process.argv[2];
  if (!specPath) fail("usage: privsep-ns-body.js <spec.json>");
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as ScopedRunnerSpecFile;
  const { rootDir } = spec.mountPlan;

  applyMountPlan(spec, realIo);

  // the scoped root must contain EXACTLY the enumerated file(s) — the kernel-level input scope.
  const listing = readdirSync(rootDir).sort();
  const want = spec.mountPlan.binds.map((b) => basename(b.dest)).sort();
  if (JSON.stringify(listing) !== JSON.stringify(want)) {
    fail(`scoped root listing [${listing.join(",")}] != enumerated [${want.join(",")}]`);
  }

  // drop to the DISTINCT scoped uid with --no-new-privs — the SAME drop the runner performs — and probe:
  // read the enumerated file; an out-of-set path must not exist; the ro bind must refuse a write.
  const enumerated = `${rootDir}/${want[0]}`;
  const probe = [
    `const fs=require("node:fs");`,
    `fs.readFileSync(${JSON.stringify(enumerated)});`,
    `if(fs.existsSync("/work/project/agents/author/notebook.md")){console.error("out-of-set file VISIBLE");process.exit(23)}`,
    `try{fs.writeFileSync(${JSON.stringify(enumerated)},"x");console.error("WROTE ro bind");process.exit(24)}`,
    `catch(e){if(e.code!=="EROFS"&&e.code!=="EACCES"){console.error("write err "+e.code);process.exit(25)}}`,
    `process.exit(0)`,
  ].join("");
  const rc = run(SETPRIV_BIN, [
    "--reuid", String(spec.uid), "--regid", String(spec.uid), "--clear-groups", "--no-new-privs",
    "--", process.execPath, "-e", probe,
  ]);
  if (rc === 23) fail("scoped uid READ an out-of-namespace file");
  if (rc === 24) fail("scoped uid WROTE the read-only bind (the boundary is not a kernel zero)");
  if (rc === 25) fail("scoped uid write failed with an unexpected errno");
  if (rc !== 0) fail(`scoped uid could not read the enumerated file (rc=${rc})`);

  console.log("AC4: scoped mount namespace contains exactly the enumerated file; out-of-set read fails at the kernel");
  console.log("AC4: scoped uid cannot write the read-only bind (EROFS) — the boundary is a kernel zero");
}

const invokedAs = process.argv[1] ?? "";
if (invokedAs.endsWith("privsep-ns-body.js") || invokedAs.endsWith("privsep-ns-body.ts")) {
  main();
}
