import type { ProjectRow, ProjectStateDto } from "@rhema/api-client";
import type { ProjectRowView, Tone } from "@rhema/ui";

// Map the api's derived §6.3 state DTO onto the presentational row view. The pill/action come straight from
// the state function (no re-derivation, no stored status). In the beta's flat shell every primary action
// routes into the single project view; the full run sheet / letter routes arrive with later PRB tickets.

function tone(state: ProjectStateDto): Tone {
  if (state.overlay === "running") return "running";
  if (state.overlay === "needs_you") return "needs_you";
  switch (state.key) {
    case "reviewed":
    case "edited_by_you":
      return "attention";
    case "accepted":
    case "exported":
      return "ready";
    default:
      return "neutral";
  }
}

export function toProjectRowView(row: ProjectRow): ProjectRowView {
  const href = `/p/${row.slug}`;
  const label = row.state.suggested.label;
  const action = row.state.suggested.action !== "none" && label ? { label, href } : undefined;
  return {
    title: row.title,
    href,
    pill: { label: row.state.pill, tone: tone(row.state) },
    action,
  };
}
