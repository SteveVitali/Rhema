import { SEAT_MOUNTS, type MountSpec } from "@rhema/hooks";
import { WORKFLOW_MANIFESTS, type WorkflowManifest } from "@rhema/protocols";
import type { AgentTypeKey, WorkflowKey } from "@rhema/contracts";

// The two-conduit rule (REQ-SPEC-15; §16.3 #7 — "verified, not just asserted"). Chat is ephemeral;
// Assistant source notes are durable but ASSISTANT-scoped. Chat output reaches a drafting pipeline by
// exactly two paths: (a) an `outline` ARTIFACT produced by an outline-from-research run (P1.12's port;
// a distinct artifact type, never a paste) and (b) promoted Guidance (`chat_promote`). These functions
// are the checkable statements the contract test runs over SEAT_MOUNTS + the manifests — a regression
// that opens an assistant-namespace mount to another seat, or declares a shared-artifact output on a
// chat workflow, fails the build.

/** The closed set of chat→pipeline conduits (REQ-SPEC-15). */
export const CHAT_CONDUITS = [
  { kind: "outline_artifact", via: "outline", note: "an outline-from-research run authors outline.md (P1.12)" },
  { kind: "guidance", via: "chat_promote", note: "promoted Guidance — the §6.5 channel" },
] as const;
export type ChatConduitKind = (typeof CHAT_CONDUITS)[number]["kind"];

/** Mount globs a NON-assistant seat must never match (the assistant namespace + hold-outs). */
const FORBIDDEN_FOR_OTHERS = [/^agents\/assistant(\/|$)/];

export interface ConduitViolation {
  rule: string;
  detail: string;
}

/**
 * Rule 1 — mount isolation: no seat other than `assistant` may mount `agents/assistant/**` at any
 * mode. (Drafter/Editor runs materialize ONLY their seat's mounts — the mirror's `isMounted` makes an
 * unmounted path absent by construction.)
 */
export function checkAssistantMountIsolation(): ConduitViolation[] {
  const violations: ConduitViolation[] = [];
  for (const [seat, specs] of Object.entries(SEAT_MOUNTS) as [AgentTypeKey, readonly MountSpec[]][]) {
    if (seat === "assistant") continue;
    for (const s of specs) {
      if (s.root === "project" && FORBIDDEN_FOR_OTHERS.some((re) => re.test(s.glob))) {
        violations.push({
          rule: "mount_isolation",
          detail: `seat ${seat} mounts ${s.glob} (${s.mode}) — the assistant namespace is assistant-only`,
        });
      }
    }
  }
  return violations;
}

/** Paths a chat workflow may declare as phase outputs: the assistant namespace only. */
const ALLOWED_OUTPUT = /^(agents\/assistant\/|\.rhema\/)/;

/**
 * Rule 2 — output confinement: a `chat_turn`/`research_burst` manifest may declare artifacts ONLY
 * under `agents/assistant/` (source notes, thread files, the distilled research note). Any declared
 * `drafts/`, `correspondence/`, `outline.md`, or `agents/<other>/` output is a conduit violation — the
 * manifest is the delivery contract, so the check is structural, not behavioral.
 */
export function checkChatWorkflowOutputs(
  manifests: Partial<Record<WorkflowKey, WorkflowManifest>> = WORKFLOW_MANIFESTS,
): ConduitViolation[] {
  const violations: ConduitViolation[] = [];
  for (const wf of ["chat_turn", "research_burst"] as const) {
    const m = manifests[wf];
    if (!m) {
      violations.push({ rule: "workflow_registered", detail: `${wf} has no manifest` });
      continue;
    }
    for (const phase of m.phases) {
      for (const a of phase.artifacts) {
        if (!ALLOWED_OUTPUT.test(a)) {
          violations.push({
            rule: "output_confinement",
            detail: `${wf}.${phase.key} declares ${a} — chat workflows write only agents/assistant/**`,
          });
        }
      }
      // the forbidden output KINDS: a research/chat phase never authors an outline, a draft, a
      // thesis pick, or an originality verdict — assert on the declared artifact paths.
      for (const a of phase.artifacts) {
        if (/outline\.md|^drafts\/|correspondence\/|thesis|originality/i.test(a)) {
          violations.push({
            rule: "forbidden_artifact_kind",
            detail: `${wf}.${phase.key} declares ${a} — never an outline/draft/thesis/originality output`,
          });
        }
      }
    }
  }
  return violations;
}

/**
 * Rule 3 — the conduit list is closed: promoting chat content into the pipeline requires one of
 * CHAT_CONDUITS. Returns the conduits (the test asserts the set is exactly {outline, guidance}).
 */
export function chatOutputConduits(): readonly { kind: ChatConduitKind; via: string; note: string }[] {
  return CHAT_CONDUITS;
}

/** The whole rule set — one call for the contract test. */
export function checkTwoConduitRule(
  manifests: Partial<Record<WorkflowKey, WorkflowManifest>> = WORKFLOW_MANIFESTS,
): ConduitViolation[] {
  return [...checkAssistantMountIsolation(), ...checkChatWorkflowOutputs(manifests)];
}
