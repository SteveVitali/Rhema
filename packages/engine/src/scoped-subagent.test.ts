import { describe, it, expect } from "vitest";
import {
  enumerateScopedFiles,
  buildScopedLaunchSpec,
  type ScopedInputs,
} from "./scoped-subagent.js";

// Input-scoped subagents (REQ-DATA-17/18; §12.6; AC4 logic leg). The launch SPEC must enumerate EXACTLY the
// role's files, bind each read-only into a private tmpfs, assign a distinct uid, set tools:["Read"], and wrap
// the runner in `unshare --mount`. The kernel-enforcement leg (a Read outside the set fails at the kernel) is
// the in-image integration test recorded in DEFERRALS.

const inputs: ScopedInputs = {
  draft: "/work/project/drafts/v3.md",
  commissioningBrief: "/work/project/agents/author/00-commissioning-brief.md",
  structurePlan: "/work/project/agents/author/02-structure-plan.md",
  claimLedger: "/work/project/agents/author/03-claim-ledger.md",
  voiceBrief: "/work/project/agents/author/01-voice-brief.md",
  outline: "/work/project/agents/author/outline.md",
  letterAndDossier: ["/work/project/correspondence/v3-review-1/editors-letter.md", "/work/project/correspondence/v3-review-1/findings.json"],
  guidance: "/work/project/agents/editor/guidance.md",
  responseLedger: "/work/project/agents/author/ledgers/v3-response-ledger.md",
  vN: "/work/project/drafts/v3.md",
  vNext: "/work/project/drafts/v4.md",
  profileFiles: ["/work/personas/p1/profile/index.md", "/work/personas/p1/profile/voice-print.md"],
};

describe("enumerateScopedFiles (§12.6)", () => {
  it("second-reader receives ONLY the draft", () => {
    expect(enumerateScopedFiles("second-reader", inputs)).toEqual(["/work/project/drafts/v3.md"]);
  });

  it("fidelity-auditor receives the draft + commissioning inputs (no letter, no dossier)", () => {
    expect(enumerateScopedFiles("fidelity-auditor", inputs)).toEqual([
      "/work/project/drafts/v3.md",
      "/work/project/agents/author/00-commissioning-brief.md",
      "/work/project/agents/author/02-structure-plan.md",
      "/work/project/agents/author/03-claim-ledger.md",
      "/work/project/agents/author/01-voice-brief.md",
      "/work/project/agents/author/outline.md",
    ]);
  });

  it("gap-analyst receives the letter + dossier, guidance, response ledger, vN and v(N+1)", () => {
    expect(enumerateScopedFiles("gap-analyst", inputs)).toEqual([
      "/work/project/correspondence/v3-review-1/editors-letter.md",
      "/work/project/correspondence/v3-review-1/findings.json",
      "/work/project/agents/editor/guidance.md",
      "/work/project/agents/author/ledgers/v3-response-ledger.md",
      "/work/project/drafts/v3.md",
      "/work/project/drafts/v4.md",
    ]);
  });

  it("holdout-calibrator receives the profile files (hold-out URL is a fetch concern, not a mount)", () => {
    expect(enumerateScopedFiles("holdout-calibrator", inputs)).toEqual([
      "/work/personas/p1/profile/index.md",
      "/work/personas/p1/profile/voice-print.md",
    ]);
  });

  it("drops absent inputs (a review with no outline)", () => {
    const { outline: _drop, ...noOutline } = inputs;
    void _drop;
    expect(enumerateScopedFiles("fidelity-auditor", noOutline)).not.toContain(inputs.outline);
  });
});

