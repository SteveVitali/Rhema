import { describe, expect, it } from "vitest";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { lintCopy } from "@rhema/contracts";
import type { EditorDocDto, ProjectRow, VersionRailDto } from "@rhema/api-client";
import { convertProject, canonicalJson, readConvertOverrides } from "../convert/index.js";
import { projectEssay } from "./project.js";
import {
  registerDocumentKinds,
  registerSnapshotKind,
  registeredKinds,
  validateSnapshot,
  snapshotEnvelopes,
  indexViolations,
  resolveViolations,
  envelopeViolations,
} from "./harness.js";
import { registerRunKinds, readFacts } from "./replay.js";
import { ENVELOPE_BYTES, type EssayIndex, type SnapshotFile } from "./model.js";

// REQ-DOPS-4 + S-6/S-8/S-11/S-12 (real half) — the 218/218a projector + contract/drift harness,
// unchanged, over the four REAL projects (219_R7DATA.1, post-HUMAN-H14). Input: the committed
// real `corpus/<slug>/` + `overrides/<slug>/convert-overrides.json`; conversion runs through the
// same convertProject the 217 harness uses. Committed output: `snapshots/<slug>/` + the shared
// `snapshots/projects.json` row file. Regenerate with
// `RHEMA_REGEN_SNAPSHOTS=1 pnpm exec vitest run …project/real.test.ts`.

const PKG = fileURLToPath(new URL("../../", import.meta.url));
const CORPUS = join(PKG, "corpus");
const OVERRIDES = join(PKG, "overrides");
const SNAPSHOTS = join(PKG, "snapshots");
const REGEN = process.env.RHEMA_REGEN_SNAPSHOTS === "1";

const SLUGS = [
  "the-politics-of-visibility",
  "structure-of-political-difference",
  "constitution-of-reason",
  "the-governable-mind",
] as const;

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const manifest = JSON.parse(readFileSync(join(CORPUS, "export-manifest.json"), "utf8")) as {
  exportDate: string;
};
const provenance = readFileSync(join(CORPUS, "PROVENANCE.md"), "utf8");
const allFacts = readFacts(readFileSync(join(CORPUS, "_rules/facts.json"), "utf8")).slugs ?? {};

function corpusFiles(slug: string): Map<string, string> {
  const root = join(CORPUS, slug);
  const files = new Map<string, string>();
  for (const p of walk(root))
    files.set(relative(root, p).replace(/\\/g, "/"), readFileSync(p, "utf8"));
  return files;
}

function projected(slug: string) {
  const files = corpusFiles(slug);
  const ov = readConvertOverrides(
    JSON.parse(readFileSync(join(OVERRIDES, slug, "convert-overrides.json"), "utf8")),
  );
  if (!ov.ok) throw new Error(`${slug}: convert-overrides.json failed to parse`);
  const convert = convertProject({ files, overrides: ov.value });
  if (!convert.ok) throw new Error(`${slug}: ${JSON.stringify(convert.diagnostics)}`);
  const result = projectEssay({
    essay: slug,
    files,
    convert,
    exportDate: manifest.exportDate,
    provenance,
    facts: allFacts[slug],
  });
  return { result, convert, files };
}

registerDocumentKinds();
registerRunKinds();

const rows: ProjectRow[] = [];

