import { describe, it, expect } from "vitest";
import { capSummary, identityLine } from "./identity.js";

// SEC.3 — the direct identity log line (D-P0.15f-1 / D-P1.22-2(a) caveats). The line must carry the real
// uid/gid and a cap-name summary — and never a secret, env value, or path content.

const STATUS_WITH_CAPS = [
  "Name:\tnode",
  "CapInh:\t00000000002400c0",
  "CapPrm:\t00000000002400c0",
  "CapEff:\t00000000002400c0", // setgid(6), setuid(7), sys_chroot(18), sys_admin(21)
  "CapBnd:\t00000000002400c0",
].join("\n");

describe("capSummary", () => {
  it("decodes the CapEff mask into cap names", () => {
    expect(capSummary(STATUS_WITH_CAPS)).toBe("setgid,setuid,sys_chroot,sys_admin");
  });
  it("reports none for an empty mask and unavailable when CapEff is absent/off-Linux", () => {
    expect(capSummary("Name:\tnode\nCapEff:\t0000000000000000")).toBe("none");
    expect(capSummary("Name:\tnode")).toBe("unavailable");
  });
});

describe("identityLine", () => {
  it("prints uid/euid/gid/egid + the cap summary — and nothing else", () => {
    const line = identityLine("harness", STATUS_WITH_CAPS);
    expect(line).toMatch(/^\[harness\] identity uid=\d+ euid=\d+ gid=\d+ egid=\d+ capEff=setgid,setuid,sys_chroot,sys_admin$/);
    // the line is ids + cap names only — no env value, path, or prompt text can ride it (inv 3/10).
    expect(line).not.toMatch(/=\/|token|credential|prompt|sk-/i);
  });
  it("agent-entry's label distinguishes the two processes in the pod log", () => {
    expect(identityLine("agent-entry", STATUS_WITH_CAPS)).toContain("[agent-entry] identity");
  });
});
