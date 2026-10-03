// privsep-check.js — the KERNEL-LEVEL proof of AC1 + AC4 + D-P0.15f-1 + SEC.3, run INSIDE the
// production distroless image (the vitest leg launches `docker run … --entrypoint /nodejs/bin/node
// <image> /app/dist/privsep-check.js`; §12.6, REQ-SPEC-10). TypeScript port of docker/privsep-check.sh
// — the shell is gone, so every probe is `node -e` or the shipped static applets. It runs as ROOT
// under the pod's exact cap set (the docker run drops ALL and re-adds the four the pod carries).
//
// Legs (each prints PASS/FAIL; non-zero exit on any failure):
//   AC1        — a process under uid `agent` is denied the harness-only secrets file (0600, owner harness).
//   D-P0.15f-1 — the harness (uid 10001, ambient CAP_SETUID+SETGID) drops to agent uid 10002 with no
//                setresgid EPERM; the dropped agent is still denied the file; the drop FAILS without
//                CAP_SETGID (negative control); and FAILS under --no-new-privs (ADR-076 — proves the
//                ambient-cap model needs allowPrivilegeEscalation: true).
//   F-SEC3-2   — the agent's production drop (real buildAgentLaunch argv) strips ambient+inheritable
//                caps and pins no-new-privs: CapEff=CapAmb=CapInh=0 and a setuid-back attempt fails,
//                so the model's process holds no kernel path back to the harness uid/token.
//   AC4        — the REAL launch chain (harness+ambient → unshare --mount --propagation private →
//                setpriv --reuid 0 → privsep-ns-body.js) applies the REAL buildScopedLaunchSpec mount
//                plan: the scoped root holds exactly the enumerated file, an out-of-set read fails at
//                the kernel, and the ro bind refuses a write (the boundary's true zero). Plus the
//                ruid-0 negative control (F-StageB-6): harness-uid `mount` is refused outright.
//   P0.15h     — a read-only bind mount blocks a write even by uid agent (kernel backstop).
//   SEC.3      — the image shape itself: no shell, no package manager, the four vendored applets are
//                static (no PT_INTERP — parsed from the ELF headers, the in-image equivalent of the
//                toolsmith readelf assert), and /etc/passwd + /etc/group carry uids 10001–10006.
//
// Distroless means NO /bin/sh, no ls/cat/id — all probing is node -e or the three applets.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildScopedLaunchSpec } from "@rhema/engine";
import { buildAgentLaunch } from "./bootstrap.js";

const SETPRIV = "/usr/bin/setpriv";
const UNSHARE = "/usr/bin/unshare";
const MOUNT = "/usr/bin/mount";
const NODE = "/nodejs/bin/node";
const NS_BODY = "/app/dist/privsep-ns-body.js";

const HARNESS = 10001;
const AGENT = 10002;
const HARNESS_AMBIENT = "-all,+setuid,+setgid,+sys_admin,+sys_chroot";