for (const slug of SLUGS) {
  describe(`real corpus → snapshot: ${slug} (REQ-DOPS-4, S-12)`, () => {
    const { result, convert, files } = projected(slug);
    rows.push(result.row);
    const outputs = result.outputs;
    const index = JSON.parse(outputs.get("index.json")!) as EssayIndex;

    it("emits the version rail over every versions.json version incl. Published where present", () => {
      const rail = JSON.parse(outputs.get("versions.json")!) as SnapshotFile & {
        dto: VersionRailDto;
      };
      const versions = JSON.parse(files.get("versions.json")!) as {
        versions: { version: string }[];
        published?: { file: string };
      };
      expect(rail.dto.drafts.map((d) => d.draftId)).toEqual(
        versions.versions.map((v) => v.version).concat(versions.published ? ["published"] : []),
      );
      expect(indexViolations(index, outputs)).toEqual([]);
      expect(resolveViolations(index)).toEqual([]);
    });

    it("every emitted snapshot validates against its registered kind", () => {
      for (const { env: e } of snapshotEnvelopes(outputs)) {
        expect(envelopeViolations(e), `${e.kind} ${e.key}`).toEqual([]);
        expect(validateSnapshot(e), `${e.kind} ${e.key}`).toEqual([]);
      }
      expect(registeredKinds().length).toBeGreaterThan(5);
      // a new kind registers without editing the harness core (218a's seam), on real kinds too
      registerSnapshotKind(`real-test-card-${slug}`, () => []);
      expect(registeredKinds()).toContain(`real-test-card-${slug}`);
    });

    it("no snapshot exceeds its one artifact plus the declared envelope", () => {
      const body = (p: string): number => (files.get(p) ?? "").length;
      const versions = JSON.parse(files.get("versions.json")!) as {
        versions: { version: string }[];
        published?: { file: string };
      };
      // draft Ns on the rail: the versions array order plus a published head when present.
      const draftIds = versions.versions
        .map((v) => v.version)
        .concat(versions.published ? ["published"] : []);
      const fileForId = (id: string): string =>
        id === "published" ? "published.md" : `drafts/${id}.md`;
      function carriedBytes(rel: string, e: SnapshotFile): number {
        switch (e.kind) {
          case "editor-doc": {
            const roundDir = `correspondence/${e.key}-review`;
            return (
              body(fileForId(e.key)) +
              (convert.outputs.get(`${roundDir}/findings.json`)?.length ?? 0) +
              (convert.outputs.get(`${roundDir}/labels.json`)?.length ?? 0)
            );
          }
          case "artifact-page":
            // the page carries its own markdown, a per-block `blockIdMap` derived index
            // (proportional to the body), and the sidecar bytes emitted for the same dossier
            // dir (a fidelity-audit page embeds its draft-ledger rows, etc.)
            return (
              Math.ceil(body(e.key) * 1.5) +
              [...convert.outputs.keys()]
                .filter((k) => k.startsWith(`${e.key.slice(0, e.key.lastIndexOf("/"))}/`))
                .reduce((n, k) => n + (convert.outputs.get(k)?.length ?? 0), 0)
            );
          case "dossier": {
            const dir = `correspondence/${e.key}`;
            return (
              [...files.keys()]
                .filter((p) => p.startsWith(`${dir}/`))
                .reduce((n, p) => n + body(p), 0) +
              [...convert.outputs.keys()]
                .filter(
                  (k) =>
                    k.startsWith(`${dir}/`) ||
                    k.endsWith(`${e.key.split("-")[0]}-response-ledger.json`),
                )
                .reduce((n, k) => n + (convert.outputs.get(k)?.length ?? 0), 0)
            );
          }
          case "run-report":
            return (
              convert.outputs.get(`correspondence/${e.key}/01-claim-ledger.json`)?.length ?? 0
            );
          case "timeline":
          case "card-facts":
            return body("index.json") + body("versions.json");
          case "figure-image":
            return 0;
          case "version-diff": {
            const [n, m] = e.key.split(":").map(Number);
            const beforePath = fileForId(draftIds[n - 1]!);
            const afterPath = fileForId(draftIds[m - 1]!);
            const art =
              convert.outputs.get(
                `what-changed/${draftIds[n - 1]}-${draftIds[m - 1]}.json`,
              ) ?? "";
            // the DTO re-renders the pair's text ~3× (beforeBlocks, afterBlocks, hunk payloads
            // inside `view`) — a 4× proportional bound still fails a whole third artifact
            return (body(beforePath) + body(afterPath) + art.length) * 4;
          }
          case "what-changed": {
            const [f, t] = e.key.split("-");
            const art = convert.outputs.get(`what-changed/${e.key}.json`) ?? "";
            // moves/findings/hunk payloads re-render the artifact's diff content once more
            return (
              art.length * 2 +
              body(f === "published" ? "published.md" : `drafts/${f}.md`) +
              body(t === "published" ? "published.md" : `drafts/${t}.md`)
            );
          }
          case "versions":
          case "files":
            return body("index.json") + body("versions.json");
          case "projects":
            return body("versions.json");
          default:
            return 0;
        }
      }
      for (const { path, env: e } of snapshotEnvelopes(outputs)) {
        const bytes = outputs.get(path)!;
        const envelope = ENVELOPE_BYTES[e.kind as keyof typeof ENVELOPE_BYTES] ?? 0;
        expect(
          bytes.length,
          `${path} (${bytes.length} > ${carriedBytes(path, e)} + ${envelope})`,
        ).toBeLessThanOrEqual(carriedBytes(path, e) + envelope);
      }
      // the hard REQ-CORPUS-9 point: no artifact page carries a second artifact's bytes
      for (const { env: e } of snapshotEnvelopes(outputs))
        if (e.kind === "artifact-page")
          expect((e.dto as EditorDocDto).markdown).toBe(files.get(e.key));
    });

    it("generated labels + markers pass lintCopy (AC5 vocabulary)", () => {
      const entries: [string, string][] = [];
      for (const { env: e } of snapshotEnvelopes(outputs)) {
        const demo = (
          e.dto as { demo?: { importRule?: Record<string, string>; roles?: Record<string, string> } }
        ).demo;
        for (const [k, v] of Object.entries(demo?.importRule ?? {}))
          entries.push([`importRule.${k}`, v]);
        for (const [k, v] of Object.entries(demo?.roles ?? {})) entries.push([`roles.${k}`, v]);
      }
      expect(entries.length).toBeGreaterThan(0);
      expect(lintCopy(entries)).toEqual([]);
    });

    it("the project row is keyed by the essay slug — never a demo~ marker", () => {
      const row = result.row satisfies ProjectRow;
      expect(row.slug).toBe(slug);
      expect(JSON.stringify(row)).not.toContain("demo~");
    });

    it("re-projection is byte-identical to the committed real snapshots (drift)", () => {
      const dir = join(SNAPSHOTS, slug);
      if (REGEN) {
        for (const [rel, bytes] of outputs) {
          const dest = join(dir, rel);
          mkdirSync(dirname(dest), { recursive: true });
          writeFileSync(dest, bytes);
        }
        return;
      }
      const committed = [...walk(dir)].map((p) => relative(dir, p).replace(/\\/g, "/")).sort();
      const emitted = [...outputs.keys()].sort();
      expect(emitted).toEqual(committed);
      for (const rel of emitted)
        expect(outputs.get(rel), `snapshot ${rel} byte-equality`).toBe(
          readFileSync(join(dir, rel), "utf8"),
        );
    });
  });
}

