import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FilesPane, type FilesPaneLabels, type FileRowView } from "./files-pane.js";
import { uiTailCss } from "./ui-tail-css.js";

// 326_R7UX.3 (BL-94) — the Files panel polish: a readable single-line row, the lock Badge only
// where a lock is meaningful, provenance collapsed to a truncated in-line span + title hook,
// `data-kind-icon` per kind, and the `ui-t-frow` interactive (hover/focus-within) class.

const LABELS: FilesPaneLabels = {
  heading: "Files",
  sectionLabel: (key) => key,
  provenanceLabel: (p) =>
    p.actor === "you"
      ? "You"
      : p.runId
        ? `${p.seat ?? "System"} · ${p.workflow ?? ""} run · ${p.phase ?? ""}`
        : "System",
  lockTitle: (lock) =>
    ({ editable: "Editable", immutable: "Immutable", inspect: "Inspect only" })[lock] ?? lock,
  lockBadge: (lock) =>
    ({ editable: "Working", immutable: "Frozen", inspect: "Inspect only" })[lock] ?? lock,
  freshnessLabel: (n, stale) => (stale ? `describes v${n} — since edited` : `describes v${n}`),
  sealedFmt: (n) => `${n} sealed`,
  advancedDisclosure: "Advanced",
  empty: "Nothing here yet.",
  wordsFmt: (n) => `${n} words`,
  readOnlyNote: "Read-only — agent memory.",
};

const HREFS = {
  artifact: (id: string) => `/a/${id}`,
  draft: (n: number) => `/v/${n}`,
  run: (id: string) => `/r/${id}`,
  figure: (id: string) => `/fig/${id}`,
};

function row(
  partial: Partial<FileRowView> & Pick<FileRowView, "artifactId" | "kind">,
): FileRowView {
  return {
    label: partial.artifactId,
    level: "SE",
    editMode: "read",
    lock: "editable",
    readOnly: false,
    words: null,
    createdAt: null,
    provenance: { actor: "you" },
    ...partial,
  };
}

function render(rows: FileRowView[], advancedRows: FileRowView[] = []): string {
  return renderToStaticMarkup(
    <FilesPane
      sections={[{ key: "drafts", rows, advancedRows, sealedCount: 0 }]}
      hrefs={HREFS}
      labels={LABELS}
    />,
  );
}

/** The rendered markup for one `data-file-row` (the <li> … </li> slice). */
function rowMarkup(html: string, artifactId: string): string {
  const start = html.indexOf(`data-file-row="${artifactId}"`);
  expect(start, artifactId).toBeGreaterThan(-1);
  const liStart = html.lastIndexOf("<li", start);
  const end = html.indexOf("</li>", start);
  return html.slice(liStart, end);
}

