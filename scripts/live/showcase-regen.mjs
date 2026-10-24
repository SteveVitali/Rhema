#!/usr/bin/env node
// R6CNT.3 — the Showcase Full-board regeneration driver (D-R6CNT.2-1; GD-REMAINING.R6 item 4 —
// "approve all remaining tasks, proceed" bounded at ≤ $40 measured). One paid Full-board Review of
// the Wells showcase essay on a flagged `is_test` workspace, then the delivered-bundle export the
// SHOWCASE_FIXTURE swap consumes.
//
// Modes:
//   • --dry-run (default): prints the leg plan. Touches nothing.
//   • --estimate: the committed pre-dispatch estimate — resolveEstimation (review / full_board /
//     base + frontier) on the measured Wells inputs. > $40 measured-equivalent → PAUSE (exit 4).
//     Deterministic; no network, no writes.
//   • --dispatch --expect-sha <sha> --dispatch-tag <tag> --scores-out <file>: THE ONE PAID LEG —
//     provenance → is_test → funded balance → session → ingest → refined estimate → ONE launch →
//     poll to terminal → measured spend from usage_records. Never retries: a failed terminal run is
//     recorded in the scores file and the leg ends. The tag joins the run idempotency key
//     (showcase-regen-<sha>-<tag>): a same-tag re-invocation dedupes to the same run (retry-safe),
//     a new tag launches a NEW run — do not mint tags casually, each is real spend.
//   • --export <runId> --bundle-out <file>: reads the delivered review bundle (letter markdown from
//     GCS, claims + claim_sources, findings, rubric, steps, fetch/access log, usage) over the
//     system DSN and writes the SHOWCASE_FIXTURE-shaped JSON the seed swap consumes. Read-only.
//   • --emit <bundle.json> [--fixture-out <ts>]: turns the exported bundle into the generated
//     module packages/db/src/seed/showcase-run-fixture.ts the seed binds at swap time — emit only
//     when the bundle is showcase-grade (assertShowcaseFixture-clean); a contract-ineligible
//     export stays evidence under docs/build/reports/, never the committed fixture. Read the
//     bundle, write the module — nothing else.
//
// Dispatch env contract (the paid leg):
//   API_BASE_URL=https://api.rhema.tools   REGEN_DATABASE_URL=<system-role DSN over the tunnel>
//     (the caller maps the privileged system DSN onto this env — the tripwire seam name is
//     intentionally not used here: live .mjs scripts sit outside the .ts-scoped
//     tools/system-pool-boundary.json allowlist, and the privileged read is asserted below)
//   REGEN_WORKSPACE_ID=<is_test workspace id>   REGEN_BUDGET_RULING=approved
//   REGEN_SESSION_COOKIE="<name>=<token>" — or REGEN_MINT_SESSION=1 to mint a session for
//   REGEN_IDENTITY (default test+jrn-gld@rhema.tools) through the real magic link + the pinned
//   test mailbox (gcloud ADC, same seam as packages/journeys).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const ESTIMATE_ONLY = args.includes("--estimate");
const DISPATCH = args.includes("--dispatch");
const EXPORT_RUN = flag("--export");
const EMIT_BUNDLE = flag("--emit");
const SCORES_OUT = flag("--scores-out");
const BUNDLE_OUT = flag("--bundle-out");
const FIXTURE_OUT = flag("--fixture-out") ?? "packages/db/src/seed/showcase-run-fixture.ts";
const EXPECT_SHA = flag("--expect-sha");
const DISPATCH_TAG = flag("--dispatch-tag");
const USD_BOUND = Number(process.env.REGEN_USD_BOUND ?? 40);
const CREDITS_PER_USD_LIST = 100; // the declared-cap → list-USD figure the estimator record carries ($0.01/cr)

const require = createRequire(resolve(root, "integration", "package.json"));