describe("real snapshots: S-6/S-8 project-scoped checks", () => {
  it("SPD v1→v2 version-diff carries the natively linked hunks (M2 → F1; new §III); leftovers Unlinked", () => {
    const { result } = projected("structure-of-political-difference");
    const d = JSON.parse(result.outputs.get("diffs/1-2.json")!) as SnapshotFile;
    const view = (
      d.dto as {
        view: {
          moves: { moveId: string; hunks: { id: string }[] }[];
          unlinked: { hunks: string[] };
        };
      }
    ).view;
    expect(view.moves.length).toBeGreaterThan(0);
    const m2 = view.moves.find((m) => m.moveId === "M2");
    expect(m2, "M2 linked").toBeTruthy();
    expect(m2!.hunks.length).toBeGreaterThan(0);
    expect(view.unlinked.hunks.length).toBeGreaterThan(0);
  });

  it("GM v2's converted claim ledger satisfies assertShowcaseFixture on real data (S-6)", async () => {
    const { assertShowcaseFixture } = await import("@rhema/contracts");
    const convertSidecar = JSON.parse(
      readFileSync(
        join(PKG, "goldens/the-governable-mind/correspondence/v2-review/01-claim-ledger.json"),
        "utf8",
      ),
    );
    expect(() =>
      assertShowcaseFixture({ claims: convertSidecar.claims }, "GM v2 snapshot claims"),
    ).not.toThrow();
  });
});

describe("snapshots/projects.json (shared index over the four real rows)", () => {
  it("carries exactly the four real project rows in corpus order", () => {
    const expected = canonicalJson({
      format: 1,
      kind: "projects",
      essay: "*",
      key: "projects",
      dto: rows,
    });
    const dest = join(SNAPSHOTS, "projects.json");
    if (REGEN) {
      mkdirSync(SNAPSHOTS, { recursive: true });
      writeFileSync(dest, expected);
      return;
    }
    expect(readFileSync(dest, "utf8")).toBe(expected);
    expect(JSON.parse(expected).dto.map((r: ProjectRow) => r.slug)).toEqual(SLUGS);
  });
});
