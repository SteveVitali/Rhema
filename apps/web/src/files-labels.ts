// The FilesPane label bag — pages.tsx's `filesLabels` verbatim, extracted (SPA.14, the
// ApprovalSettingsSection precedent): the SSR pages AND the onboarding SPA surface render the
// same composition, so both import the ONE bag from `COPY.files`.

import { type FilesPaneLabels } from "@rhema/ui";
import { COPY } from "./copy.js";

/** Replace `{key}` placeholders in a copy template with string/number values. */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

const FP = COPY.files;

export const filesLabels: FilesPaneLabels = {
  heading: FP.heading,
  sectionLabel: (key) => FP.sectionLabel[key] ?? key,
  provenanceLabel: (p) =>
    p.actor === "you"
      ? FP.provenanceYou
      : p.runId
        ? fmt(FP.provenanceRunFmt, {
            seat: p.seat ?? FP.provenanceSystem,
            workflow: p.workflow ?? "",
            phase: p.phase ?? "",
          })
        : FP.provenanceSystem,
  lockTitle: (lock) => FP.lockTitle[lock] ?? lock,
  lockBadge: (lock) => FP.lockBadge[lock] ?? lock,
  freshnessLabel: (n, stale) => fmt(stale ? FP.freshnessStaleFmt : FP.freshnessFmt, { n }),
  sealedFmt: (n) => fmt(FP.sealedFmt, { n }),
  advancedDisclosure: FP.advanced,
  empty: FP.empty,
  wordsFmt: (n) => fmt(FP.wordsFmt, { n }),
  readOnlyNote: FP.readOnlyNote,
};