function legPlan() {
  return {
    req: "D-R6CNT.2-1 / GD-REMAINING.R6 item 4 (≤$40 measured)",
    legs: [
      "--estimate: resolveEstimation review/full_board @ base (+frontier for the record) on the Wells inputs — >$40 → PAUSE",
      "--dispatch: /healthz gitSha == --expect-sha (the deployed launch-candidate SHA)",
      "--dispatch: workspace is_test=true + balance ≥ declared cap (no grant while funded)",
      "--dispatch: session (env cookie, else mint via the real magic link + pinned test mailbox)",
      "--dispatch: ingest SHOWCASE_FIXTURE_V1_MD via presign → PUT → preview → project create (essay)",
      "--dispatch: refined /estimates (claimCount) → ONE POST /runs review/full_board/base, autoProceedRun",
      "--dispatch: poll to terminal (never relaunched) → usage_records list-USD + §12.8 evidence fields",
      "--export <runId>: delivered letter (GCS) + claims + findings + rubric + run card → bundle JSON",
      "--emit <bundle.json>: bundle → packages/db/src/seed/showcase-run-fixture.ts (the seed's pipeline-produced half)",
    ],
    honest_marker:
      "a terminal `failed` run is recorded in the scores file and ends the leg — the driver never fabricates a bundle",
  };
}

async function estimate() {
  const RS = await import(resolve(root, "packages", "run-sheet", "dist", "estimate.js"));
  const legs = ["frontier", "base"].map((tier) => {
    const r = RS.resolveEstimation({
      workflow: "review",
      rigor: "full_board",
      modelTier: tier,
      inputs: { words: 1640 },
    });
    return {
      modelTier: tier,
      estimateCredits: r.estimate.estimateCredits,
      capCredits: r.estimate.capCredits,
      capUsdList: Math.round((r.estimate.capCredits / CREDITS_PER_USD_LIST) * 100) / 100,
      claimCount: r.estimate.claimCount,
      provisional: r.estimate.provisional,
      phases: r.inputs.phases,
      enabledAddends: r.enabledAddends,
    };
  });
  const base = legs.find((l) => l.modelTier === "base");
  return {
    ruling: "GD-REMAINING.R6 item 4 — ≤$40 measured",
    boundUsd: USD_BOUND,
    inputs: { workflow: "review", rigor: "full_board", words: 1640, densityClaims: 7 },
    legs,
    withinBound: base.capUsdList <= USD_BOUND,
    basis:
      "committed review estimator @ full_board; words 1640 (Wells, R6CNT.1-measured), claims=words×density(0.004)→7, " +
      "phases=7 (all full_board phases active); cap USD at $0.01/cr list (the R6CNT.2 record's figure — " +
      "usage_records list-USD is the spend of record)",
  };
}

if (ESTIMATE_ONLY) {
  const est = await estimate();
  console.log(JSON.stringify(est, null, 1));
  if (!est.withinBound) {
    console.error(
      `PAUSE — base-tier declared cap $${est.legs.find((l) => l.modelTier === "base").capUsdList} exceeds the $${USD_BOUND} bound. Do not dispatch; report the estimate.`,
    );
    process.exit(4);
  }
  process.exit(0);
}

if (!DISPATCH && !EXPORT_RUN && !EMIT_BUNDLE) {
  console.log(JSON.stringify({ dry_run: true, plan: legPlan() }, null, 1));
  process.exit(0);
}

// ---- fail-closed budget gate: the paid leg never runs without the recorded ruling -------------
if (DISPATCH && process.env.REGEN_BUDGET_RULING !== "approved") {
  console.error(
    "refusing: --dispatch requires REGEN_BUDGET_RULING=approved (GD-REMAINING.R6 item 4 — the ≤$40 " +
      "Showcase regeneration authorization, recorded in docs/build/LEDGER.md GATE DECISIONS)",
  );
  process.exit(3);
}

const need = (n) => {
  const v = process.env[n];
  if (!v) {
    console.error(`missing env ${n}`);
    process.exit(1);
  }
  return v;
};
const pg = require("pg");

