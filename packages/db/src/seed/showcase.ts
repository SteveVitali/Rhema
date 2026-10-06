// P1.17 (§15.4; REQ-POS-3) — the deterministic Showcase dossier seed. Every provisioned workspace gets
// ONE showcase project: an outline, a submitted v1, the full-board dossier (letter + claim ledger +
// findings + run card), the triage ledger, and a revised v2 with the author's response letter — all
// precomputed fixture content, never generated per user, at $0.
//
// CONTENT GATE: this is a deterministic fixture. The real walkthrough essay is an H5 decision
// (deferred D-P1.17-1) — when H5 signs off on real content, only the SHOWCASE_FIXTURE_* strings
// change; the machinery below is content-agnostic. REQ-POS-3 is enforced: `assertShowcaseFixture`
// throws if the claim ledger lacks a contradicted tier-1 claim backed by a fetched URL.

import { sha256Hex, assertShowcaseFixture, SHOWCASE_SLUG, SHOWCASE_TITLE } from "@rhema/contracts";
import type { MigrationDb } from "../migrate.js";

/** The byte sink a bound deploy supplies so the dossier's letter/draft markdown actually renders. */
export interface ShowcaseStore {
  put(workspaceId: string, sha256: string, bytes: Uint8Array): Promise<{ key: string }>;
}

const ENC = new TextEncoder();

// ---- the fixture essay (stand-in pending H5 — a modest original text on a checkable topic) ----

export const SHOWCASE_FIXTURE_OUTLINE_MD = `# Outline — The archive that remembers

## The promise of a perfect memory
- Digital archives as a civilizational claim
- The counter-claim: archives decay by policy, not entropy

## What the ledger shows
- Three cases: the 1871 census gap, the 1990s web, the present corpus
- Numbers worth checking before the argument leans on them

## What the essay should admit
- Where the metaphor breaks
- What the reader should verify for themselves
`;

export const SHOWCASE_FIXTURE_V1_MD = `# The archive that remembers

Every civilization writes down what it cannot afford to forget, and then forgets what it wrote. The
claim sounds paradoxical, but the pattern is old: archives promise permanence, and deliver it exactly
as far as their custodians are funded to deliver it.

The digital archive was supposed to end this. Storage is cheap, copies are free, and forgetting now
looks like a choice rather than a fate. That is the promise this essay wants to test — because the
ledger underneath it is less kind than the metaphor.

## Three shelves

Start with the census. The 1871 United Kingdom census, the first to record religion for every
household, survives in the enumerators' books almost intact — a reminder that paper, kept dry, is a
very good archive. The same census, however, records population counts that later historians have had
to reconstruct because the published abstracts were themselves compiled under a budget, and the
corners that got cut became permanent. The archive remembered what it was paid to remember.

Now the 1990s web. The Internet Archive's crawls preserved a slice of it, and the slice is
impressive — but the slice is a slice. By one widely repeated estimate, more than a quarter of the
links in papers published in the last two decades now resolve to nothing at all. The dead link is
the digital archive's missing shelf: not a fire, not a flood, just a hosting bill nobody paid.

And now the present corpus. The essay leans here on a claim it should not: that "the 1871 census
recorded 3.1 million households in Scotland," a figure repeated in at least two secondary sources. It
is wrong — the recorded figure is closer to half a million households, and the error survives because
citing a confident number is easier than checking one. The archive does not just decay by accident;
it decays by citation.

## What remembering costs

The conclusion is not that digital archives fail. They succeed at exactly the thing paper did — they
remember what someone keeps paying for. The honest version of the promise is narrower and better: an
archive that remembers is not a technology but a budget line, renewed every year, with someone's name
on it. The reader who wants the strongest version of this argument should verify the numbers above —
the point is that they can.
`;