let failures = 0;
function pass(msg: string): void {
  console.log(`PASS: ${msg}`);
}
function bad(msg: string): void {
  console.log(`FAIL: ${msg}`);
  failures += 1;
}
/** returns the exit code of the exec'd argv. */
function run(file: string, args: readonly string[]): number {
  try {
    execFileSync(file, [...args], { stdio: ["ignore", "inherit", "inherit"] });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}
function check(name: string, fn: () => boolean): void {
  if (fn()) pass(name);
  else bad(name);
}
const dropTo = (uid: number, child: readonly string[]) => [
  "--reuid", String(uid), "--regid", String(uid), "--clear-groups", "--", ...child,
];
// The agent drop exercises the REAL `buildAgentLaunch` tuple (F-SEC3-2: uid drop + group clear +
// ambient/inheritable clear + no-new-privs), not a re-typed copy — same discipline as the AC4 leg's
// `buildScopedLaunchSpec`. `.argv` already carries the absolute setpriv path and the `--` separator.
const agentDropArgv = (child: readonly string[]) =>
  buildAgentLaunch({
    runId: "privsep-selftest", proxyBaseUrl: "http://127.0.0.1:1", configDir: "/work/.config",
    agentUid: AGENT, agentGid: AGENT, cwd: "/work/project", command: child,
  }).argv;
/** exec the production agent-drop tuple; returns the child's exit code. */
const agentDrop = (child: readonly string[]): number => {
  const argv = agentDropArgv(child);
  return run(argv[0]!, argv.slice(1));
};
/** node -e probe that reads (or writes) a path; exit 0 on success. */
const READ_PROBE = (p: string) => [NODE, "-e", `require("node:fs").readFileSync(${JSON.stringify(p)})`];

// ---------- AC1 — the harness-only secrets file (0600, owner harness) ----------
// /tmp mirrors the pod's writable emptyDir; created AS harness (umask 077) — the real pod's cap set
// drops CAP_CHOWN so root could not chown there either. The AC is the 0600-owner semantics.
const SECRETS = "/tmp/secrets/secrets.json";
run(SETPRIV, dropTo(HARNESS, [
  NODE, "-e",
  `const fs=require("node:fs");fs.mkdirSync("/tmp/secrets",{recursive:true});process.umask(0o077);` +
    `fs.writeFileSync(${JSON.stringify(SECRETS)},'{"runToken":"jwt.X","proxyCredential":"cred.X"}')`,
]));
check("AC1: harness reads the secrets file", () => run(SETPRIV, dropTo(HARNESS, READ_PROBE(SECRETS))) === 0);
check("AC1: uid agent (production drop tuple) is denied the harness secrets file (EACCES)", () =>
  agentDrop(READ_PROBE(SECRETS)) !== 0);

// ---------- D-P0.15f-1 — the harness→agent setpriv drop (the two-uid launch) ----------
// The entrypoint drops root→harness retaining ambient SETUID+SETGID (+SYS_ADMIN,+SYS_CHROOT); the
// harness then setprivs to agent. Without ambient CAP_SETGID the --regid setresgid EPERMs — the exact
// P0.15f bug; the negative control proves the +setgid entry is load-bearing.
// F-SEC3-1 (live): no --bounding-set — the pod's CapBnd is already exactly the add list, and
// CAPBSET_DROP needs CAP_SETPCAP the pod deliberately lacks; inh+ambient alone carry the model.
const harnessDrop = (capset: string, child: readonly string[], extra: readonly string[] = []) =>
  run(SETPRIV, [
    "--reuid", String(HARNESS), "--regid", String(HARNESS), "--clear-groups",
    "--inh-caps", capset, "--ambient-caps", capset, ...extra,
    "--", ...agentDropArgv(child),
  ]);
check(
  "D-P0.15f-1: harness (ambient CAP_SETUID+SETGID) drops to agent uid 10002 (no setresgid EPERM)",
  () => harnessDrop(HARNESS_AMBIENT, [NODE, "-e", `if(process.getuid()!==${AGENT}||process.getgid()!==${AGENT})process.exit(1)`]) === 0,
);
check(
  "D-P0.15f-1: agent (via the harness drop) is denied the harness secrets file (EACCES)",
  () => harnessDrop(HARNESS_AMBIENT, READ_PROBE(SECRETS)) !== 0,
);
check(
  "D-P0.15f-1: without CAP_SETGID the harness→agent --regid drop fails as expected (setresgid EPERM)",
  () => harnessDrop("-all,+setuid,+sys_admin", [NODE, "-e", "process.exit(0)"]) !== 0,
);
// SEC.3 / ADR-076 — the nnp leg: ambient caps SURVIVE execve under no_new_privs (verified live:
// CapAmb intact with NoNewPrivs=1 — nnp gates file-cap/setuid escalation at exec, not the ambient
// raise, which is a prctl). The ambient-cap launch therefore does not depend on
// allowPrivilegeEscalation; the flag stays `true` explicitly because k8s makes it a no-op under
// CAP_SYS_ADMIN regardless — the model's process still carries --no-new-privs from its own drop.
check(
  "SEC.3: the ambient-cap drop survives exec under no_new_privs (ambient is not exec-granted — ADR-076)",
  () =>
    harnessDrop(HARNESS_AMBIENT, [
      NODE, "-e", `if(process.getuid()!==${AGENT})process.exit(1)`,
    ], ["--no-new-privs"]) === 0,
);
// F-SEC3-2 — the agent must carry NO capability vector. Ambient caps survive execve of unmarked
// binaries, so without the production tuple's explicit `-all` clears the model's process would
// inherit the harness's ambient CAP_SETUID — a kernel-level path back to uid 10001 and the
// harness token. The nnp pin makes the empty set unregainable for the agent's whole subtree.
const CAPS_PROBE =
  `const l=require("node:fs").readFileSync("/proc/self/status","utf8").split("\\n");` +
  `const f=(k)=>parseInt(l.find(x=>x.startsWith(k+":")).split(/\\s+/)[1],16);` +
  `const n=l.find(x=>x.startsWith("NoNewPrivs:")).split(/\\s+/)[1];` +
  `process.exit(f("CapEff")===0&&f("CapAmb")===0&&f("CapInh")===0&&n==="1"?0:1)`;
check(
  "F-SEC3-2: the agent's production drop leaves CapEff=CapAmb=CapInh=0 and NoNewPrivs=1",
  () => harnessDrop(HARNESS_AMBIENT, [NODE, "-e", CAPS_PROBE]) === 0,
);
check(
  "F-SEC3-2: the dropped agent cannot setuid back to harness uid 10001 (no CAP_SETUID — the uid boundary holds at the kernel)",
  () =>
    harnessDrop(HARNESS_AMBIENT, [
      SETPRIV, "--reuid", String(HARNESS), "--regid", String(HARNESS), "--", NODE, "-e", "process.exit(0)",
    ]) !== 0,
);

// ---------- AC4 — the input-scoped mount namespace, through the REAL launch chain ----------
// a seat tree the scoped query must NOT see in full: the enumerated draft + an un-enumerated notebook.
mkdirSync("/work/project/drafts", { recursive: true });
mkdirSync("/work/project/agents/author", { recursive: true });
writeFileSync("/work/project/drafts/v3.md", "THE DRAFT v3");
writeFileSync("/work/project/agents/author/notebook.md", "DRAFTER PRIVATE NOTEBOOK");

// F-StageB-6 negative control: harness-uid `mount` refuses even WITH ambient CAP_SYS_ADMIN (the
// getuid() gate — the ruid-0 wrap below is load-bearing).
check(
  "AC4: harness-uid mount is refused without the ruid-0 wrap (must be superuser — ruid gate)",
  () =>
    run(SETPRIV, [
      "--reuid", String(HARNESS), "--regid", String(HARNESS), "--clear-groups",
      "--inh-caps", HARNESS_AMBIENT, "--ambient-caps", HARNESS_AMBIENT,
      "--", UNSHARE, "--mount", "--propagation", "private", "--",
      MOUNT, "-t", "tmpfs", "-o", "size=1m", "tmpfs", "/work",
    ]) !== 0,
);

// The REAL plan: buildScopedLaunchSpec generates the mount argv privsep-ns-body applies — the kernel
// legs exercise the production tuples, not a re-typed copy. uid = agentUid + 1 (second-reader) = 10003.
const spec = buildScopedLaunchSpec({
  role: "second-reader",
  inputs: { draft: "/work/project/drafts/v3.md" },
  agentUid: AGENT,
  producerQueryId: "privsep-selftest",
  stashDir: "/tmp/scoped-stash/second-reader",
});
const SPEC_PATH = "/tmp/scoped-spec.json";
writeFileSync(SPEC_PATH, JSON.stringify(spec));
check(
  "AC4: scoped mount namespace isolates the seat tree (real launch chain + real mount plan)",
  () =>
    run(SETPRIV, [
      "--reuid", String(HARNESS), "--regid", String(HARNESS), "--clear-groups",
      "--inh-caps", HARNESS_AMBIENT, "--ambient-caps", HARNESS_AMBIENT,
      "--", UNSHARE, "--mount", "--propagation", "private", "--",
      SETPRIV, "--reuid", "0", "--regid", "0", "--clear-groups", "--",
      NODE, NS_BODY, SPEC_PATH,
    ]) === 0,
);

// ---------- P0.15h — a read-only bind mount BLOCKS a write at the kernel (boundary true zero) ----------
mkdirSync("/work/ro-src", { recursive: true });
writeFileSync("/work/ro-src/00-piece-brief.md", "READ ONLY CORRESPONDENCE");
mkdirSync("/work/ro-mnt", { recursive: true });
run(MOUNT, ["--bind", "/work/ro-src", "/work/ro-mnt"]);
run(MOUNT, ["-o", "remount,ro,bind", "/work/ro-mnt"]); // MS_RDONLY on the bind
check(
  "P0.15h: uid agent cannot write a read-only bind mount (EROFS) — the boundary is a true zero at the kernel",
  () =>
    agentDrop([NODE, "-e", `require("node:fs").writeFileSync("/work/ro-mnt/00-piece-brief.md","x")`]) !== 0,
);
// no umount applet is vendored — the bind dies with the container; nothing to clean up.

// ---------- SEC.3 — the distroless image shape ----------
check("SEC.3: the image has no shell", () =>
  !["/bin/sh", "/bin/bash", "/bin/dash", "/usr/bin/sh", "/usr/bin/bash"].some(existsSync));
check("SEC.3: the image has no package manager", () =>
  !["/usr/bin/apt-get", "/usr/bin/apt", "/usr/bin/dpkg", "/sbin/apk", "/usr/bin/rpm", "/usr/bin/dnf"].some(existsSync));

// a vendored applet must be fully static: ELF64 program headers carry NO PT_INTERP segment (the
// in-image equivalent of the toolsmith's `readelf -l | grep INTERP` assert — a dynamic binary would
// die here anyway since the runtime's only loader serves node itself, but the header check is exact).
function isStaticElf(path: string): boolean {
  const b = readFileSync(path);
  if (b.length < 0x40 || b.readUInt32LE(0) !== 0x464c457f || b[4] !== 2) return false; // !ELF64
  const phoff = Number(b.readBigUInt64LE(0x20));
  const entsz = b.readUInt16LE(0x36);
  const phnum = b.readUInt16LE(0x38);
  for (let i = 0; i < phnum; i++) {
    if (b.readUInt32LE(phoff + i * entsz) === 3) return false; // PT_INTERP present → dynamic
  }
  return true;
}
for (const applet of [SETPRIV, UNSHARE, MOUNT, "/usr/bin/dumb-init"]) {
  check(`SEC.3: ${applet} is a static binary (no PT_INTERP)`, () => existsSync(applet) && isStaticElf(applet));
}
check("SEC.3: the shipped applets execute (setpriv/unshare/mount --version)", () =>
  run(SETPRIV, ["--version"]) === 0 && run(UNSHARE, ["--version"]) === 0 && run(MOUNT, ["--version"]) === 0);

// the static identity files carry every uid the two-uid + scoped launch uses (F-StageB-7).
check("SEC.3: /etc/passwd + /etc/group carry uids 10001–10006", () => {
  const passwd = readFileSync("/etc/passwd", "utf8");
  const group = readFileSync("/etc/group", "utf8");
  return [10001, 10002, 10003, 10004, 10005, 10006].every(
    (u) => new RegExp(`:${u}:${u}:`).test(passwd) && new RegExp(`:${u}:`).test(group),
  );
});

// when the docker run mirrors the pod's readOnlyRootFilesystem, prove the rootfs refuses writes.
if (process.env.PRIVSEP_EXPECT_RO_ROOTFS === "1") {
  check("SEC.3: the root filesystem is read-only (write outside the tmpfs mounts fails EROFS)", () => {
    try {
      writeFileSync("/ro-rootfs-probe", "x");
      return false;
    } catch {
      return true;
    }
  });
}

console.log("----");
if (failures === 0) {
  console.log("ALL PRIVSEP CHECKS PASSED");
  process.exit(0);
}
console.log(`PRIVSEP CHECKS FAILED (${failures})`);
process.exit(1);
