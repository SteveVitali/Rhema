// @rhema/engine — input-scoped subagent launch specs (REQ-DATA-17/18; REQ-ARCH-19 amended; §12.6, ledger G18).
//
// Isolation is not enough: the second read must receive ONLY the draft. The ORCHESTRATOR — not the parent
// model — launches these as separate `query()` calls in a PRIVATE MOUNT NAMESPACE (`unshare -m` + a tmpfs
// holding only the enumerated files) under a DISTINCT uid, with `tools: ["Read"]` and no Bash. "The second
// read received the draft only" is then a statement about the kernel, not the model (review 13 F13): a Read
// outside the enumerated set fails at the kernel because the file is not in the namespace at all — the hook
// is belt-and-braces on top. Each scoped query's id is recorded as `producerQueryId` on what it writes, and
// at delivery the dossier is refused if `05-second-read.md`'s producer is not the orchestrator-launched
// scoped query (§12.2 F17).
//
// This module builds the launch SPEC as data (enumerated files → ro bind mounts → `unshare` argv). run-task
// executes it against the real kernel; the deterministic test asserts the spec (exact file set, distinct uid,
// ro binds, tools). The kernel-enforcement leg of the AC is the in-image integration test (see DEFERRALS).

/** The four input-scoped roles (§12.6). `researcher` is NOT here — it fans out in-query, inheriting mounts. */
export type ScopedRole = "second-reader" | "fidelity-auditor" | "gap-analyst" | "holdout-calibrator";

/**
 * The resolved absolute mirror paths a run can feed a scoped subagent. Each role enumerates a subset (§12.6);
 * absent inputs are dropped (e.g. a review with no outline). Paths are absolute (already materialized).
 */
export interface ScopedInputs {
  draft?: string;
  commissioningBrief?: string;
  structurePlan?: string;
  claimLedger?: string;
  voiceBrief?: string;
  outline?: string;
  /** the Editor's letter + dossier files (gap-analyst). */
  letterAndDossier?: readonly string[];
  guidance?: string;
  responseLedger?: string;
  vN?: string;
  vNext?: string;
  /** the persona `profile/*` files (holdout-calibrator). */
  profileFiles?: readonly string[];
  /** the hold-out URL — allowed to the calibrator ONLY after the prediction file is written (§12.6). */
  holdoutUrl?: string;
  predictionFileWritten?: boolean;
}

/** Enumerate exactly the files a scoped role may read (§12.6). Order is stable; absent inputs are dropped. */
export function enumerateScopedFiles(role: ScopedRole, inputs: ScopedInputs): string[] {
  const keep = (...xs: (string | undefined)[]): string[] => xs.filter((x): x is string => !!x);
  switch (role) {
    case "second-reader":
      return keep(inputs.draft);
    case "fidelity-auditor":
      return keep(
        inputs.draft,
        inputs.commissioningBrief,
        inputs.structurePlan,
        inputs.claimLedger,
        inputs.voiceBrief,
        inputs.outline,
      );
    case "gap-analyst":
      return keep(...(inputs.letterAndDossier ?? []), inputs.guidance, inputs.responseLedger, inputs.vN, inputs.vNext);
    case "holdout-calibrator":
      return keep(...(inputs.profileFiles ?? []));
  }
}

/** A single read-only bind mount of an enumerated file into the private tmpfs namespace. */
export interface ScopedBind {
  readonly source: string;
  readonly dest: string;
  /** `mount --bind -o ro <source> <dest>` (applied inside the unshared namespace). */
  readonly argv: readonly string[];
}

export interface ScopedMountPlan {
  /** the scoped root the query reads from (holds ONLY the enumerated files after setup). */
  readonly rootDir: string;
  /**
   * the seat tree overmounted with a FRESH tmpfs so every other-seat file vanishes from this namespace at the
   * kernel — the isolation `unshare -m` alone does NOT give (a `-m` namespace is a copy of all parent mounts;
   * without this overmount the scoped uid could still `Read` `/work/project/agents/<other-seat>/…` by absolute
   * path — review 13 F13). Default `/work`.
   */
  readonly overmountDir: string;
  /** a stash OUTSIDE `overmountDir` where the enumerated files are ro-bound BEFORE the overmount hides them. */
  readonly stashDir: string;
  /** `mount -t tmpfs …` over `overmountDir` (mounted rw so mountpoints can be created; the binds are ro). */
  readonly tmpfsArgv: readonly string[];
  /** ro bind of each enumerated source → `stashDir/<name>`, run BEFORE the overmount (so it survives it). */
  readonly stashBinds: readonly ScopedBind[];
  /** ro bind of each `stashDir/<name>` → `rootDir/<name>`, run AFTER the overmount. */
  readonly binds: readonly ScopedBind[];
}

export interface ScopedLaunchSpec {
  readonly role: ScopedRole;
  readonly agentLabel: string;
  /** a uid distinct from `agent` (§12.6). */
  readonly uid: number;
  /** the enumerated absolute source files (exactly these — the kernel sees nothing else). */
  readonly files: readonly string[];
  /** `["Read"]`, plus `WebFetch` (client `fetcher` only) for the calibrator once its prediction file exists. */
  readonly tools: readonly string[];
  readonly mountPlan: ScopedMountPlan;
  /**
   * `unshare --mount --propagation private -- setpriv --reuid 0 --regid 0 --clear-groups -- <runner…>` —
   * a NEW mount namespace for this query (§12.6). The `setpriv` re-escalation to REAL uid 0 is
   * load-bearing: util-linux `mount` gates on `getuid()` before calling mount(2), so the harness's ambient
   * CAP_SYS_ADMIN is invisible to it (and the binary's setuid bit only fixes the EFFECTIVE uid — ruid stays
   * harness's and `mount` exits "must be superuser"). The runner must therefore run with ruid 0; the
   * harness holds ambient CAP_SETUID so `setpriv --reuid 0` succeeds. scoped-runner.js still drops to the
   * distinct scoped uid with --no-new-privs before the model's process execs — the MODEL's privilege is
   * unchanged; only the trusted setup runner carries ruid 0.
   */
  readonly unshareArgv: readonly string[];
  /** recorded on the artifact version the scoped query writes (§12.2/§12.6). */
  readonly producerQueryId: string;
}

