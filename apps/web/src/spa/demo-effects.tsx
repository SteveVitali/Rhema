// R7DEM.5 (REQ-DWEB-7, REQ-DWEB-13; R3 §4 mechanism) — the demo layout's two client duties:
//
//   1. THE WRITE BACKSTOP — one capture-phase `submit` listener on the document intercepts
//      every `method="post"` form the withhold pass missed (R3 §4: "before the surface-level
//      delegated handlers" — editor.tsx/dossier.tsx/run-report.tsx listen on React's bubble
//      root and bail on `e.defaultPrevented`). The answer is the ONE honest notice
//      (`data-demo-readonly-notice`), never a silent drop and never a 405 round-trip; the
//      server's 405 stays defence-in-depth.
//   2. THE LAZY TOUR SEAM (REQ-DWEB-13) — the tour module is a dynamic `import()` boundary
//      owned here (a layout module, NOT a route file — tree.test.ts forbids `import()` in
//      routes). 222 fills `demo-tour.ts`; until then the import resolves a stub and the
//      boundary is the thing under test (the tour's bytes stay out of the entry graph).

import { useEffect, useRef, type ReactNode } from "react";
import { COPY } from "../copy.js";

/**
 * Mount the demo write backstop + the lazy tour seam. Rendered once per demo document by
 * `IdeProjectLayout` (chrome.tsx) — framed and unframed demo leaves alike. A submit on ANY
 * post form is prevented and the single notice reveals itself; nothing else changes.
 */
export function DemoEffects(): ReactNode {
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // The lazy tour seam — the boundary now, the module at 222. `import()` lives here so the
    // emitted chunk splits off the entry graph under `otherAsyncGzipBytes` (REQ-DWEB-13).
    void import("./demo-tour.js").then((m) => m.mountDemoTour()).catch(() => undefined);

    const onSubmit = (e: Event): void => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      if ((form.getAttribute("method") ?? "get").toLowerCase() !== "post") return;
      e.preventDefault();
      e.stopPropagation();
      const notice = noticeRef.current;
      if (notice) {
        notice.hidden = false;
        if (timerRef.current != null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          notice.hidden = true;
        }, 6000);
      }
    };
    document.addEventListener("submit", onSubmit, { capture: true });
    return () => {
      document.removeEventListener("submit", onSubmit, { capture: true });
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      ref={noticeRef}
      role="note"
      data-demo-readonly-notice="true"
      hidden
      style={{
        border: "1px solid var(--shell-border)",
        borderRadius: "10px",
        padding: "8px 14px",
        margin: "0 0 12px",
        background: "var(--shell-raised)",
        fontSize: "13px",
      }}
    >
      {COPY.demo.submitReadonlyNotice}
    </div>
  );
}