export const SHOWCASE_FIXTURE_V2_MD = `# The archive that remembers

Every civilization writes down what it cannot afford to forget, and then forgets what it wrote. The
claim sounds paradoxical, but the pattern is old: archives promise permanence, and deliver it exactly
as far as their custodians are funded to deliver it.

The digital archive was supposed to end this. Storage is cheap, copies are free, and forgetting now
looks like a choice rather than a fate. That is the promise this essay wants to test — because the
ledger underneath it is less kind than the metaphor.

## Three shelves

Start with the census. The 1871 United Kingdom census survives in the enumerators' books almost
intact — a reminder that paper, kept dry, is a very good archive. The same census, however, records
counts that later historians have had to reconstruct, because the published abstracts were themselves
compiled under a budget, and the corners that got cut became permanent. The archive remembered what
it was paid to remember.

Now the 1990s web. The Internet Archive's crawls preserved a slice of it, and the slice is
impressive — but the slice is a slice. Links in papers published in the last two decades now resolve
to nothing at a rate measured in the tens of percent, depending on the venue. The dead link is the
digital archive's missing shelf: not a fire, not a flood, just a hosting bill nobody paid.

The earlier version of this essay claimed that "the 1871 census recorded 3.1 million households in
Scotland." It does not — the recorded figure is about 560,000 households, and the error survives
because citing a confident number is easier than checking one. This version carries the correction
rather than the claim; the mistake was instructive, but it was still a mistake.

## What remembering costs

The conclusion is not that digital archives fail. They succeed at exactly the thing paper did — they
remember what someone keeps paying for. The honest version of the promise is narrower and better: an
archive that remembers is not a technology but a budget line, renewed every year, with someone's name
on it. The reader who wants the strongest version of this argument should verify the numbers above —
the point is that they can.
`;

export const SHOWCASE_FIXTURE_LETTER_MD = `# Editor's letter — The archive that remembers (v1)

## The verdict

Strong essay, one real problem: the essay's central checkable number is wrong, and the argument
leans on it at the exact moment it claims credibility. Revise before this goes anywhere. See finding
1.

## Major findings

Beyond the census figure, two structural notes matter. The middle shelf — the link-rot paragraph —
quotes a widely repeated estimate without naming where it came from; the claim needs a source or a
softer phrasing. And the ending asks the reader to "verify the numbers" without showing the work;
that invitation is the essay's best move, but it only lands if the numbers are checkable.

## Strengths

The frame — an archive is a budget line, not a technology — is genuinely earned here, and the
three-shelf structure gives each version of the claim its own evidence. The census shelf in
particular does real work: it shows decay-by-budget before the essay ever mentions a server.

## Revision roadmap

Fix the Scotland figure and carry the correction openly — the essay is about citation decay, and a
visible correction is the strongest possible evidence for it. Tie the link-rot estimate to its
primary source or drop it to a qualitative claim. Then let the last paragraph keep the invitation.

## Considered and rejected

We considered recommending a fourth section on institutional preservation funding; the essay's
argument does not need it and the scope would dilute the ending. We also considered flagging the
title as generic — it is not the problem the draft has.
`;

export const SHOWCASE_FIXTURE_RESPONSE_MD = `# Response — The archive that remembers (v2)

Two sentences of accounting for the revision, the way the response letter always works: the Scotland
figure was wrong and v2 carries the correction in the open; the link-rot estimate is now qualitative
and no longer leans on an unsourced number. Everything else in the letter's roadmap stands — the
ending keeps its invitation to verify, and this time the numbers in front of the reader were.
`;

// ---- the fixture's claim ledger (deterministic; the tier-1 row is REQ-POS-3's proof) ----
// The contradicted claim's source is a real public URL the review "fetched" (fetch_log rows below
// carry the same normalized URLs — the cited⇒fetched chip is real data, not decoration).

const SCOTLAND_URL = "https://www.nrscotland.gov.uk/publications/1871-census-population-tables";
const LINKROT_URL = "https://www.pewresearch.org/decay/";
const ARCHIVE_URL = "https://archive.org/web/";

export const SHOWCASE_FIXTURE_CLAIMS = [
  {
    text: "The 1871 census recorded 3.1 million households in Scotland.",
    tier: 1,
    verdict: "contradicted",
    kind: "statistical",
    sourceCheck: "matches_citation",
    note: "The recorded figure is ≈560,000 households; the claim repeats a secondary-source error.",
    sources: [
      { url: SCOTLAND_URL, stance: "contradicts", note: "Published tables: ≈0.56M households." },
      { url: ARCHIVE_URL, stance: "contextualizes" },
    ],
  },
  {
    text: "Paper archives decay by custodial neglect more than by entropy.",
    tier: 2,
    verdict: "substantially_accurate",
    kind: "interpretive",
    sources: [{ url: ARCHIVE_URL, stance: "supports" }],
  },
  {
    text: "More than a quarter of links in recent papers now resolve to nothing.",
    tier: 1,
    verdict: "misleading_in_context",
    kind: "statistical",
    note: "The estimate is real but venue-dependent; cite the primary study or soften.",
    sources: [{ url: LINKROT_URL, stance: "supports", note: "Rate varies by venue and year." }],
  },
  {
    text: "The Internet Archive crawled only a slice of the 1990s web.",
    tier: 2,
    verdict: "verified",
    kind: "factual",
    sources: [{ url: ARCHIVE_URL, stance: "supports" }],
  },
  {
    text: "The 1871 UK census survives in the enumerators' books almost intact.",
    tier: 2,
    verdict: "verified",
    kind: "factual",
    sources: [{ url: SCOTLAND_URL, stance: "supports" }],
  },
  {
    text: "An archive that remembers is a budget line, renewed every year.",
    tier: 3,
    verdict: "unverifiable",
    kind: "normative",
    note: "Thesis claim — argued, not checked.",
  },
] as const;