export interface BuildScopedInput {
  readonly role: ScopedRole;
  readonly inputs: ScopedInputs;
  /** the `agent` uid; the scoped query gets `agentUid + roleOffset` (distinct — §12.6). */
  readonly agentUid: number;
  /** a stable id for `producerQueryId` (the orchestrator mints it). */
  readonly producerQueryId: string;
  /** where to root the scoped read tree (default `/work/scoped/<role>`). */
  readonly rootDir?: string;
  /** the seat tree overmounted to hide other-seat files (default `/work`). */
  readonly overmountDir?: string;
  /** the stash dir outside `overmountDir` (default `/run/scoped-stash/<role>`). */
  readonly stashDir?: string;
  /** the runner argv executed inside the namespace after the mounts (the scoped `query()` launcher). */
  readonly runnerArgv?: readonly string[];
}

/** Distinct-uid offsets per role (each scoped query gets its own uid, never `agent`'s — §12.6). */
const ROLE_UID_OFFSET: Record<ScopedRole, number> = {
  "second-reader": 1,
  "fidelity-auditor": 2,
  "gap-analyst": 3,
  "holdout-calibrator": 4,
};

/** Basename of a path (for the tmpfs destination). Kept dependency-free. */
function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

/**
 * Build the launch spec for one input-scoped subagent (§12.6). Enumerates exactly the role's files, plans a
 * read-only bind of each into a private tmpfs, assigns a distinct uid, sets `tools: ["Read"]` (the calibrator
 * additionally gets `WebFetch` via the client `fetcher`, and ONLY once its prediction file is written), and
 * wraps the runner in `unshare --mount`. Throws if the enumerated set is empty (a scoped query with nothing
 * to read is a bug, not an empty valid launch).
 */
export function buildScopedLaunchSpec(input: BuildScopedInput): ScopedLaunchSpec {
  const { role, inputs } = input;
  const files = enumerateScopedFiles(role, inputs);
  if (files.length === 0) {
    throw new Error(`input-scoped ${role} has no enumerated files — refusing to launch (§12.6)`);
  }
  const agentLabel = role;
  const rootDir = input.rootDir ?? `/work/scoped/${role}`;
  const overmountDir = input.overmountDir ?? "/work";
  const stashDir = input.stashDir ?? `/run/scoped-stash/${role}`;
  const uid = input.agentUid + ROLE_UID_OFFSET[role];

  // dedupe names so two same-named files don't collide in the flat scoped root.
  const seen = new Map<string, number>();
  const stashBinds: ScopedBind[] = [];
  const binds: ScopedBind[] = [];
  for (const source of files) {
    const base = basename(source);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const name = n === 0 ? base : `${n}-${base}`;
    const stashPath = `${stashDir}/${name}`;
    const dest = `${rootDir}/${name}`;
    // 1) stash the enumerated file OUTSIDE the overmount target, ro, before it is hidden.
    stashBinds.push({ source, dest: stashPath, argv: ["mount", "--bind", "-o", "ro", source, stashPath] });
    // 2) after the overmount, ro-bind the stash into the scoped root.
    binds.push({ source: stashPath, dest, argv: ["mount", "--bind", "-o", "ro", stashPath, dest] });
  }

  const mountPlan: ScopedMountPlan = {
    rootDir,
    overmountDir,
    stashDir,
    // a size-capped, nodev/nosuid tmpfs OVER the seat tree — mounted rw so mountpoints can be created; the
    // enumerated files themselves are bound read-only, so the scoped uid gets read-only file access.
    tmpfsArgv: ["mount", "-t", "tmpfs", "-o", "nosuid,nodev,size=64m", "tmpfs", overmountDir],
    stashBinds,
    binds,
  };

  const tools: string[] = ["Read"];
  // the calibrator alone may fetch the hold-out — via the client `fetcher` — and only after prediction (§12.6).
  const allowFetcher =
    role === "holdout-calibrator" && !!inputs.holdoutUrl && inputs.predictionFileWritten === true;
  if (allowFetcher) tools.push("WebFetch");

  const runnerArgv = input.runnerArgv ?? ["/usr/local/bin/rhema-scoped-runner"];
  // See the `unshareArgv` doc: the runner needs REAL uid 0 for the mount(2) calls (`mount` refuses any
  // non-ruid-0 caller outright — ambient capabilities do not reach it). `--clear-groups` keeps the root
  // re-escalation's group set minimal; the runner's own setpriv drop re-establishes the scoped uid/gid.
  const unshareArgv = [
    "unshare",
    "--mount",
    "--propagation",
    "private",
    "--",
    "/usr/bin/setpriv",
    "--reuid",
    "0",
    "--regid",
    "0",
    "--clear-groups",
    "--",
    ...runnerArgv,
  ];

  return {
    role,
    agentLabel,
    uid,
    files,
    tools,
    mountPlan,
    unshareArgv,
    producerQueryId: input.producerQueryId,
  };
}
