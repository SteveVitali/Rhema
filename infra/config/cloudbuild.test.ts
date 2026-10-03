import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// OPS.2 (BL-27; REQ-ARCH-39) — the ONE committed, parameterized image-set build definition.
// STB.2b/4 hand-edited gitignored `integration/.scratch/cloudbuild-*.yaml` copies for every
// subset rebuild; this test pins the committed definition so the drift cannot return:
//   * `infra/cloudbuild/image-set.yaml` exists and is the ONLY image-set definition (no root
//     cloudbuild.yaml, no second file to drift against).
//   * its canonical service set (the `_SERVICES` default AND the in-script whitelist) equals
//     the deployed image set derived from `apps/*/Dockerfile` — a new Dockerfile without a
//     canonical entry (or a stale entry without a Dockerfile) fails.
//   * GIT_SHA is baked only into api/web (the /healthz provenance consumers).
//   * `PROD-BRINGUP.md` never references `integration/.scratch/` — the runbook must name the
//     committed definition (the ticket's deterministic half of this AC).

const ROOT = join(__dirname, "..", "..");
const DEF = join(ROOT, "infra", "cloudbuild", "image-set.yaml");
const yaml = readFileSync(DEF, "utf8");

/** `apps/<svc>/Dockerfile` basenames — the on-disk image set. */
function dockerfileSet(): string[] {
  return readdirSync(join(ROOT, "apps"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ROOT, "apps", d.name, "Dockerfile")))
    .map((d) => d.name)
    .sort();
}

describe("the committed image-set definition (OPS.2; BL-27)", () => {
  it("is the single canonical definition — no root cloudbuild.yaml to drift against", () => {
    expect(existsSync(DEF)).toBe(true);
    expect(existsSync(join(ROOT, "cloudbuild.yaml"))).toBe(false);
  });

  it("the _SERVICES default + in-script whitelist equal the apps/*/Dockerfile set", () => {
    const want = dockerfileSet();
    const def = yaml.match(/^\s+_SERVICES: (.+)$/m)?.[1].trim();
    expect(def?.split(",").sort(), "_SERVICES default").toEqual(want);
    const canonical = yaml.match(/canonical="([^"]+)"/)?.[1];
    expect(canonical?.split(" ").sort(), "script whitelist").toEqual(want);
  });

  it("bakes GIT_SHA into api/web only (the /healthz provenance consumers)", () => {
    expect(yaml).toMatch(/case "\$svc" in api\|web\) extra="--build-arg GIT_SHA=\$\{_GIT_SHA\}"/);
  });

  it("PROD-BRINGUP names the committed definition and never a scratch copy", () => {
    const runbook = readFileSync(join(ROOT, "infra", "PROD-BRINGUP.md"), "utf8");
    expect(runbook).toContain("infra/cloudbuild/image-set.yaml");
    expect(runbook, "runbook must not reference gitignored scratch helpers").not.toContain(
      "integration/.scratch",
    );
  });

  it("keeps the fat-runner options (E2_HIGHCPU_8 + 100GB) the full-set build needs", () => {
    expect(yaml).toContain("machineType: E2_HIGHCPU_8");
    expect(yaml).toContain("diskSizeGb: 100");
  });
});