// ---- the fixture's findings (a full-board shape: claim + discourse + structure + a second-read row) ----

export const SHOWCASE_FIXTURE_FINDINGS = [
  {
    kind: "claim",
    severity: "blocking",
    origin: "editor",
    letterSection: "major",
    title: "The Scotland figure is wrong — and the argument leans on it",
    body: "The essay claims the 1871 census recorded 3.1 million households in Scotland. The published tables record roughly 560,000. Because the error is the essay's own example of citation decay, it must be corrected visibly — the correction is the argument's best evidence.",
    // HOT.1 — canonical evidence shape (verdict + urls); `accessed` is stamped at insert with the
    // seed's `now`, the same stamp the claim rows' `accessed_at` gets.
    evidence: { verdict: "contradicted", urls: [{ url: SCOTLAND_URL }] },
    suggestion: { action: "replace", text: "Carry the correction in the open: name the figure, name the real count, keep the lesson." },
    rubricDims: ["evidence_accuracy", "intellectual_honesty"],
  },
  {
    kind: "claim",
    severity: "major",
    origin: "editor",
    letterSection: "major",
    title: "The link-rot estimate needs its source",
    body: "The 'more than a quarter' figure is real but venue-dependent and currently unattributed. Cite the primary study or soften the claim to a measured-range statement.",
    evidence: { verdict: "misleading_in_context", urls: [{ url: LINKROT_URL }] },
    rubricDims: ["evidence_accuracy"],
  },
  {
    kind: "discourse",
    severity: "minor",
    origin: "editor",
    letterSection: "roadmap",
    title: "The verify-it-yourself invitation needs the numbers checkable",
    body: "The ending's invitation to verify is the essay's strongest move, but it lands only if every hard number above it is actually checkable. Once finding 1 is corrected, this resolves itself.",
    rubricDims: ["argument_rigor"],
  },
  {
    kind: "structure",
    severity: "minor",
    origin: "editor",
    letterSection: "strength",
    title: "The three-shelf structure earns the frame",
    body: "Census, links, corpus — each shelf carries one version of the decay claim and its own evidence. Keep the order; it escalates correctly.",
    rubricDims: ["structure"],
  },
  {
    kind: "claim",
    severity: "major",
    origin: "second_read",
    letterSection: "major",
    title: "Second read: the 1871 census is not the first to record religion",
    body: "The draft calls 1871 the first census to record religion for every household; that distinction belongs to a later enumeration. The sentence works without the superlative.",
    rubricDims: ["evidence_accuracy"],
    reconciliation: "agrees",
  },
  {
    kind: "craft",
    severity: "note",
    origin: "both",
    letterSection: "strength",
    title: "'A budget line, renewed every year' is the sentence to keep",
    body: "The closing formulation is the essay's quotable core. Both passes flagged it as the keeper.",
    rubricDims: ["prose"],
    reconciliation: "agrees",
  },
] as const;

export const SHOWCASE_FIXTURE_RUBRIC = {
  dimensions: [
    { dimension: "thesis_contribution", score: 4 },
    { dimension: "argument_rigor", score: 4 },
    { dimension: "evidence_accuracy", score: 2, cap: { dimension: "evidence_accuracy", score: 2, reason: "A contradicted tier-1 claim caps the dimension." } },
    { dimension: "originality_situatedness", score: 3 },
    { dimension: "structure", score: 4 },
    { dimension: "prose", score: 4 },
    { dimension: "voice_audience_fit", score: 4 },
    { dimension: "intellectual_honesty", score: 3 },
  ],
};

// ---------------- the seed ----------------

