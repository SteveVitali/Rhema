// The delivered-review dossier read (PRB.04's deferred live binding — PRB.16 LIVE FINDING 7; §5.5/§5.7/§6.6).
// `GET /projects/:id/review/:runId/dossier` assembles the reading surface's data ENTIRELY from delivered
// rows (REQ-SPEC-10 — attestation derives only from server-side facts): the `correspondence_items` review
// row (rubric sidecar embedded at delivery), `findings` + `dispositions` → FindingView via the shared
// findings-core read model, `claims` + `claim_sources` joined to the run's proxy `fetch_log` (the
// cited⇒fetched chip source), the editors-letter markdown → letter sections (finding refs join through the
// rows' `letter_section` slots, never by parsing agent prose for links), `buildAccessReport` re-derived
// for the trust chip (REQ-PROD-2), `deriveRunCardInput` over the run's own event stream (REQ-IDE-11 — only
// whitelisted orchestrator event types feed the card), and the `revision_obligations` counts for the
// obligation summary + per-finding state chips (REQ-OBJ-6).

import { Hono } from "hono";
import { buildAccessReport, type ContentStore } from "@rhema/mirror";
import {
  buildFindingView,
  deriveRunCardInput,
  type DispositionState,
  type RubricRowInput,
  type RunEventLike,
} from "@rhema/findings-core";
import { WORKFLOW_MANIFESTS } from "@rhema/protocols";
import type { Actor, Claim, ClaimSource, Finding, ObligationState } from "@rhema/contracts";
import type { Principal } from "./run-routes.js";
import type { SqlClient } from "./invite.js";
import type { TxRunner } from "@rhema/orchestrator";

export interface DossierApiDeps {
  readonly principal: (c: {
    req: { header(name: string): string | undefined };
  }) => Principal | null;
  readonly txRunner: TxRunner;
  /** the workspace-bound readable store (same seam as the revision routes' `contentStoreFor`). */
  contentStoreFor?(workspaceId: string): Promise<ContentStore>;
  readonly store?: ContentStore;
}

// ---------------------------------------------------------------- letter parsing