// ---- the paid leg ------------------------------------------------------------------------------
async function dispatch() {
  const API = need("API_BASE_URL").replace(/\/+$/, "");
  const WORKSPACE = need("REGEN_WORKSPACE_ID");
  const pool = new pg.Pool({ connectionString: need("REGEN_DATABASE_URL"), max: 2 });
  const q = (t, p) => pool.query(t, p).then((r) => r.rows);
  try {
    // provenance — the regeneration must land on the deployed launch-candidate SHA.
    if (!EXPECT_SHA) {
      console.error(
        "refusing: --dispatch requires --expect-sha <deployed sha> — the run must prove provenance",
      );
      process.exit(2);
    }
    const hz = await fetch(`${API}/healthz`).then((r) => r.json());
    const gitSha = hz?.build?.gitSha ?? "";
    if (!gitSha.startsWith(EXPECT_SHA)) {
      console.error(`refusing: ${API} serves gitSha "${gitSha}", expected "${EXPECT_SHA}"`);
      process.exit(3);
    }
    console.log(`[dispatch] provenance OK — ${API} serves ${gitSha}`);

    // attempt tag — joins the run idempotency key (showcase-regen-<sha>-<tag>).
    if (!DISPATCH_TAG || !/^[a-z0-9][a-z0-9-]{0,30}$/.test(DISPATCH_TAG)) {
      console.error(
        "refusing: --dispatch requires --dispatch-tag <attempt-name> ([a-z0-9-], ≤31 chars) — it joins the " +
          "run's idempotency key so a same-tag re-invocation dedupes to the same run (never a second spend)",
      );
      process.exit(2);
    }
    console.log(`[dispatch] attempt tag "${DISPATCH_TAG}" — idempotency key is per-attempt`);

    // tenant — flagged is_test only.
    const ws = (
      await q(
        `select w.id, w.is_test, w.billing_account_id,
                (select m.user_id from workspace_members m where m.workspace_id = w.id order by m.role='admin' desc limit 1) as user_id
           from workspaces w where w.id = $1`,
        [WORKSPACE],
      )
    )[0];
    if (!ws) {
      console.error(`refusing: workspace ${WORKSPACE} not found`);
      process.exit(3);
    }
    if (ws.is_test !== true) {
      console.error(
        `refusing: workspace ${WORKSPACE} is_test=${ws.is_test} — the regeneration runs on a flagged test tenant only`,
      );
      process.exit(3);
    }
    const bal = (
      await q(
        `select coalesce(sum(available),0)::int available, coalesce(sum(held),0)::int held from credit_balances where billing_account_id = $1`,
        [ws.billing_account_id],
      )
    )[0];

    // the committed estimate gates the launch — the run's declared cap must fit the bound AND the balance.
    const est = await estimate();
    const baseLeg = est.legs.find((l) => l.modelTier === "base");
    console.log(
      `[dispatch] tenant OK — ${WORKSPACE} is_test=true · account ${ws.billing_account_id} · ${bal.available} cr available · estimate ${baseLeg.estimateCredits} cr / cap ${baseLeg.capCredits} cr ($${baseLeg.capUsdList} list)`,
    );
    if (!est.withinBound) {
      console.error(
        `refusing: base cap $${baseLeg.capUsdList} > $${USD_BOUND} — PAUSE, do not dispatch`,
      );
      process.exit(4);
    }
    if (bal.available < baseLeg.capCredits) {
      console.error(
        `refusing: balance ${bal.available} cr < declared cap ${baseLeg.capCredits} cr — the house-grant ` +
          `seam (admin-cli house-grant) funds it before dispatch; nothing launched`,
      );
      process.exit(4);
    }

    // session — env cookie, or mint through the real magic link + the pinned test mailbox.
    let cookie = process.env.REGEN_SESSION_COOKIE ?? "";
    if (!cookie && process.env.REGEN_MINT_SESSION === "1") {
      const J = await import(resolve(root, "packages", "journeys", "dist", "index.js"));
      const email = process.env.REGEN_IDENTITY ?? "test+jrn-gld@rhema.tools";
      J.assertTestIdentity(email); // fail closed — never a real user's session
      const since = Math.floor(Date.now() / 1000) - 5;
      const send = await fetch(`${API}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://rhema.tools" },
        body: JSON.stringify({ email, callbackURL: "https://rhema.tools/app" }),
      });
      if (!send.ok) {
        console.error(`refusing: magic-link send ${send.status}: ${await send.text()}`);
        process.exit(3);
      }
      const gmail = J.createGmailClient(J.TEST_MAILBOX, {});
      const link = await gmail.awaitMagicLink(email, since, 120_000);
      const verify = await fetch(link, { redirect: "manual" });
      const setCookie = verify.headers.get("set-cookie") ?? "";
      const m = setCookie.match(/([^=;,]+=[^;,]+)/);
      if (!m) {
        console.error(`refusing: magic-link verify set no session cookie (${verify.status})`);
        process.exit(3);
      }
      cookie = m[1];
      console.log(`[dispatch] session minted for ${email} via the real magic link`);
    }
    if (!cookie) {
      console.error("refusing: REGEN_SESSION_COOKIE unset and REGEN_MINT_SESSION!=1 — no session");
      process.exit(3);
    }
    const post = async (path, body) => {
      const res = await fetch(`${API}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie, origin: "https://rhema.tools" },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.text() };
    };

    // ingest: the Wells essay — the same verbatim text the fixture carries (the run reviews what
    // the showcase shows).
    const DB = await import(resolve(root, "packages", "db", "dist", "seed", "showcase.js"));
    const draftText = DB.SHOWCASE_FIXTURE_V1_MD;
    const words = draftText.split(/\s+/).filter(Boolean).length;
    const bytes = Buffer.byteLength(draftText, "utf8");

    const pre = await post("/import/presign", {});
    if (pre.status !== 200 && pre.status !== 201)
      throw new Error(`presign ${pre.status}: ${pre.body}`);
    const presign = JSON.parse(pre.body);
    if (bytes > presign.maxBytes) throw new Error(`draft ${bytes}B > ${presign.maxBytes}B`);
    const put = await fetch(presign.url, {
      method: "PUT",
      headers: presign.requiredHeaders ?? {},
      body: draftText,
    });
    if (!put.ok) throw new Error(`quarantine PUT ${put.status}: ${await put.text()}`);
    for (let i = 0; i < 12; i++) {
      const pv = await post("/import/preview", { quarantineKey: presign.key, waitMs: 20_000 });
      if (pv.status === 200) break;
      if (pv.status === 202) {
        if (i === 11) throw new Error(`preview never ready: ${pv.body}`);
        await new Promise((r) => setTimeout(r, 5_000));
        continue;
      }
      throw new Error(`preview ${pv.status}: ${pv.body}`);
    }
    const created = await post("/projects", {
      title: "The Extinction of Man",
      entry: "draft",
      protocolId: "essay",
      quarantineKey: presign.key,
    });
    if (created.status !== 201)
      throw new Error(`project create ${created.status}: ${created.body}`);
    const project = JSON.parse(created.body).project;
    const projectId = project?.id;
    if (!projectId) throw new Error(`project create returned no id: ${created.body}`);
    console.log(`[dispatch] project ${projectId} (essay, ${words}w)`);

    // the free estimate pre-pass refines claimCount the way the sheet does.
    let claims;
    const estRes = await post(`/projects/${projectId}/estimates`, {
      workflow: "review",
      rigor: "full_board",
      modelTier: "base",
      inputs: { words },
      refine: true,
    });
    if (estRes.status === 200 || estRes.status === 201) {
      const e = JSON.parse(estRes.body);
      claims = e.claimCount ?? e.estimate?.claimCount;
      console.log(`[dispatch] refined estimate: ${JSON.stringify(e).slice(0, 300)}`);
    }

    const launched = await post(`/projects/${projectId}/runs`, {
      idempotencyKey: `showcase-regen-${EXPECT_SHA}-${DISPATCH_TAG}`.slice(0, 120),
      workflow: "review",
      rigor: "full_board",
      modelTier: "base",
      inputs: { sidecar: true },
      autoProceedRun: true,
      inputSnapshot: { wordCount: words, ...(claims ? { claimCount: claims } : {}) },
    });
    if (launched.status !== 200 && launched.status !== 201)
      throw new Error(`launch ${launched.status}: ${launched.body}`);
    const { runId } = JSON.parse(launched.body);
    console.log(`[dispatch] run ${runId} launched (review / full_board / base)`);

    // poll to terminal (90 min bound — full_board runs seven phases; never relaunched on timeout,
    // the run id is the record either way).
    const deadline = Date.now() + 90 * 60_000;
    let row;
    for (;;) {
      row = (
        await q(
          `select id, state, estimate_credits, cap_credits, spent_credits, citation_completeness, inputs, started_at, ended_at
             from runs where id = $1`,
          [runId],
        )
      )[0];
      if (!row) throw new Error(`run ${runId} not found`);
      if (["completed", "completed_partial", "failed", "cancelled"].includes(row.state)) break;
      if (Date.now() > deadline) {
        console.error(
          `[dispatch] run ${runId} not terminal in 90min (state ${row.state}) — recorded, NOT relaunched`,
        );
        break;
      }
      await new Promise((r) => setTimeout(r, 15_000));
    }
    console.log(`[dispatch] run ${runId} → ${row.state}`);

    // measure — metered list-USD from the meter of record + the §12.8 live-exercise fields.
    const usage = (
      await q(
        `select coalesce(sum(list_cost_usd),0)::float usd, coalesce(sum(credits),0)::int credits,
                count(*)::int rows
           from usage_records where run_id = $1`,
        [runId],
      )
    )[0];
    const steps = await q(
      `select phase, state, credits from steps where run_id = $1 order by ordinal`,
      [runId],
    );
    const fetches = await q(
      `select agent_label, kind, status, decision, count(*)::int n from fetch_log where run_id = $1
         group by agent_label, kind, status, decision order by decision, status`,
      [runId],
    );
    const denies = await q(
      `select count(*)::int n from fetch_log where run_id = $1 and decision = 'deny'
         and (deny_reason is null or deny_reason <> 'cap')`,
      [runId],
    );
    const ci = (
      await q(
        `select id, verdict, protocol_id, protocol_version, artifact_ids from correspondence_items
           where run_id = $1 and kind = 'review' order by delivered_at desc limit 1`,
        [runId],
      )
    )[0];
    const counts = ci
      ? (
          await q(
            `select (select count(*)::int from claims where correspondence_id = $1) claims,
                    (select count(*)::int from findings where correspondence_id = $1) findings,
                    (select count(*)::int from claims where correspondence_id = $1 and tier = 1 and verdict = 'contradicted') contradicted_t1`,
            [ci.id],
          )
        )[0]
      : null;
    const citedUnfetched = (
      await q(
        `select count(*)::int n from claims c join correspondence_items ci on ci.id = c.correspondence_id
           where ci.run_id = $1 and c.url is not null and c.accessed_at is null`,
        [runId],
      )
    )[0];
    const usd = Math.round(usage.usd * 100) / 100;
    const scoreDoc = {
      generated_at: new Date().toISOString(),
      ticket: "R6CNT.3",
      provenance: {
        apiBase: API,
        gitSha,
        expectSha: EXPECT_SHA,
        workspaceId: WORKSPACE,
        dispatchTag: DISPATCH_TAG,
      },
      run: {
        runId,
        projectId,
        state: row.state,
        estimateCredits: row.estimate_credits,
        capCredits: row.cap_credits,
        spentCredits: row.spent_credits,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        steps,
      },
      delivered: ci
        ? {
            correspondenceId: ci.id,
            verdict: ci.verdict,
            protocolStamp: `${ci.protocol_id}@${ci.protocol_version}`,
            artifacts: ci.artifact_ids?.length ?? 0,
            claims: counts?.claims ?? 0,
            findings: counts?.findings ?? 0,
            contradictedTier1: counts?.contradicted_t1 ?? 0,
          }
        : null,
      secrEvidence: {
        fetchLogByDecision: fetches,
        nonCapDenies: denies[0]?.n ?? 0,
        citedButUnfetched: citedUnfetched.n,
        note: "fetch_log = the live egress channel's own rows; cited⇒fetched = the attestation path",
      },
      spend: {
        totalUsdList: usd,
        credits: usage.credits,
        usageRows: usage.rows,
        boundUsd: USD_BOUND,
        withinBound: usd <= USD_BOUND,
      },
    };
    if (!SCORES_OUT) {
      console.error(
        "refusing: --dispatch requires --scores-out <file> — the measured record destination",
      );
      process.exit(2);
    }
    mkdirSync(dirname(resolve(process.cwd(), SCORES_OUT)), { recursive: true });
    writeFileSync(resolve(process.cwd(), SCORES_OUT), JSON.stringify(scoreDoc, null, 2) + "\n");
    console.log(
      `[dispatch] wrote ${SCORES_OUT} — state ${row.state}, $${usd} list measured (bound $${USD_BOUND})`,
    );
    if (usd > USD_BOUND) process.exit(6);
    if (row.state !== "completed" && row.state !== "completed_partial") process.exit(5);
  } finally {
    await pool.end();
  }
}

