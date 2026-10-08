// SPA.9 — the IDE chrome data seam (design/25 §5.1; REQ-SEQ-12). In SSR every `/p/:p…` handler
// assembles an `ide` prop bag (`ideContext` in server.ts) that `IdeFrame` threads to `IdeShell`.
// In the SPA the bag arrives bottom-up: an IDE-framed leaf publishes a memoized `IdeChromeData`
// slice through `useIdeChromeData`, the `p.$project` layout merges it onto `<IdeShell>`, and the
// chrome stays mounted across leaves — the contract shape is the same one the island consumed.
//
// Nothing server-rendered crosses the seam: pane bodies (`filesBody`, `chatBody`, `marginBody`,
// `deskFindingsBody`) arrive as ReactNode built by the surface's own React components; the feed
// carries raw rows + the same-origin events URL (the label maps arrive through `feedLabelsQuery`,
// never an embed). `palette` is the typed `PaletteData` — the JSON embed is re-serialized only so
// `data-palette` stays emitted (REQ-TST-2 attr parity).

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { FeedRow, IdeShellProps, RunCardLabels, TimelineHrefs, TimelineLabels, TimelineViewWire } from "@rhema/ui";
import type { PaletteData } from "@rhema/ide";

/** The Desk feed slice — `labelMaps`/`labels` are chrome-owned (COPY + `["feed-labels"]` query). */
export interface IdeChromeFeed {
  readonly runId: string;
  readonly eventsUrl: string;
  readonly density: "summary" | "details" | "verbose";
  readonly rows: readonly FeedRow[];
  /** the highest replayed seq — the SSE tail resumes at `?after=<lastSeq>`. */
  readonly lastSeq?: number;
}

/**
 * The prop bag an IDE-framed surface publishes. Field-for-field the SSR `PageData["ide"]` bag,
 * minus what the chrome derives itself (session `userId`, the theme/paper write URLs, the feed
 * label maps) — and plus the ReactNode bodies SSR passed as elements.
 */
export interface IdeChromeData {
  readonly projectId?: string;
  readonly projectTitle?: string;
  readonly projectPill?: string;
  readonly paperTheme?: IdeShellProps["paperTheme"];
  readonly appTheme?: IdeShellProps["appTheme"];
  /** ?focus=1's seeded view — the leaf passes `"focus"`; the chrome applies then strips. */
  readonly initialView?: IdeShellProps["initialView"];
  readonly sourceHref?: string;
  readonly filesBody?: ReactNode;
  readonly findings?: NonNullable<IdeShellProps["findings"]>;
  readonly marginBody?: ReactNode;
  readonly deskFindingsBody?: ReactNode;
  readonly chatBody?: ReactNode;
  readonly timeline?: IdeShellProps["timeline"];
  readonly timelineView?: TimelineViewWire;
  readonly timelineLabels?: TimelineLabels;
  readonly timelineCardLabels?: RunCardLabels;
  readonly timelineHrefs?: TimelineHrefs;
  readonly renderGateCard?: IdeShellProps["renderGateCard"];
  readonly activeRun?: IdeShellProps["activeRun"];
  readonly feed?: IdeChromeFeed;
  readonly runNextHref?: string;
  /** the typed PaletteData — `data-palette` carries its JSON for attr parity. */
  readonly palette?: PaletteData;
  readonly paletteSearchUrl?: string;
  readonly inboxCount?: number;
  readonly status?: IdeShellProps["status"];
}

const EMPTY: IdeChromeData = {};

interface IdeChromeDataCtx {
  readonly data: IdeChromeData;
  /** false until a leaf's first publish lands — the controller's bind effect waits on it so the
   *  pane-storage identity (`projectId` arrives via publish, not the slug) is stable before any
   *  localStorage read/write. A leaf that never publishes leaves the chrome unbound. */
  readonly published: boolean;
  readonly set: (d: IdeChromeData) => void;
}

const IdeChromeDataContext = createContext<IdeChromeDataCtx>({
  data: EMPTY,
  published: false,
  set: () => undefined,
});

/** Mounts at the `p.$project` layout so every framed leaf can publish its chrome slice. */
export function IdeChromeDataProvider({ children }: { children?: ReactNode }): ReactNode {
  const [data, setData] = useState<IdeChromeData>(EMPTY);
  const [published, setPublished] = useState(false);
  const set = useMemo(
    () => (d: IdeChromeData) => {
      setPublished(true);
      setData(d);
    },
    [],
  );
  const value = useMemo(() => ({ data, published, set }), [data, published, set]);
  return <IdeChromeDataContext.Provider value={value}>{children}</IdeChromeDataContext.Provider>;
}

/**
 * A surface leaf publishes its chrome slice for as long as it is mounted. `data` MUST be a
 * memoized object (one useMemo over the leaf's loader data) — the effect is identity-keyed, and
 * the slice is whole-replace: unmount or a new memo clears/replaces the bag, never merges.
 */
export function useIdeChromeData(data: IdeChromeData): void {
  const { set } = useContext(IdeChromeDataContext);
  useEffect(() => {
    set(data);
    return () => set(EMPTY);
  }, [set, data]);
}

/** The layout's read side — the merged bag + the publish flag `IdeChrome` threads onto `<IdeShell>`. */
export function useIdeChromePublished(): { data: IdeChromeData; published: boolean } {
  const { data, published } = useContext(IdeChromeDataContext);
  return { data, published };
}
