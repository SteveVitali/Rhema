// P1.09 — the shared gate-card DTO assembly (§6.4). ONE loader for every surface that renders an
// approval — `GET /projects/:id/gates` (the Needs-you feed) and `GET /projects/:id/timeline` (the
// run card's identical card) both build from these rows + helpers, so the cards can never drift.
// The kind's structured parts (REQ-SPEC-9) come from the artifact's `.json` sidecar read
// SERVER-SIDE (the contract schemas validate; a missing/unreadable sidecar just omits the slot).

import {
  cutListSidecarSchema,
  outlineSidecarSchema,
  structurePlanSidecarSchema,
  type GateKind,
  type GateOnExpiry,
} from "@rhema/contracts";
import type {
  GateCardWire,
  GateCutListView,
  GateDecisionView,
  GateOutlineView,
  GatePlanView,
  GateStructuredView,
  GateTriageRowView,
} from "@rhema/findings-core";
import type { ContentStore } from "@rhema/mirror";

/** Anything that can run SQL (the shell's raw client or a transaction). */
export type SqlExec = { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> };

/** The content-store seam the sidecar read needs (mirrors RunApiDeps' two shapes). */
export interface GateDtoDeps {
  readonly store?: ContentStore;
  contentStoreFor?(workspaceId: string): Promise<ContentStore>;
}

/** The open-gate row both surfaces share (gates ⨝ runs ⨝ the pending artifact). */
export interface OpenGateRow {
  id: string;
  run_id: string;
  kind: GateKind;
  artifact_version_id: string | null;
  opened_at: string;
  deadline_at: string | null;
  presence_deadline_at: string | null;
  paused_while_reading: boolean;
  held: boolean;
  blocking: boolean;
  on_expiry: GateOnExpiry;
  resolved_at: string | null;
  workflow: string;
  spent_credits: number;
  cap_credits: number;
  estimate_credits: number;
  model_tier: string;
  current_attempt: number;
  project_id: string;
  workspace_id: string;
  inputs: Record<string, unknown> | null;
  artifact_path: string | null;
  artifact_id: string | null;
  artifact_kind: string | null;
}

export const OPEN_GATE_SELECT = `select g.id, g.run_id, g.kind, g.artifact_version_id, g.opened_at, g.deadline_at,
        g.presence_deadline_at, g.paused_while_reading, g.held, g.blocking, g.on_expiry, g.resolved_at,
        r.workflow, r.spent_credits, r.cap_credits, r.estimate_credits, r.model_tier, r.current_attempt,
        r.inputs, r.project_id, r.workspace_id,
        a.mirror_path as artifact_path, a.id as artifact_id, a.kind as artifact_kind
   from gates g join runs r on r.id = g.run_id
   left join artifact_versions av on av.id = g.artifact_version_id
   left join artifacts a on a.id = av.artifact_id`;

/** The base card DTO — every field the §6.4 anatomy needs, minus the kind's structured body. */
export function gateDtoBase(g: OpenGateRow): GateCardWire {
  return {
    id: g.id,
    runId: g.run_id,
    kind: g.kind,
    workflow: g.workflow,
    ...(g.artifact_version_id != null ? { artifactVersionId: g.artifact_version_id } : {}),
    ...(g.artifact_id != null ? { artifactId: g.artifact_id } : {}),
    // the artifact under decision (§6.4 item 1) — its mirror filename ("response-ledger.md").
    ...(g.artifact_path != null
      ? { artifactTitle: (g.artifact_path.split("/").pop() ?? g.artifact_path).replace(/\.md$/, "") }
      : {}),
    openedAt: g.opened_at,
    ...(g.deadline_at != null ? { deadlineAt: g.deadline_at } : {}),
    ...(g.presence_deadline_at != null ? { presenceDeadlineAt: g.presence_deadline_at } : {}),
    pausedWhileReading: g.paused_while_reading,
    held: g.held,
    blocking: g.blocking,
    onExpiry: g.on_expiry,
    spentCredits: g.spent_credits,
    capCredits: g.cap_credits,
    modelTier: g.model_tier,
  };
}