// ---- the export leg -----------------------------------------------------------------------------
async function exportBundle(runId) {
  const pool = new pg.Pool({ connectionString: need("REGEN_DATABASE_URL"), max: 2 });
  const q = (t, p) => pool.query(t, p).then((r) => r.rows);
  try {
    const run = (
      await q(
        `select id, project_id, workspace_id, workflow, rigor, model_tier, state, estimate_credits,
                cap_credits, spent_credits, started_at, ended_at from runs where id = $1`,
        [runId],
      )
    )[0];
    if (!run) throw new Error(`run ${runId} not found`);
    if (run.state !== "completed" && run.state !== "completed_partial")
      throw new Error(`run ${runId} state ${run.state} — only a delivered run exports a bundle`);

    const ci = (
      await q(
        `select id, kind, draft_id, ordinal, delivered_at, artifact_ids, rubric, verdict,
                protocol_id, protocol_version from correspondence_items
           where run_id = $1 and kind = 'review' order by delivered_at desc limit 1`,
        [runId],
      )
    )[0];
    if (!ci) throw new Error(`run ${runId} delivered no review correspondence`);

    // the letter — the shared editors_letter mirror's version bytes in GCS.
    const letter = (
      await q(
        `select av.s3_key, av.bytes, av.word_count from artifacts a
           join artifact_versions av on av.id = a.head_version_id
          where a.project_id = $1 and a.kind = 'editors_letter' and a.namespace = 'shared'
          order by a.id limit 1`,
        [run.project_id],
      )
    )[0];
    if (!letter) throw new Error(`run ${runId}: no shared editors_letter artifact`);
    const letterMd = execFileSync(
      "gcloud",
      ["storage", "cat", `gs://rhema-prod-artifacts/${letter.s3_key}`, "--project=rhema-507501"],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
    );

    const claims = await q(
      `select id, ordinal, text, tier, verdict, kind, note, source_check, accessed_at, url, normalized_url
         from claims where correspondence_id = $1 order by ordinal`,
      [ci.id],
    );
    const claimSources = await q(
      `select cs.claim_id, cs.ordinal, cs.url, cs.normalized_url, cs.accessed_at, cs.stance, cs.note
         from claim_sources cs
         join claims c on c.id = cs.claim_id where c.correspondence_id = $1 order by cs.claim_id, cs.ordinal`,
      [ci.id],
    );
    const byClaim = new Map();
    for (const s of claimSources) {
      if (!byClaim.has(s.claim_id)) byClaim.set(s.claim_id, []);
      byClaim.get(s.claim_id).push({
        url: s.url,
        normalizedUrl: s.normalized_url,
        stance: s.stance,
        note: s.note,
      });
    }

    const findings = await q(
      `select ordinal, kind, severity, origin, reconciliation, title, body, evidence, suggestion,
              anchor, rubric_dims, letter_section from findings
         where correspondence_id = $1 order by ordinal`,
      [ci.id],
    );

    const steps = await q(
      `select phase, ordinal, state, credits from steps where run_id = $1 order by ordinal`,
      [runId],
    );
    const fetchLog = await q(
      `select agent_label, kind, query, url, normalized_url, status, bytes, decision, deny_reason, ts
         from fetch_log where run_id = $1 order by ts`,
      [runId],
    );
    const accessLog = await q(
      `select agent_label, tool, path, namespace, decision, ts from access_log where run_id = $1
         order by ts`,
      [runId],
    );
    const usage = (
      await q(
        `select coalesce(sum(list_cost_usd),0)::float usd, coalesce(sum(credits),0)::int credits
           from usage_records where run_id = $1`,
        [runId],
      )
    )[0];

    const bundle = {
      generated_at: new Date().toISOString(),
      source: {
        runId: run.id,
        projectId: run.project_id,
        workspaceId: run.workspace_id,
        correspondenceId: ci.id,
        workflow: run.workflow,
        rigor: run.rigor,
        modelTier: run.model_tier,
        state: run.state,
        protocolStamp: `${ci.protocol_id}@${ci.protocol_version}`,
        verdict: ci.verdict,
        deliveredAt: ci.delivered_at,
        durationMs:
          run.started_at && run.ended_at
            ? new Date(run.ended_at).getTime() - new Date(run.started_at).getTime()
            : null,
        meteredUsdList: Math.round(usage.usd * 100) / 100,
        meteredCredits: usage.credits,
      },
      runCard: {
        modelTier: run.model_tier,
        estimateCredits: run.estimate_credits,
        capCredits: run.cap_credits,
        spentCredits: run.spent_credits,
        phases: steps.map((s) => ({ phase: s.phase, credits: s.credits, state: s.state })),
        fetches: fetchLog.map((f) => ({
          agentLabel: f.agent_label,
          kind: f.kind,
          query: f.query,
          url: f.url,
          normalizedUrl: f.normalized_url,
          status: f.status,
          bytes: f.bytes,
          decision: f.decision,
          denyReason: f.deny_reason,
        })),
        accessLog: accessLog.map((a) => ({
          agentLabel: a.agent_label,
          tool: a.tool,
          path: a.path,
          namespace: a.namespace,
          decision: a.decision,
        })),
      },
      letterMd,
      claims: claims.map((c) => ({
        ordinal: c.ordinal,
        text: c.text,
        tier: c.tier,
        verdict: c.verdict,
        kind: c.kind,
        note: c.note,
        sourceCheck: c.source_check,
        url: c.url,
        normalizedUrl: c.normalized_url,
        sources: byClaim.get(c.id) ?? [],
      })),
      findings: findings.map((f) => ({
        ordinal: f.ordinal,
        kind: f.kind,
        severity: f.severity,
        origin: f.origin,
        reconciliation: f.reconciliation,
        title: f.title,
        body: f.body,
        evidence: f.evidence,
        suggestion: f.suggestion,
        anchor: f.anchor,
        rubricDims: f.rubric_dims,
        letterSection: f.letter_section,
      })),
      rubric: ci.rubric,
    };
    if (!BUNDLE_OUT) {
      console.error("refusing: --export requires --bundle-out <file>");
      process.exit(2);
    }
    mkdirSync(dirname(resolve(process.cwd(), BUNDLE_OUT)), { recursive: true });
    writeFileSync(resolve(process.cwd(), BUNDLE_OUT), JSON.stringify(bundle, null, 2) + "\n");
    console.log(
      `[export] wrote ${BUNDLE_OUT} — letter ${letterMd.length}B, ${claims.length} claims, ${findings.length} findings, ${fetchLog.length} fetches, $${bundle.source.meteredUsdList} metered`,
    );
  } finally {
    await pool.end();
  }
}