export interface ShowcaseSeedDeps {
  readonly workspaceId: string;
  readonly ownerId: string;
  readonly ids: () => string;
  readonly clock?: { now(): Date };
  /** bound in the live deploy so the dossier's markdown renders; absent in pure-fixture tests. */
  readonly store?: ShowcaseStore;
}

export interface ShowcaseSeedResult {
  readonly projectId: string;
  readonly slug: string;
  readonly reviewRunId: string;
  readonly reviewCorrId: string;
  readonly firstFindingId: string;
}

interface ArtifactSpec {
  readonly kind: string;
  readonly namespace: string;
  readonly mirrorPath: string;
  readonly markdown: string;
  readonly ordinal?: number;
}

async function writeArtifact(
  db: MigrationDb,
  deps: ShowcaseSeedDeps,
  projectId: string,
  spec: ArtifactSpec,
): Promise<{ artifactId: string; versionId: string }> {
  const bytes = ENC.encode(spec.markdown);
  const sha = sha256Hex(bytes);
  const words = spec.markdown.split(/\s+/).filter(Boolean).length;
  let s3Key = `fixture/${sha}`;
  if (deps.store) {
    const put = await deps.store.put(deps.workspaceId, sha, bytes);
    s3Key = put.key;
  }
  const artifactId = deps.ids();
  const versionId = deps.ids();
  await db.query(
    `insert into artifacts (id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [artifactId, deps.workspaceId, projectId, spec.kind, spec.namespace, spec.mirrorPath, versionId],
  );
  await db.query(
    `insert into artifact_versions (id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count,
                                    media_type, created_by, immutable, parse_status)
     values ($1,$2,$3,$4,$5,$6,$7,'text/markdown',$8,true,'ok')`,
    [
      versionId, artifactId, spec.ordinal ?? 1, sha, s3Key, bytes.byteLength, words,
      JSON.stringify({ kind: "system", label: "showcase-seed" }),
    ],
  );
  return { artifactId, versionId };
}

/**
 * Seed the workspace's one Showcase project (idempotent — an existing showcase row returns its ids
 * untouched). Everything here is fixture content copied in at provisioning: no inference, no spend.
 */
export async function seedShowcaseProject(
  db: MigrationDb,
  deps: ShowcaseSeedDeps,
): Promise<ShowcaseSeedResult> {
  const existing = (
    await db.query(
      `select p.id, p.slug,
              (select ci.run_id from correspondence_items ci
                where ci.project_id = p.id and ci.kind = 'review' order by ci.ordinal limit 1) as review_run_id,
              (select f.id from findings f
                join correspondence_items ci on ci.id = f.correspondence_id
                where ci.project_id = p.id and ci.kind = 'review' order by f.ordinal limit 1) as first_finding_id,
              (select ci.id from correspondence_items ci
                where ci.project_id = p.id and ci.kind = 'review' order by ci.ordinal limit 1) as review_corr_id
         from projects p where p.workspace_id = $1 and p.showcase and p.deleted_at is null limit 1`,
      [deps.workspaceId],
    )
  ).rows[0] as
    | { id: string; slug: string; review_run_id: string | null; first_finding_id: string | null; review_corr_id: string | null }
    | undefined;
  if (existing && existing.review_run_id && existing.first_finding_id && existing.review_corr_id) {
    return {
      projectId: existing.id,
      slug: existing.slug,
      reviewRunId: existing.review_run_id,
      reviewCorrId: existing.review_corr_id,
      firstFindingId: existing.first_finding_id,
    };
  }

  // REQ-POS-3 — validate the fixture before any row lands.
  assertShowcaseFixture({ claims: SHOWCASE_FIXTURE_CLAIMS }, "SHOWCASE_FIXTURE");

  const now = deps.clock?.now() ?? new Date();
  const projectId = deps.ids();
  const runId = deps.ids();
  const v1Id = deps.ids();
  const v2Id = deps.ids();
  const corrId = deps.ids();
  const respId = deps.ids();

  // workspace-unique slug (the fixed base wins unless a user project already took it).
  const slugRes = await db.query(
    `select slug from projects where workspace_id = $1 and slug like $2`,
    [deps.workspaceId, `${SHOWCASE_SLUG}%`],
  );
  const taken = new Set((slugRes.rows as { slug: string }[]).map((r) => r.slug));
  let slug = SHOWCASE_SLUG;
  for (let i = 2; taken.has(slug); i++) slug = `${SHOWCASE_SLUG}-${i}`;

  await db.query(
    `insert into projects (id, workspace_id, owner_id, title, slug, protocol_id, showcase)
     values ($1,$2,$3,$4,$5,'essay',true)`,
    [projectId, deps.workspaceId, deps.ownerId, SHOWCASE_TITLE, slug],
  );
  await db.query(
    `insert into project_members (project_id, user_id, role) values ($1,$2,'admin') on conflict do nothing`,
    [projectId, deps.ownerId],
  );

  // artifacts: outline + the two draft versions + the letter + the response letter.
  const outline = await writeArtifact(db, deps, projectId, {
    kind: "outline", namespace: "agents/author",
    mirrorPath: "agents/author/outline/showcase.md", markdown: SHOWCASE_FIXTURE_OUTLINE_MD,
  });
  const v1 = await writeArtifact(db, deps, projectId, {
    kind: "draft", namespace: "drafts", mirrorPath: "drafts/v1.md", markdown: SHOWCASE_FIXTURE_V1_MD,
  });
  const v2 = await writeArtifact(db, deps, projectId, {
    kind: "draft", namespace: "drafts", mirrorPath: "drafts/v2.md", markdown: SHOWCASE_FIXTURE_V2_MD,
  });
  const letter = await writeArtifact(db, deps, projectId, {
    kind: "editors_letter", namespace: "correspondence",
    mirrorPath: "correspondence/review-1-letter.md", markdown: SHOWCASE_FIXTURE_LETTER_MD,
  });
  const response = await writeArtifact(db, deps, projectId, {
    kind: "response_letter", namespace: "correspondence",
    mirrorPath: "correspondence/response-1-letter.md", markdown: SHOWCASE_FIXTURE_RESPONSE_MD,
  });

  // drafts v1 (the reviewed import) + v2 (the revised head — 'working' so the project has a live head).
  await db.query(
    `insert into drafts (id, project_id, n, origin, state, promoted_version_id, frozen_at, frozen_by)
     values ($1,$2,1,'imported','frozen',$3,$4,$5)`,
    [v1Id, projectId, v1.versionId, now.toISOString(), JSON.stringify({ kind: "system", label: "showcase-seed" })],
  );
  await db.query(
    `insert into drafts (id, project_id, n, origin, state, promoted_version_id, base_draft_id)
     values ($1,$2,2,'duplicate','working',$3,$4)`,
    [v2Id, projectId, v2.versionId, v1Id],
  );

  // the delivered full-board review run (fixture: precomputed, $0 — spent/estimate are the card's
  // derived figures so the dossier's run card shows a believable actual-vs-estimate).
  await db.query(
    `insert into runs (id, workspace_id, project_id, workflow, state, inputs, input_snapshot,
                       model_profile, model_tier, rigor, estimate_credits, cap_credits, spent_credits,
                       rate_table_version, requested_by, started_at, ended_at)
     values ($1,$2,$3,'review','completed',$4,$5,'full_board','frontier','full_board',3900,5850,3860,1,$6,$7,$8)`,
    [
      runId, deps.workspaceId, projectId,
      JSON.stringify({ draftId: v1Id }),
      JSON.stringify({ wordCount: 540, claimCount: SHOWCASE_FIXTURE_CLAIMS.length }),
      deps.ownerId, now.toISOString(), now.toISOString(),
    ],
  );
  // all seven review phases committed (the dossier's run card derives its step row from these).
  const phases = ["intake", "craft", "verification", "discourse", "second_read", "argument", "letter"];
  for (let i = 0; i < phases.length; i++) {
    await db.query(
      `insert into steps (id, run_id, phase, ordinal, state, started_at, ended_at, credits)
       values ($1,$2,$3,$4,'done',$5,$6,$7)`,
      [deps.ids(), runId, phases[i], i + 1, now.toISOString(), now.toISOString(), [120, 310, 1720, 480, 390, 420, 320][i] ?? 0],
    );
  }
  // the cited⇒fetched audit: every fixture source URL reads as an allowed fetch.
  for (const url of [SCOTLAND_URL, LINKROT_URL, ARCHIVE_URL]) {
    await db.query(
      `insert into fetch_log (run_id, ts, agent_label, kind, url, normalized_url, status, bytes, decision)
       values ($1,$2,'editor','fetch',$3,$3,200,8192,'allow')`,
      [runId, now.toISOString(), url],
    );
  }
  await db.query(
    `insert into access_log (run_id, ts, agent_label, tool, path, namespace, decision)
     values ($1,$2,'editor','read','drafts/v1.md','author','allow'),
            ($1,$2,'editor','read','agents/author/outline/showcase.md','author','allow')`,
    [runId, now.toISOString()],
  );

  // the review correspondence (the dossier's anchor) + the author's response on v2.
  await db.query(
    `insert into correspondence_items (id, project_id, kind, draft_id, run_id, ordinal, delivered_at,
                                       artifact_ids, rubric, verdict, protocol_id, protocol_version)
     values ($1,$2,'review',$3,$4,1,$5,$6,$7,'revise','essay',1)`,
    [corrId, projectId, v1Id, runId, now.toISOString(), [letter.versionId],
     JSON.stringify(SHOWCASE_FIXTURE_RUBRIC)],
  );
  await db.query(
    `insert into correspondence_items (id, project_id, kind, draft_id, run_id, ordinal, delivered_at,
                                       artifact_ids, prior_review_id)
     values ($1,$2,'response',$3,$4,1,$5,$6,$7)`,
    [respId, projectId, v2Id, runId, now.toISOString(), [response.versionId], corrId],
  );

  // the claim ledger.
  let firstFindingId = "";
  for (let i = 0; i < SHOWCASE_FIXTURE_CLAIMS.length; i++) {
    const c = SHOWCASE_FIXTURE_CLAIMS[i]!;
    const claimId = deps.ids();
    const claimSources = "sources" in c ? c.sources : undefined;
    await db.query(
      `insert into claims (id, correspondence_id, draft_id, ordinal, text, tier, verdict, kind, note,
                           source_check, accessed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        claimId, corrId, v1Id, i, c.text, c.tier, c.verdict, c.kind,
        "note" in c ? c.note : null,
        "sourceCheck" in c ? c.sourceCheck : null, now.toISOString(),
      ],
    );
    for (let j = 0; j < (claimSources?.length ?? 0); j++) {
      const s = claimSources![j]!;
      await db.query(
        `insert into claim_sources (claim_id, ordinal, url, normalized_url, accessed_at, stance, note)
         values ($1,$2,$3,$3,$4,$5,$6)`,
        [claimId, j, s.url, now.toISOString(), s.stance, "note" in s ? s.note : null],
      );
    }
  }

  // the findings (the dossier's cards; ordinal 0 is the contradicted tier-1 anchor).
  for (let i = 0; i < SHOWCASE_FIXTURE_FINDINGS.length; i++) {
    const f = SHOWCASE_FIXTURE_FINDINGS[i]!;
    const findingId = deps.ids();
    if (i === 0) firstFindingId = findingId;
    await db.query(
      `insert into findings (id, correspondence_id, draft_id, ordinal, kind, severity, origin,
                             reconciliation, title, body, evidence, suggestion, rubric_dims, letter_section)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        findingId, corrId, v1Id, i, f.kind, f.severity, f.origin,
        "reconciliation" in f ? f.reconciliation : null,
        f.title, f.body,
        "evidence" in f
          ? JSON.stringify({
              ...f.evidence,
              urls: f.evidence.urls.map((u) => ({ url: u.url, accessed: now.toISOString() })),
            })
          : null,
        "suggestion" in f ? JSON.stringify(f.suggestion) : null,
        [...f.rubricDims], f.letterSection,
      ],
    );
    // the triage ledger: blocking/major findings open obligations (the two the response resolved are
    // marked discharged so the response letter's accounting is real).
    if (f.severity === "blocking" || f.severity === "major") {
      const discharged = i === 0 || i === 1; // v2 carries both corrections
      await db.query(
        `insert into revision_obligations (id, project_id, source, finding_id, severity, kind, title,
                                           state, state_since, opened_on_draft_id, created_by, closed_at, discharged_by)
         values ($1,$2,'finding',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          deps.ids(), projectId, findingId, f.severity, f.kind, f.title,
          discharged ? "discharged" : "open", now.toISOString(), v1Id,
          JSON.stringify({ kind: "system", label: "showcase-seed" }),
          discharged ? now.toISOString() : null,
          discharged ? JSON.stringify({ kind: "disposition", at: now.toISOString(), via: "response" }) : null,
        ],
      );
    }
  }

  void outline; // the outline artifact exists for the Files pane + story completeness.

  return { projectId, slug, reviewRunId: runId, reviewCorrId: corrId, firstFindingId };
}