interface LetterSectionOut {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly findingRefs?: readonly { readonly findingId: string; readonly label: string }[];
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * The finding rows' `letter_section` slots (the canonical §11.3 enum) → the heading a real letter gives
 * that slot. The letter's headings are free prose, so the join is by ordered pattern, first match wins —
 * a slot whose pattern no heading matches simply gets no refs (the finding cards still render; nothing is
 * fabricated into a section that doesn't exist).
 */
const SLOT_PATTERNS: Readonly<Record<string, readonly RegExp[]>> = {
  one_thing: [/^verdict\b/i, /one thing/i],
  major: [/major/i],
  strength: [/strength/i],
  roadmap: [/roadmap/i, /revision/i],
  considered_rejected: [/considered/i],
};

/** Split the editors-letter markdown on `## ` headings → letter sections with paragraph bodies. */
export function parseLetterSections(markdown: string): LetterSectionOut[] {
  const lines = markdown.split("\n");
  const sections: { id: string; title: string; paras: string[] }[] = [];
  let cur: { id: string; title: string; paras: string[] } | null = null;
  let buf: string[] = [];
  const flushPara = (): void => {
    const p = buf.join("\n").trim();
    if (cur && p !== "") cur.paras.push(p);
    buf = [];
  };
  for (const line of lines) {
    const h2 = /^##\s+(.+)$/.exec(line);
    const h1 = /^#\s+/.test(line);
    if (h1) continue; // the letter's own H1 is the title, not a section
    if (h2) {
      flushPara();
      if (cur) sections.push(cur);
      const title = h2[1]!.trim();
      cur = { id: slugify(title), title, paras: [] };
      continue;
    }
    if (cur) {
      if (line.trim() === "") flushPara();
      else buf.push(line);
    }
  }
  flushPara();
  if (cur) sections.push(cur);
  return sections.map((s) => ({ id: s.id, title: s.title, paragraphs: s.paras }));
}

// ---------------------------------------------------------------- row → domain mapping

interface FindingRow {
  id: string;
  correspondence_id: string;
  draft_id: string;
  ordinal: number;
  kind: Finding["kind"];
  severity: Finding["severity"];
  origin: Finding["origin"];
  reconciliation: Finding["reconciliation"] | null;
  anchor: Finding["anchor"];
  title: string;
  body: string;
  evidence: Finding["evidence"] | null;
  suggestion: Finding["suggestion"] | null;
  rubric_dims: Finding["rubricDims"];
  letter_section: Finding["letterSection"] | null;
}

interface DispositionRow {
  id: string;
  finding_id: string;
  kind: DispositionState["kind"];
  rationale: string | null;
  adapted_text: string | null;
  reason_code: DispositionState["reasonCode"] | null;
  applied: boolean | null;
  by_actor: Actor;
  move_ordinal: number | null;
  frozen_at: string | null;
  created_at: string;
}

interface ClaimRow {
  id: string;
  correspondence_id: string;
  draft_id: string;
  ordinal: number;
  text: string;
  tier: 1 | 2 | 3;
  verdict: Claim["verdict"];
  kind: Claim["kind"] | null;
  url: string | null;
  normalized_url: string | null;
  accessed_at: string | null;
  note: string | null;
  source_check: Claim["sourceCheck"] | null;
  anchor: Claim["anchor"] | null;
  human_added: boolean;
  figure_id: string | null;
  extra: Claim["extra"] | null;
}

function toFinding(r: FindingRow): Finding {
  return {
    id: r.id,
    correspondenceId: r.correspondence_id,
    draftId: r.draft_id,
    ordinal: r.ordinal,
    kind: r.kind,
    severity: r.severity,
    origin: r.origin,
    ...(r.reconciliation != null ? { reconciliation: r.reconciliation } : {}),
    anchor: r.anchor,
    title: r.title,
    body: r.body,
    ...(r.evidence != null ? { evidence: r.evidence } : {}),
    ...(r.suggestion != null ? { suggestion: r.suggestion } : {}),
    rubricDims: r.rubric_dims,
    ...(r.letter_section != null ? { letterSection: r.letter_section } : {}),
    projections: [],
  };
}

function toDispositionState(r: DispositionRow): DispositionState {
  return {
    kind: r.kind,
    ...(r.rationale != null ? { rationale: r.rationale } : {}),
    ...(r.adapted_text != null ? { adaptedText: r.adapted_text } : {}),
    ...(r.reason_code != null ? { reasonCode: r.reason_code } : {}),
    by: r.by_actor,
    at: typeof r.created_at === "string" ? r.created_at : new Date(r.created_at).toISOString(),
    ...(r.move_ordinal != null ? { moveId: `M${r.move_ordinal}` } : {}),
    frozen: r.frozen_at != null,
    ...(r.applied != null ? { applied: r.applied } : {}),
  };
}

function toClaim(r: ClaimRow, sources: readonly ClaimSource[]): Claim {
  return {
    id: r.id,
    correspondenceId: r.correspondence_id,
    draftId: r.draft_id,
    ordinal: r.ordinal,
    text: r.text,
    tier: r.tier,
    verdict: r.verdict,
    ...(r.kind != null ? { kind: r.kind } : {}),
    ...(r.url != null ? { url: r.url } : {}),
    ...(r.normalized_url != null ? { normalizedUrl: r.normalized_url } : {}),
    ...(r.accessed_at != null ? { accessedAt: r.accessed_at } : {}),
    ...(r.note != null ? { note: r.note } : {}),
    ...(sources.length > 0 ? { sources: [...sources] } : {}),
    ...(r.source_check != null ? { sourceCheck: r.source_check } : {}),
    ...(r.anchor != null ? { anchor: r.anchor } : {}),
    humanAdded: r.human_added,
    ...(r.figure_id != null ? { figureId: r.figure_id } : {}),
    ...(r.extra != null ? { extra: r.extra } : {}),
  };
}

// ---------------------------------------------------------------- the route

export function createDossierRoutes(deps: DossierApiDeps): Hono {
  const app = new Hono();
  const storeFor = async (workspaceId: string): Promise<ContentStore | null> =>
    (deps.contentStoreFor ? await deps.contentStoreFor(workspaceId) : deps.store) ?? null;

  app.get("/projects/:id/review/:runId/dossier", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const runId = c.req.param("runId");
    const store = await storeFor(principal.workspaceId);
    if (!store) return c.json({ error: "content store unavailable" }, 500);

    const dto = await deps.txRunner.run(principal.workspaceId, async (tx: SqlClient) => {
      const corr = (
        await tx.query(
          `select ci.id, ci.draft_id, ci.run_id, ci.ordinal, ci.rubric, ci.artifact_ids, ci.prior_review_id,
                  p.title project_title, p.slug project_slug, d.n draft_n
             from correspondence_items ci
             join projects p on p.id = ci.project_id
             left join drafts d on d.id = ci.draft_id
            where ci.project_id = $1 and ci.run_id = $2 and ci.kind = 'review'`,
          [projectId, runId],
        )
      ).rows[0] as
        | {
            id: string;
            draft_id: string;
            run_id: string;
            ordinal: number;
            rubric: { dimensions?: RubricRowInput[] } | null;
            artifact_ids: string[];
            prior_review_id: string | null;
            project_title: string;
            project_slug: string;
            draft_n: number | null;
          }
        | undefined;
      if (!corr) return null;

      // P1.04 — reading the letter stamps it once (§5.2: "Ready to read" clears when the deliverable is
      // opened). This feeds `letterOpenedAt` on the §6.3 input — the row's suggested action flips to
      // "Revise from this review" on the next list read.
      await tx.query(
        `update correspondence_items set letter_opened_at = coalesce(letter_opened_at, now()) where id = $1`,
        [corr.id],
      );

      const run = (
        await tx.query(
          `select id, workflow, state, cap_credits, current_attempt from runs where id = $1`,
          [runId],
        )
      ).rows[0] as
        | {
            id: string;
            workflow: string;
            state: string;
            cap_credits: number;
            current_attempt: number;
          }
        | undefined;
      if (!run) return null;

      // ---- run card: only whitelisted orchestrator event types feed the card (REQ-IDE-11) ----
      const events = (
        await tx.query(`select type, payload from run_events where run_id = $1 order by seq`, [
          runId,
        ])
      ).rows as RunEventLike[];
      const manifest = WORKFLOW_MANIFESTS[run.workflow as keyof typeof WORKFLOW_MANIFESTS];
      const phaseKeys = manifest?.phases.map((p) => p.key) ?? [];
      const committed = new Set(
        (
          await tx.query(`select phase from steps where run_id = $1 and state = 'done'`, [runId])
        ).rows.map((r) => (r as { phase: string }).phase),
      );
      const offPhases = phaseKeys.filter((k) => !committed.has(k));
      const runCard = deriveRunCardInput(runId, events, {
        phaseKeys,
        offPhases,
        capCredits: run.cap_credits,
      });

      // ---- letter: the delivered artifact's markdown → sections; finding refs join via letter_section ----
      const versions = (
        await tx.query(
          `select av.id, av.content_sha256, a.kind
             from artifact_versions av join artifacts a on a.id = av.artifact_id
            where av.id = any($1::text[])`,
          [corr.artifact_ids],
        )
      ).rows as { id: string; content_sha256: string; kind: string }[];
      const letterV = versions.find((v) => v.kind === "editors_letter") ?? versions[0];
      let letterSections = await (async (): Promise<ReturnType<typeof parseLetterSections>> => {
        if (!letterV) return [];
        const bytes = await store.get(letterV.content_sha256);
        if (!bytes) return [];
        return parseLetterSections(Buffer.from(bytes).toString("utf8"));
      })();

      const findingRows = (
        await tx.query(
          `select id, correspondence_id, draft_id, ordinal, kind, severity, origin, reconciliation, anchor,
                  title, body, evidence, suggestion, rubric_dims, letter_section
             from findings where correspondence_id = $1 order by ordinal`,
          [corr.id],
        )
      ).rows as FindingRow[];

      const dispositions = (
        await tx.query(
          `select d.id, d.finding_id, d.kind, d.rationale, d.adapted_text, d.reason_code, d.applied,
                  d.by_actor, d.move_ordinal, d.frozen_at, d.created_at
             from dispositions d join findings f on f.id = d.finding_id
            where f.correspondence_id = $1
            order by d.created_at desc`,
          [corr.id],
        )
      ).rows as DispositionRow[];
      const latestDispo = new Map<string, DispositionState>();
      for (const d of dispositions) {
        if (!latestDispo.has(d.finding_id)) latestDispo.set(d.finding_id, toDispositionState(d));
      }

      // attach the findings' letter refs to the parsed sections via the canonical slot → heading map.
      if (letterSections.length > 0) {
        const slotToIdx = new Map<string, number>();
        for (const [slot, patterns] of Object.entries(SLOT_PATTERNS)) {
          const idx = letterSections.findIndex((s) => patterns.some((p) => p.test(s.title)));
          if (idx >= 0) slotToIdx.set(slot, idx);
        }
        const refs = new Map<number, { findingId: string; label: string }[]>();
        for (const f of findingRows) {
          if (f.letter_section == null) continue;
          const idx = slotToIdx.get(f.letter_section);
          if (idx == null) continue;
          const list = refs.get(idx) ?? [];
          list.push({ findingId: f.id, label: `See finding ${f.ordinal + 1}` });
          refs.set(idx, list);
        }
        letterSections = letterSections.map((s, i) =>
          refs.has(i) ? { ...s, findingRefs: refs.get(i)! } : s,
        );
      }

      const findings = findingRows.map((r) =>
        buildFindingView(toFinding(r), {
          ...(latestDispo.has(r.id) ? { disposition: latestDispo.get(r.id)! } : {}),
        }),
      );

      // ---- claims + claim_sources (the claim ledger) + the proxy fetch log (cited⇒fetched source) ----
      const claimRows = (
        await tx.query(
          `select id, correspondence_id, draft_id, ordinal, text, tier, verdict, kind, url, normalized_url,
                  accessed_at, note, source_check, anchor, human_added, figure_id, extra
             from claims where correspondence_id = $1 order by ordinal`,
          [corr.id],
        )
      ).rows as ClaimRow[];
      const sourceRows = (
        await tx.query(
          `select cs.claim_id, cs.ordinal, cs.url, cs.normalized_url, cs.accessed_at, cs.stance, cs.note
             from claim_sources cs join claims cl on cl.id = cs.claim_id
            where cl.correspondence_id = $1 order by cs.claim_id, cs.ordinal`,
          [corr.id],
        )
      ).rows as {
        claim_id: string;
        url: string;
        normalized_url: string;
        accessed_at: string;
        stance: ClaimSource["stance"];
        note: string | null;
      }[];
      const sourcesByClaim = new Map<string, ClaimSource[]>();
      for (const s of sourceRows) {
        const list = sourcesByClaim.get(s.claim_id) ?? [];
        list.push({
          url: s.url,
          normalizedUrl: s.normalized_url,
          accessedAt: s.accessed_at,
          stance: s.stance,
          ...(s.note != null ? { note: s.note } : {}),
        });
        sourcesByClaim.set(s.claim_id, list);
      }
      const claims = claimRows.map((r) => toClaim(r, sourcesByClaim.get(r.id) ?? []));

      const fetchLog = (
        await tx.query(
          `select distinct normalized_url from fetch_log
            where run_id = $1 and kind = 'fetch' and decision = 'allow' and normalized_url is not null
            order by normalized_url`,
          [runId],
        )
      ).rows.map((r) => (r as { normalized_url: string }).normalized_url);

      // ---- trust chip: the access_report re-derived from persisted server-side facts (REQ-PROD-2) ----
      const report = await buildAccessReport(tx, { runId, attempt: run.current_attempt });
      const accessReport = {
        seat: report.seat,
        mountedPathCount: report.mountedPathCount,
        byTopLevel: report.byTopLevel,
        fetches: report.fetches,
        deniedAttempts: report.deniedAttempts,
        violations: report.violations,
        subagents: report.subagents,
      };

      // ---- obligation summary + per-finding state chips (REQ-OBJ-6) ----
      const obligationRows = (
        await tx.query(
          `select finding_id, state from revision_obligations where project_id = $1 and finding_id is not null`,
          [projectId],
        )
      ).rows as { finding_id: string; state: ObligationState }[];
      const findingObligations: Record<string, ObligationState> = {};
      let openObligations = 0;
      let addressedObligations = 0;
      const allObligations = (
        await tx.query(`select state from revision_obligations where project_id = $1`, [projectId])
      ).rows as { state: ObligationState }[];
      for (const o of allObligations) {
        if (o.state === "open" || o.state === "reopened") openObligations++;
        else if (o.state === "addressed" || o.state === "discharged") addressedObligations++;
      }
      for (const o of obligationRows) findingObligations[o.finding_id] = o.state;

      // ---- re-review delta: the prior round's rubric (REQ-IDE-30) ----
      let priorRubric: RubricRowInput[] | undefined;
      if (corr.prior_review_id != null) {
        const prior = (
          await tx.query(`select rubric from correspondence_items where id = $1`, [
            corr.prior_review_id,
          ])
        ).rows[0] as { rubric: { dimensions?: RubricRowInput[] } | null } | undefined;
        priorRubric = prior?.rubric?.dimensions;
      }

      return {
        slug: corr.project_slug,
        runId,
        projectTitle: corr.project_title,
        versionLabel: `Review of v${corr.draft_n ?? 1}`,
        openObligations,
        addressedObligations,
        runCard,
        letterTitle: corr.project_title,
        letterSections,
        claims,
        fetchLog,
        findings,
        rubric: corr.rubric?.dimensions ?? [],
        ...(priorRubric ? { priorRubric } : {}),
        accessReport,
        findingObligations,
      };
    });

    if (!dto) return c.json({ error: "not_found" }, 404);
    return c.json(dto);
  });

  return app;
}