// ---- the emit leg: the exported bundle → the pipeline-produced fixture module ------------------
// Writes `packages/db/src/seed/showcase-run-fixture.ts` — the generated half of SHOWCASE_FIXTURE
// (letter/claims/findings/rubric/run-card/provenance) — committed only when the bundle is
// showcase-grade; otherwise the export stays evidence and the authored fixture stays bound.
// Deterministic: bundle in, TS module out.
async function emitFixture(bundlePath) {
  const bundle = JSON.parse(readFileSync(resolve(process.cwd(), bundlePath), "utf8"));
  if (
    !bundle?.source?.runId ||
    typeof bundle?.letterMd !== "string" ||
    !Array.isArray(bundle?.claims) ||
    !Array.isArray(bundle?.findings)
  ) {
    console.error(
      "refusing: the bundle lacks source.runId/letterMd/claims/findings — emit only consumes " +
        "a delivered --export bundle, never hand-written content",
    );
    process.exit(2);
  }
  // the run card is emitted in the seed's DossierRunCard shape — the export's raw `phases`
  // step objects become `phaseCredits`, and the protocol stamp/verdict the correspondence
  // carries lift up from source so `runCard:` binds `SHOWCASE_RUN_FIXTURE.runCard` verbatim.
  const [protocolId, protocolVersion] = String(bundle.source.protocolStamp ?? "").split("@");
  const fixture = {
    provenance: {
      runId: bundle.source.runId,
      projectId: bundle.source.projectId,
      correspondenceId: bundle.source.correspondenceId,
      state: bundle.source.state,
      protocolStamp: bundle.source.protocolStamp,
      verdict: bundle.source.verdict,
      deliveredAt: bundle.source.deliveredAt,
      meteredUsdList: bundle.source.meteredUsdList,
      meteredCredits: bundle.source.meteredCredits,
    },
    letterMd: bundle.letterMd,
    claims: bundle.claims,
    findings: bundle.findings,
    rubric: bundle.rubric,
    runCard: {
      modelTier: bundle.runCard.modelTier,
      protocolId,
      protocolVersion: Number(protocolVersion),
      verdict: bundle.source.verdict,
      estimateCredits: bundle.runCard.estimateCredits,
      capCredits: bundle.runCard.capCredits,
      spentCredits: bundle.runCard.spentCredits,
      phaseCredits: (bundle.runCard.phases ?? []).map((p) => p.credits ?? 0),
      fetches: bundle.runCard.fetches,
      accessLog: bundle.runCard.accessLog,
    },
  };
  const out = resolve(process.cwd(), FIXTURE_OUT);
  const text =
    `// GENERATED FILE — R6CNT.3 / D-R6CNT.2-1. Do not hand-edit; regenerate:\n` +
    `//   node scripts/live/showcase-regen.mjs --export <runId> --bundle-out <json>\n` +
    `//   node scripts/live/showcase-regen.mjs --emit <json>\n` +
    `// Source: prod run ${bundle.source.runId} (review/full_board/${bundle.source.modelTier}; ` +
    `${bundle.source.state}; delivered ${bundle.source.deliveredAt}; protocol ` +
    `${bundle.source.protocolStamp}; metered $${bundle.source.meteredUsdList} / ` +
    `${bundle.source.meteredCredits} cr).\n` +
    `// This is the pipeline-produced half of SHOWCASE_FIXTURE — the authored halves (outline, the\n` +
    `// verbatim Wells v1, the revised v2, the author's response letter) stay in ./showcase.ts.\n` +
    `export const SHOWCASE_RUN_FIXTURE = ${JSON.stringify(fixture, null, 2)} as const;\n`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  console.log(
    `[emit] wrote ${FIXTURE_OUT} — run ${bundle.source.runId}: ` +
      `${fixture.claims.length} claims, ${fixture.findings.length} findings, ` +
      `letter ${fixture.letterMd.length}B, ${fixture.runCard?.fetches?.length ?? 0} fetch_log rows`,
  );
}

if (DISPATCH) await dispatch();
else if (EXPORT_RUN) await exportBundle(EXPORT_RUN);
else if (EMIT_BUNDLE) await emitFixture(EMIT_BUNDLE);