describe("buildScopedLaunchSpec (§12.6)", () => {
  const spec = buildScopedLaunchSpec({ role: "second-reader", inputs, agentUid: 10000, producerQueryId: "q_abc" });

  it("stashes each enumerated file OUTSIDE the overmount, then ro-binds it into the scoped root", () => {
    expect(spec.files).toEqual(["/work/project/drafts/v3.md"]);
    // 1) stash outside /work so the overmount does not hide it:
    expect(spec.mountPlan.stashBinds).toHaveLength(1);
    expect(spec.mountPlan.stashBinds[0].source).toBe("/work/project/drafts/v3.md");
    expect(spec.mountPlan.stashBinds[0].dest).toBe("/run/scoped-stash/second-reader/v3.md");
    expect(spec.mountPlan.stashBinds[0].argv).toEqual(["mount", "--bind", "-o", "ro", "/work/project/drafts/v3.md", "/run/scoped-stash/second-reader/v3.md"]);
    // 3) bind the stash into the scoped root, read-only:
    expect(spec.mountPlan.binds).toHaveLength(1);
    expect(spec.mountPlan.binds[0].source).toBe("/run/scoped-stash/second-reader/v3.md");
    expect(spec.mountPlan.binds[0].dest).toBe("/work/scoped/second-reader/v3.md");
    expect(spec.mountPlan.binds[0].argv).toEqual(["mount", "--bind", "-o", "ro", "/run/scoped-stash/second-reader/v3.md", "/work/scoped/second-reader/v3.md"]);
  });

  it("overmounts the seat tree so other-seat files vanish at the kernel (2) — tmpfs is rw for mountpoint creation", () => {
    // the tmpfs is mounted rw (mountpoints must be creatable); the enumerated files are bound read-only.
    expect(spec.mountPlan.overmountDir).toBe("/work");
    expect(spec.mountPlan.tmpfsArgv).toEqual(["mount", "-t", "tmpfs", "-o", "nosuid,nodev,size=64m", "tmpfs", "/work"]);
    expect(spec.mountPlan.tmpfsArgv).not.toContain("ro,nosuid,nodev,size=64m");
  });

  it("assigns a distinct uid (never the agent's)", () => {
    expect(spec.uid).toBe(10001);
    expect(spec.uid).not.toBe(10000);
  });

  it("grants tools: ['Read'] and no Bash", () => {
    expect(spec.tools).toEqual(["Read"]);
  });

  it("wraps the runner in a NEW private mount namespace (unshare --mount)", () => {
    expect(spec.unshareArgv.slice(0, 4)).toEqual(["unshare", "--mount", "--propagation", "private"]);
    expect(spec.unshareArgv).toContain("--");
  });

  it("re-escalates the runner to real uid 0 inside the namespace (mount gates on getuid, not ambient caps)", () => {
    // util-linux `mount` refuses any ruid≠0 caller ("must be superuser") before mount(2) — the harness's
    // ambient CAP_SYS_ADMIN never reaches it. The runner must exec through `setpriv --reuid 0`; the model
    // still drops to the scoped uid in scoped-runner.sh.
    const i = spec.unshareArgv.indexOf("--", 4);
    expect(spec.unshareArgv.slice(i + 1)).toEqual([
      "/usr/bin/setpriv",
      "--reuid",
      "0",
      "--regid",
      "0",
      "--clear-groups",
      "--",
      "/usr/local/bin/rhema-scoped-runner",
    ]);
  });

  it("records the producerQueryId (§12.2 F17 producer check)", () => {
    expect(spec.producerQueryId).toBe("q_abc");
  });

  it("gives each scoped role its own distinct uid", () => {
    const uids = (["second-reader", "fidelity-auditor", "gap-analyst", "holdout-calibrator"] as const).map(
      (role) => buildScopedLaunchSpec({ role, inputs, agentUid: 10000, producerQueryId: "q" }).uid,
    );
    expect(new Set(uids).size).toBe(4);
  });

  it("refuses to launch a scoped query with no files", () => {
    expect(() => buildScopedLaunchSpec({ role: "second-reader", inputs: {}, agentUid: 10000, producerQueryId: "q" })).toThrow(/no enumerated files/);
  });
});

describe("holdout-calibrator fetcher gating (§12.6)", () => {
  const profileOnly: ScopedInputs = { profileFiles: ["/work/personas/p1/profile/index.md"], holdoutUrl: "https://holdout.example/x" };

  it("does NOT grant WebFetch before the prediction file is written", () => {
    const spec = buildScopedLaunchSpec({ role: "holdout-calibrator", inputs: { ...profileOnly, predictionFileWritten: false }, agentUid: 10000, producerQueryId: "q" });
    expect(spec.tools).toEqual(["Read"]);
  });

  it("grants WebFetch (client fetcher) ONLY after the prediction file exists", () => {
    const spec = buildScopedLaunchSpec({ role: "holdout-calibrator", inputs: { ...profileOnly, predictionFileWritten: true }, agentUid: 10000, producerQueryId: "q" });
    expect(spec.tools).toEqual(["Read", "WebFetch"]);
  });
});
