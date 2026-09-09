import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHarnessSecrets, assertHarnessOnly, NON_OWNER_PERMISSION_MASK } from "./secrets.js";

// The harness-only secrets file (REQ-SPEC-10; AC1 file leg). A file with any group/other read bit — a mode
// slip that would hand the model's uid the token — is refused. The in-image proof that uid `agent` actually
// gets EACCES on this file is the integration test in DEFERRALS; here we prove the permission gate + parse.

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "rhema-secrets-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const payload = JSON.stringify({ runToken: "jwt.abc", apiInternalUrl: "http://api.internal", proxyCredential: "cred.xyz" });

describe("readHarnessSecrets (REQ-SPEC-10)", () => {
  it("reads a 0600 file and returns the three secrets", () => {
    const p = join(tmp(), "secrets.json");
    writeFileSync(p, payload);
    chmodSync(p, 0o600);
    const s = readHarnessSecrets(p);
    expect(s.runToken).toBe("jwt.abc");
    expect(s.apiInternalUrl).toBe("http://api.internal");
    expect(s.proxyCredential).toBe("cred.xyz");
  });

  it("refuses a world-readable file (mode slip)", () => {
    const p = join(tmp(), "secrets.json");
    writeFileSync(p, payload);
    chmodSync(p, 0o644);
    expect(() => readHarnessSecrets(p)).toThrow(/readable only by harness/);
  });

  it("refuses a group-readable file", () => {
    const p = join(tmp(), "secrets.json");
    writeFileSync(p, payload);
    chmodSync(p, 0o640);
    expect(() => readHarnessSecrets(p)).toThrow(/readable only by harness/);
  });

  it("refuses a file missing a required secret", () => {
    const p = join(tmp(), "secrets.json");
    writeFileSync(p, JSON.stringify({ runToken: "x" }));
    chmodSync(p, 0o600);
    expect(() => readHarnessSecrets(p)).toThrow(/missing/);
  });
});

describe("assertHarnessOnly", () => {
  it("passes 0600 and 0400", () => {
    expect(() => assertHarnessOnly({ mode: 0o600, uid: 1000 })).not.toThrow();
    expect(() => assertHarnessOnly({ mode: 0o400, uid: 1000 })).not.toThrow();
  });
  it("fails when the owner does not match the expected harness uid", () => {
    expect(() => assertHarnessOnly({ mode: 0o600, uid: 1001 }, 1000)).toThrow(/owned by the harness uid/);
  });
  it("the non-owner mask covers every group and other bit", () => {
    expect(NON_OWNER_PERMISSION_MASK).toBe(0o077);
  });
});