describe("326_R7UX.3 (BL-94) — Files panel polish", () => {
  it("the lock Badge renders ONLY where a lock is meaningful — never on an ordinary draft", () => {
    const html = render([
      row({ artifactId: "d1", kind: "draft", draftRef: { n: 1, state: "working" } }),
      row({
        artifactId: "d2",
        kind: "draft",
        lock: "immutable",
        draftRef: { n: 2, state: "frozen" },
      }),
      // the demo/read-only shape: editMode "none" ⇒ lock immutable + readOnly.
      row({ artifactId: "m1", kind: "claim_ledger", lock: "immutable", readOnly: true }),
      row({ artifactId: "s1", kind: "source_note", lock: "inspect" }),
    ]);
    // an ordinary working draft carries NO lock affordance.
    expect(rowMarkup(html, "d1")).not.toContain("data-lock-badge");
    // frozen draft, read-only/demo row, and inspect-only row keep theirs.
    expect(rowMarkup(html, "d2")).toContain('data-lock-badge="immutable"');
    expect(rowMarkup(html, "m1")).toContain('data-lock-badge="immutable"');
    expect(rowMarkup(html, "m1")).toContain('data-readonly="1"');
    expect(rowMarkup(html, "s1")).toContain('data-lock-badge="inspect"');
  });

  it("provenance is collapsed — an in-line truncated span on the row line plus the title hook", () => {
    const html = render([
      row({
        artifactId: "r1",
        kind: "round",
        lock: "immutable",
        provenance: {
          actor: "agent",
          runId: "run_9",
          seat: "Drafter",
          workflow: "Review",
          phase: "Verification",
        },
      }),
      row({ artifactId: "d1", kind: "draft", draftRef: { n: 1, state: "working" } }),
    ]);
    const r1 = rowMarkup(html, "r1");
    // one line: the provenance span rides the row's flex line — never a display:block element.
    const prov = r1.match(/<span[^>]*data-provenance[^>]*>/)![0];
    expect(prov).toContain("ui-t-frow-prov");
    expect(prov).not.toContain("display: block");
    expect(prov).not.toContain("ui-t-pl20");
    // the run-link navigation is preserved inside it.
    expect(prov).toContain('data-run="run_9"');
    expect(r1).toContain('href="/r/run_9"');
    // …and the full provenance also sits behind the anchor's title (tooltip) hook.
    const link = r1.match(/<a[^>]*data-file-link[^>]*>/)![0];
    expect(link).toContain('title="Drafter · Review run · Verification"');
    // the non-run row collapses the same way.
    const d1 = rowMarkup(html, "d1");
    const d1Prov = d1.match(/<span[^>]*data-provenance[^>]*>/)![0];
    expect(d1Prov).toContain("ui-t-frow-prov");
    expect(d1Prov).not.toContain("display: block");
  });

  it("emits one `data-kind-icon` hook per file kind", () => {
    const html = render(
      ["draft", "outline", "figure", "voice", "research", "round"].map((kind, i) =>
        row({ artifactId: `a${i}`, kind }),
      ),
    );
    for (const kind of ["draft", "outline", "figure", "voice", "research", "round"]) {
      expect(html, kind).toContain(`data-kind-icon="${kind}"`);
    }
  });

  it("rows carry the `ui-t-frow` interactive class and its hover/focus affordance ships", () => {
    const html = render([row({ artifactId: "d1", kind: "draft" })]);
    expect(html).toContain('class="ui-t-frow"');
    const css = uiTailCss();
    expect(css).toContain(
      ".ui-t-frow:hover, .ui-t-frow:focus-within { background: var(--shell-raised); }",
    );
    expect(css).toContain("text-decoration: underline");
    // the readable type scale — the row line resolves to the dense step, not the 11–12 px micro band.
    expect(css).toMatch(/\.ui-t-frow \{[^}]*font-size: var\(--fs-dense\)/);
    // the collapsed provenance truncates on the same line.
    expect(css).toMatch(/\.ui-t-frow-prov \{[^}]*text-overflow: ellipsis[^}]*white-space: nowrap/);
  });

  it("keeps the treeitem/keyboard contract + the freshness sub-line", () => {
    const html = render([
      row({ artifactId: "d1", kind: "draft", draftRef: { n: 3, state: "working" } }),
      row({
        artifactId: "c1",
        kind: "claim_ledger",
        freshness: { subjectDraftN: 3, stale: true },
      }),
    ]);
    const d1 = rowMarkup(html, "d1");
    expect(d1).toContain('role="treeitem"');
    expect(d1).toContain('tabindex="0"'); // roving tab stop on the first row
    expect(d1).toContain("v3");
    const c1 = rowMarkup(html, "c1");
    expect(c1).toContain('role="treeitem"');
    expect(c1).toContain('tabindex="-1"');
    const fresh = c1.match(/<span[^>]*data-freshness[^>]*>/)![0];
    expect(fresh).toContain("ui-t-frow-sub");
    expect(c1).toContain("describes v3 — since edited");
  });
});
