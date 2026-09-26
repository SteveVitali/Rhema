import { createContext, useContext } from "react";
import type { ProjectRowView } from "@rhema/ui";

// Per-request data the SSR route handler resolves (project list, login form state, the resolved project) and
// hands to the page tree through React context. Pages read it with `usePageData()`.

export interface PageData {
  readonly projects?: readonly ProjectRowView[];
  readonly login?: {
    readonly error?: string;
    readonly sent?: boolean;
    readonly code?: string;
    readonly email?: string;
  };
  readonly project?: { readonly title: string; readonly pill: string; readonly slug: string };
  readonly conversion?: {
    readonly projectSlug: string;
    readonly sourceLabel: string;
    readonly sourceText: string;
    readonly convertedMarkdown: string;
    readonly countLine: string;
    readonly warnings: readonly { readonly message: string; readonly blockId?: string | null }[];
    readonly created?: boolean;
  };
}

export const PageDataContext = createContext<PageData>({});
export function usePageData(): PageData {
  return useContext(PageDataContext);
}
