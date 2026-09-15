// @rhema/ui — presentational React primitives for the beta flat shell (REQ-BETA-21 stopgap #2). Text-agnostic:
// every user-facing string is a prop, so the vocabulary lint lives over the app's copy table, not here. The
// full IDE design system (panes, tokens-as-components) is P1.01.

export const PACKAGE_NAME = "@rhema/ui" as const;

export { Pill, Chip, FetchedUrlChip, ActionLink, severityColor } from "./primitives.js";
export type { Tone, Severity } from "./primitives.js";
export { Shell, SectionTitle } from "./shell.js";
export { ProjectList, ProjectRow } from "./project-list.js";
export type { ProjectRowView } from "./project-list.js";
export { ConversionPreview, ConversionNotesCard } from "./conversion.js";
export type { ConversionPreviewProps, PreviewWarning } from "./conversion.js";
export { DossierView, honorsContradictedTierOneRule } from "./dossier.js";
export type {
  DossierViewProps,
  DossierClaim,
  DossierFinding,
  DossierSource,
  DossierLabels,
} from "./dossier.js";