/** Read an artifact's `.json` sidecar twin (the head version) — the structured edit base. */
export async function loadArtifactSidecar(
  exec: SqlExec,
  deps: GateDtoDeps,
  workspaceId: string,
  artifactVersionId: string,
): Promise<unknown | null> {
  const store = deps.contentStoreFor ? await deps.contentStoreFor(workspaceId) : deps.store;
  if (!store) return null;
  const row = (
    await exec.query(
      `select a.mirror_path, a.project_id
         from artifact_versions av join artifacts a on a.id = av.artifact_id where av.id = $1`,
      [artifactVersionId],
    )
  ).rows[0] as { mirror_path: string; project_id: string } | undefined;
  if (!row) return null;
  const jsonPath = row.mirror_path.replace(/\.md$/, ".json");
  const head = (
    await exec.query(
      `select av.content_sha256 from artifacts a
         join artifact_versions av on av.id = a.head_version_id
        where a.project_id = $1 and a.mirror_path = $2`,
      [row.project_id, jsonPath],
    )
  ).rows[0] as { content_sha256: string } | undefined;
  if (!head) return null;
  const bytes = await store.get(head.content_sha256);
  if (!bytes) return null;
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function planViewFromSidecar(doc: unknown): GatePlanView | null {
  const parsed = structurePlanSidecarSchema.safeParse(doc);
  if (!parsed.success) return null;
  const d = parsed.data;
  return {
    spine: d.spine.map((text) => ({ text })),
    sections: d.sections.map((s) => ({
      ref: s.ref,
      title: s.title,
      ...(s.targetWords != null ? { targetWords: s.targetWords } : {}),
      ...(s.purpose != null ? { purpose: s.purpose } : {}),
    })),
    ...(d.alternativesConsidered != null ? { alternativesConsidered: d.alternativesConsidered } : {}),
    ...(d.gaps != null ? { gaps: d.gaps } : {}),
  };
}

function cutListViewFromSidecar(doc: unknown): GateCutListView | null {
  const parsed = cutListSidecarSchema.safeParse(doc);
  if (!parsed.success) return null;
  return {
    ...(parsed.data.targetWords != null ? { targetWords: parsed.data.targetWords } : {}),
    cuts: parsed.data.cuts.map((cut, i) => ({
      ordinal: cut.ordinal ?? i,
      words: cut.words,
      reason: cut.reason,
      protect: cut.protect === true,
    })),
  };
}

/** P1.12 — the outline sidecar → the Approve-outline card's editable view (provenance rides every row). */
function outlineViewFromSidecar(doc: unknown): GateOutlineView | null {
  const parsed = outlineSidecarSchema.safeParse(doc);
  if (!parsed.success) return null;
  const d = parsed.data;
  return {
    ...(d.thesis != null ? { thesis: d.thesis } : {}),
    ...(d.venue != null ? { venue: d.venue } : {}),
    ...(d.targetLength != null ? { targetLength: d.targetLength } : {}),
    ...(d.protocol != null ? { protocol: d.protocol } : {}),
    ...(d.voice != null ? { voice: d.voice } : {}),
    spine: d.spine,
    sections: d.sections.map((s) => ({
      ref: s.ref,
      title: s.title,
      ...(s.targetWords != null ? { targetWords: s.targetWords } : {}),
      ...(s.function != null ? { function: s.function } : {}),
      ...(s.entry != null ? { entry: s.entry } : {}),
      ...(s.exit != null ? { exit: s.exit } : {}),
      claims: s.claims.map((cl) => ({
        id: cl.id,
        text: cl.text,
        provenanceKind: cl.provenance.kind,
        provenance: {
          ...(cl.provenance.turnId != null ? { turnId: cl.provenance.turnId } : {}),
          ...(cl.provenance.url != null ? { url: cl.provenance.url } : {}),
          ...(cl.provenance.notePath != null ? { notePath: cl.provenance.notePath } : {}),
        },
        unverified: cl.unverified === true,
      })),
    })),
    ...(d.alternativesConsidered != null ? { alternativesConsidered: d.alternativesConsidered } : {}),
    gaps: (d.gaps ?? []).map((g) => ({
      id: g.id,
      needed: g.needed,
      ...(g.relatedClaimId != null ? { relatedClaimId: g.relatedClaimId } : {}),
      ...(g.sectionRef != null ? { sectionRef: g.sectionRef } : {}),
    })),
    ...(d.provenance?.urls != null
      ? { urls: d.provenance.urls.map((u) => ({ url: u.url, unverified: u.unverified === true })) }
      : {}),
  };
}

/**
 * Compose the kind's structured body (§6.4 item 4). Reads the artifact's sidecar for the editable
 * kinds (plan/cutlist); the scope card's fields + every kind's read-only `facts` come from the
 * gate/run rows (server facts — the card never infers them).
 */
export async function attachStructuredBody(
  exec: SqlExec,
  deps: GateDtoDeps,
  g: OpenGateRow,
  dto: GateCardWire & { structured?: GateStructuredView; triage?: { rows: readonly GateTriageRowView[] } },
): Promise<void> {
  const inputs = g.inputs ?? {};
  // a mutable local mirror of GateStructuredView (the interface's fields are readonly).
  const structured: {
    plan?: GatePlanView;
    scope?: GateStructuredView["scope"];
    cutList?: GateCutListView;
    outline?: GateOutlineView;
    facts?: Record<string, string | number | boolean | null>;
  } = {};

  // The kind's read-only facts (the card composes the wording from these keys).
  const facts: Record<string, string | number | boolean | null> = { workflow: g.workflow };
  if (g.kind === "confirm_cost") {
    facts.estimateCredits = g.estimate_credits;
    facts.capCredits = g.cap_credits;
    facts.modelTier = g.model_tier;
  } else if (g.kind === "spend_overrun") {
    facts.spentCredits = g.spent_credits;
    facts.capCredits = g.cap_credits;
    facts.estimateCredits = g.estimate_credits;
  } else if (g.kind === "resume_partial") {
    facts.attempt = g.current_attempt;
    facts.spentCredits = g.spent_credits;
  } else if (g.kind === "refusal" && typeof inputs["refusalReason"] === "string") {
    facts.reason = inputs["refusalReason"] as string;
  }

  if (g.kind === "approve_scope") {
    // REQ-SPEC-17: informational unless the sheet's scope facts changed (blocking) — and a re-priced
    // estimate over the consented cap turns it into a spend gate that waits (never auto-proceeds).
    const exceedsCap = g.estimate_credits > g.cap_credits;
    structured.scope = {
      informational: !g.blocking && !exceedsCap,
      ...(exceedsCap ? { exceedsCap: true } : {}),
      estimateCredits: g.estimate_credits,
      capCredits: g.cap_credits,
      protocol: (inputs["protocol"] as string | undefined) ?? null,
      venue: (inputs["venue"] as string | undefined) ?? null,
      stage: (inputs["stage"] as string | undefined) ?? null,
      rigor: (inputs["rigor"] as string | undefined) ?? null,
    };
  }

  // The editable sidecar kinds — read the artifact's `.json` twin.
  if (g.artifact_version_id != null && g.kind === "approve_plan") {
    const doc = await loadArtifactSidecar(exec, deps, g.workspace_id, g.artifact_version_id);
    const plan = planViewFromSidecar(doc);
    if (plan) structured.plan = plan;
  }
  if (g.artifact_version_id != null && g.kind === "approve_cutlist") {
    const doc = await loadArtifactSidecar(exec, deps, g.workspace_id, g.artifact_version_id);
    const cutList = cutListViewFromSidecar(doc);
    if (cutList) structured.cutList = cutList;
  }
  // P1.12 — the Approve-outline card edits the outline's `.json` twin (the shared spine-and-sections
  // rows); the promotion facts (thread/scope) ride `facts` so the card can name what was promoted.
  if (g.artifact_version_id != null && g.kind === "approve_outline") {
    const doc = await loadArtifactSidecar(exec, deps, g.workspace_id, g.artifact_version_id);
    const outline = outlineViewFromSidecar(doc);
    if (outline) structured.outline = outline;
    if (typeof inputs["threadId"] === "string") facts.threadId = inputs["threadId"] as string;
    if (typeof inputs["scope"] === "string") facts.scope = inputs["scope"] as string;
    if (typeof inputs["outlineSlug"] === "string") facts.slug = inputs["outlineSlug"] as string;
  }
  if (typeof inputs["apparatusBudget"] === "number" && structured.plan) {
    structured.plan = { ...structured.plan, apparatusBudget: inputs["apparatusBudget"] as number };
  }

  // the read-only facts kinds + choose_thesis (its pick field lives inside the structured slot, so the
  // slot must exist even with no sidecar — otherwise the card can't post `ed.values.thesis`).
  const FACT_KINDS: readonly GateKind[] = ["confirm_cost", "spend_overrun", "resume_partial", "refusal", "continue_rounds", "choose_thesis"];
  if (Object.keys(structured).length > 0 || FACT_KINDS.includes(g.kind)) {
    structured.facts = facts;
    dto.structured = structured;
  }
}

/** A run's permanent decision records (§6.4 item 8; REQ-RUN-5/6) — every resolved gate's row. */
export async function loadRunDecisions(
  exec: SqlExec,
  runIds: readonly string[],
): Promise<Map<string, GateDecisionView[]>> {
  const out = new Map<string, GateDecisionView[]>();
  if (runIds.length === 0) return out;
  const res = await exec.query(
    `select d.gate_id, g.run_id, g.kind, d.by_actor, d.presence, d.action, d.guidance,
            d.standing_rule, d.changes, d.overlay_version_ids, d.at
       from decisions d join gates g on g.id = d.gate_id
      where g.run_id = any($1::text[])
      order by d.at, d.gate_id`,
    [[...runIds]],
  );
  for (const r of res.rows as Array<{
    gate_id: string;
    run_id: string;
    kind: GateKind;
    by_actor: string;
    presence: boolean | null;
    action: string;
    guidance: string | null;
    standing_rule: boolean | null;
    changes: number | null;
    overlay_version_ids: string[] | null;
    at: string | Date;
  }>) {
    const view: GateDecisionView = {
      id: r.gate_id,
      gateId: r.gate_id,
      kind: r.kind,
      action: r.action,
      byActor: r.by_actor,
      presence: r.presence === true,
      at: new Date(r.at).toISOString(),
      ...(r.changes != null ? { changes: r.changes } : {}),
      ...(r.overlay_version_ids != null ? { overlayVersionIds: r.overlay_version_ids } : {}),
      ...(r.guidance != null ? { text: r.guidance } : {}),
    };
    const l = out.get(r.run_id) ?? [];
    l.push(view);
    out.set(r.run_id, l);
  }
  return out;
}
