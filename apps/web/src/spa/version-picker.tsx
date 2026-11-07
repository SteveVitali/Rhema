// R7SYNC.1 (REQ-SYNC-4; R5 G4) — the versions picker: a missing `/v/:n` (or a diff endpoint
// that names a missing draft) renders the project's EXISTING versions inside the shell instead
// of the bare "Not found / Go home". Gaps render as the record holds them: a discarded draft
// keeps its number with the `· discarded` marker (238's label); a number absent from the rail
// entirely gets the honest "isn't in this project" line — never an invented reason. The leaf
// publishes the versions twin's `ide` bag, so the Timeline tab shows the real round log here
// too (REQ-SYNC-3's one project-scoped source).

import { useQuery } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { COPY } from "../copy.js";
import { PageBody } from "./page-header.js";
import { projectVersionsQuery } from "./queries.js";
import { useShellChrome } from "./ide/chrome-data.js";

/**
 * R7SYNC.1 (REQ-SYNC-3; R5 G3) — publish the versions twin's `ide` bag for a leaf that renders
 * no surface of its own (the in-project 404, the picker's pre-data paint). The ONE
 * project-scoped chrome source — a degraded read lands nothing, never a fabricated bag.
 */
export function useProjectChromeFallback(slug: string | null): void {
  const q = useQuery({ ...projectVersionsQuery(slug ?? ""), enabled: slug != null });
  const twin = q.data;
  // Memoized — a fresh literal each render would re-publish the chrome bag on every commit.
  const shell = useMemo(
    () =>
      twin?.project != null
        ? {
            project: { title: twin.project.title, pill: twin.project.pill, slug: slug ?? "" },
            paperTheme: twin.paperTheme,
            ...(twin.appTheme != null ? { appTheme: twin.appTheme } : {}),
            ide: twin.ide,
          }
        : { project: { title: slug ?? "", pill: "", slug: slug ?? "" }, paperTheme: "light", ide: {} },
    [twin, slug],
  );
  useShellChrome(shell);
}

export function VersionPicker({
  slug,
  missing,
}: {
  readonly slug: string;
  /** the requested version token (`"7"` or `undefined` when the pair missed). */
  readonly missing?: string;
}): ReactNode {
  const q = useQuery(projectVersionsQuery(slug));
  const twin = q.data;
  // Publish the twin's chrome slice — the Timeline tab + status bar are real even on the
  // missing-version leaf (the picker IS an in-shell surface).
  useProjectChromeFallback(slug);
  const drafts = twin?.versions?.drafts ?? [];
  const missingN = missing != null ? Number(missing) : null;
  const missingDraft =
    missingN != null && Number.isFinite(missingN)
      ? drafts.find((d) => d.n === missingN)
      : undefined;
  return (
    <PageBody>
      <main data-spa-surface>
        <div data-version-picker>
          <h1>{COPY.versionPicker.heading}</h1>
          {missing != null ? (
            <p data-version-missing>
              {missingDraft?.state === "discarded"
                ? COPY.versionPicker.discardedFmt
    .replace("{n}", String(missingDraft.n))
                : COPY.versionPicker.missingFmt
    .replace("{n}", missing)}
            </p>
          ) : null}
          <ul data-version-list>
            {drafts.map((d) => (
              <li key={d.draftId} data-version-option={d.n}>
                <a href={`/p/${slug}/v/${d.n}`}>
                  v{d.n}
                  {d.state === "discarded" ? (
                    <span data-discarded> · {COPY.versions.discardedLabel}</span>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
          {q.isError ? <p className="ui-set-t--warn">{COPY.spaError.body}</p> : null}
          <p>
            <a href={`/p/${slug}`}>{COPY.versionPicker.backToPage}</a>
          </p>
        </div>
      </main>
    </PageBody>
  );
}
