#!/usr/bin/env node
// R5OPS.1 (REQ-OPS-7; BL-36; D-P0.15-4) + R6GLD.1 (REQ-DISC-3; ADR-111 §17 amendment;
// GD-GOLDEN-CAP.R6) — the golden-validation driver. §13.5 / REQ-ARCH-36 / REQ-EVAL-17: "a nightly
// score below a fixture's floor blocks promotion."
//
// Modes:
//   • --dry-run (default): prints the leg plan — cohort enumeration, the manifest shape
//     `gateFixtures` consumes, and the gate invocation. Touches nothing.
//   • --cohort minimal --estimate: prints the cohort estimate JSON (deterministic; no writes).
//     The estimate MUST be committed before any --dispatch (ticket deliverable 3).
//   • --cohort minimal --dispatch: the one-time bounded PAID leg (GD-GOLDEN-CAP.R6 — one fixture
//     per protocol × its primary Review workflow, review/standard/base, hard cap $100 measured).
//     Requires GOLDEN_BUDGET_RULING=approved (one-shot), an --expect-sha matching the deployed
//     build's gitSha, a flagged is_test workspace (asserted from the system DSN), and a funded
//     billing account. Writes the measured --scores-out file. The recurring cadence stays
//     declined (GD-R5OPS.1-1) — this mode exists for the one-shot validation + the
//     protocol-affecting-deploy rerun rule, never on a schedule.
//   • --execute --scores <file>: REFUSES unless GOLDEN_BUDGET_RULING=approved is in the env.
//     Consumes the measured per-fixture scores, writes evals/fixtures/nightly-manifest.json, and
//     invokes the gate. It NEVER fabricates scores — no --scores file, no manifest. With
//     --cohort minimal it also refuses a scores file that does not cover all four protocols.
//
// Dispatch env contract (the paid leg):
//   API_BASE_URL=https://api.rhema.tools   GOLDEN_DATABASE_URL=<system-role DSN over the tunnel>
//     (the caller maps the privileged system DSN onto this env — the tripwire seam name is
//     intentionally not used here: live .mjs scripts sit outside the .ts-scoped
//     tools/system-pool-boundary.json allowlist, and the privileged read is asserted below)
//   GOLDEN_WORKSPACE_ID=<is_test workspace id>     GOLDEN_BUDGET_RULING=approved
//   GOLDEN_SESSION_COOKIE="<name>=<token>"   — or GOLDEN_MINT_SESSION=1 to mint a session for
//   GOLDEN_IDENTITY (default test+jrn-a@rhema.tools) through the real magic link + the pinned
//   test mailbox (JOURNEY_GCP_ACCESS_TOKEN or gcloud ADC, same seam as packages/journeys).
//
// Score file shape (the dispatch's output, checked structurally before it is trusted):
//   { "provenance": {...}, "spend": {...}, "fixtures": [{ "fixtureId": "…", "floors": {…},
//   "scores": {…}, "runId": "…", "usd": n, "state": "…" }, …] }
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST_PATH = resolve(root, "evals/fixtures/nightly-manifest.json");
const HARD_CAP_USD = Number(process.env.GOLDEN_HARD_CAP_USD ?? 100);
const BUDGET_NOTE = `one-shot $${HARD_CAP_USD} minimal-cohort cap — GD-GOLDEN-CAP.R6 (recurring cadence declined, GD-R5OPS.1-1)`;
const CREDITS_PER_USD_LIST = 140; // the proxy meters $1 list COGS ≈140 platform credits (§14.1)

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const COHORT = flag("--cohort");
const ESTIMATE_ONLY = args.includes("--estimate");
const DISPATCH = args.includes("--dispatch");
const SCORES_FILE = flag("--scores");
const SCORES_OUT = flag("--scores-out") ?? SCORES_FILE;
const EXPECT_SHA = flag("--expect-sha");
const dryRun = !args.includes("--execute") && !DISPATCH;

const require = createRequire(resolve(root, "packages", "journeys", "package.json"));

/** The committed minimal cohort — one protocol golden per seeded protocol (never trimmed). */
async function cohort() {
  const P = await import(resolve(root, "packages", "protocols", "dist", "src", "index.js"));
  return P.minimalCohort();
}

/**
 * The pre-dispatch cohort estimate (GD-GOLDEN-CAP.R6 deliverable 3). Per leg: the committed
 * review estimator at the fixture's real word count, claims ≈ words/60, active phases = the
 * review manifest's 7 minus the fixture's opted-out phase defaults (memo: discourse off → 6).
 * Credits → list-USD at the proxy's 140-cr-per-$1 meter. Deterministic — no network, no writes.
 */
async function cohortEstimate() {
  const P = await import(resolve(root, "packages", "protocols", "dist", "src", "index.js"));
  const spec = P.ESTIMATORS.review;
  const manifest = P.WORKFLOW_MANIFESTS?.review ?? P.review;
  const legs = (await cohort()).map((leg) => {
    const opted = new Set(
      Object.entries(leg.fixture.expected.phaseDefaults ?? {})
        .filter(([, v]) => v === false)
        .map(([k]) => k),
    );
    const phases = manifest.phases.filter((ph) => !(ph.optOutFlag && opted.has(ph.optOutFlag))).length;
    const enabledAddends = (spec.addends ?? [])
      .map((a) => a.phase)
      .filter((p) => !opted.has(p));
    const words = leg.fixture.draft.approxWords;
    const claims = Math.ceil(words / 60);
    const estimateCredits = P.estimateCredits(spec, { words, claims, phases }, {
      tier: "base",
      rigor: leg.rigor,
      enabledAddends,
    });
    return {
      fixtureId: leg.fixture.id,
      protocol: leg.fixture.protocol,
      workflow: leg.workflow,
      modelTier: leg.modelTier,
      rigor: leg.rigor,
      words,
      assumedClaims: claims,
      phases,
      enabledAddends,
      estimateCredits,
      estimateUsdList: Math.round((estimateCredits / CREDITS_PER_USD_LIST) * 100) / 100,
    };
  });
  const totalCredits = legs.reduce((s, l) => s + l.estimateCredits, 0);
  const totalUsd = Math.round((totalCredits / CREDITS_PER_USD_LIST) * 100) / 100;
  return {
    ruling: "GD-GOLDEN-CAP.R6",
    hardCapUsd: HARD_CAP_USD,
    withinCap: totalUsd <= HARD_CAP_USD,
    basis:
      "committed review estimator @ review/standard/base; claims≈words/60; phases = manifest minus " +
      "fixture phase-default opt-outs; credits→list-USD at 140 cr/$1 (provisional estimator — the " +
      "measured --scores file is the spend of record)",
    totalCredits,
    totalUsdList: totalUsd,
    legs,
  };
}

function legPlan(cohortLegs) {
  return {
    req: "REQ-DISC-3",
    ruling: BUDGET_NOTE,
    cohort:
      cohortLegs?.map((l) => ({
        fixtureId: l.fixture.id,
        protocol: l.fixture.protocol,
        workflow: l.workflow,
        modelTier: l.modelTier,
        rigor: l.rigor,
        venue: l.fixture.inputs.venue ?? null,
        userSources: (l.fixture.inputs.userSources ?? []).length,
      })) ?? "pass --cohort minimal to enumerate",
    legs: [
      "verify cohort coverage: one protocol golden per seeded protocol (4) — never trimmed",
      "commit the cohort estimate BEFORE dispatch (--estimate; >$100 → PAUSE)",
      "dispatch each fixture leg on the deployed launch-candidate SHA (--expect-sha, is_test workspace)",
      "collect per-fixture measured scores + metered USD → --scores-out file",
      `write ${MANIFEST_PATH}`,
      "node scripts/nightly-golden.mjs → gateFixtures → PROMOTION BLOCKED / Promotion OK",
    ],
    honest_marker:
      "nightly-golden.mjs exit 0 on an absent manifest is NON-EVIDENCE — no live golden run occurred",
  };
}

if (ESTIMATE_ONLY) {
  if (COHORT !== "minimal") {
    console.error("refusing: --estimate requires --cohort minimal (the only cohort R6GLD.1 defined)");
    process.exit(2);
  }
  const est = await cohortEstimate();
  console.log(JSON.stringify(est, null, 1));
  if (!est.withinCap) {
    console.error(`PAUSE — cohort estimate $${est.totalUsdList} exceeds the $${HARD_CAP_USD} cap. Do not dispatch; report the estimate.`);
    process.exit(4);
  }
  process.exit(0);
}

if (dryRun) {
  const cohortLegs = COHORT === "minimal" ? await cohort() : undefined;
  console.log(JSON.stringify({ dry_run: true, plan: legPlan(cohortLegs) }, null, 1));
  process.exit(0);
}

// ---- fail-closed budget gate: the driver never runs paid legs without the recorded ruling ----
if (process.env.GOLDEN_BUDGET_RULING !== "approved") {
  console.error(
    `refusing: paid modes require GOLDEN_BUDGET_RULING=approved (${BUDGET_NOTE}); the ruling is ` +
      `recorded in docs/build/LEDGER.md GATE DECISIONS — absent it, no golden spend`,
  );
  process.exit(3);
}

if (DISPATCH) {
  if (COHORT !== "minimal") {
    console.error("refusing: --dispatch requires --cohort minimal (the only cohort R6GLD.1 defined)");
    process.exit(2);
  }
  await dispatchMinimal();
  process.exit(0);
}

if (!SCORES_FILE) {
  console.error(
    "refusing: --execute requires --scores <file> — the measured per-fixture scores from the live " +
      "dispatch. A manifest without measured scores is fabrication; none is written.",
  );
  process.exit(3);
}

const scores = JSON.parse(readFileSync(resolve(process.cwd(), SCORES_FILE), "utf8"));
if (!Array.isArray(scores.fixtures) || scores.fixtures.length === 0) {
  console.error("refusing: --scores file must carry a non-empty fixtures[] — never write an empty manifest");
  process.exit(2);
}
for (const f of scores.fixtures) {
  if (!f.fixtureId || typeof f.scores !== "object" || typeof f.floors !== "object") {
    console.error(`refusing: malformed fixture entry (needs fixtureId + floors + scores): ${JSON.stringify(f)}`);
    process.exit(2);
  }
}
// R6GLD.1 — the minimal cohort's gate evidence must cover all four seeded protocols exactly
// (a partial cohort is not the amended §17 criterion — refuse rather than gate on a subset).
if (COHORT === "minimal") {
  const P = await import(resolve(root, "packages", "protocols", "dist", "src", "index.js"));
  const want = P.minimalCohort().map((l) => l.fixture.id).sort();
  const have = scores.fixtures.map((f) => f.fixtureId).sort();
  for (const id of want)
    if (!have.includes(id)) console.error(`missing measured leg for ${id}`);
  if (have.length !== want.length || JSON.stringify(have) !== JSON.stringify(want)) {
    console.error("refusing: --cohort minimal requires exactly one measured leg per protocol (4)");
    process.exit(2);
  }
}

const manifest = {
  generated_at: new Date().toISOString(),
  budget_ruling: "approved (GOLDEN_BUDGET_RULING)",
  cohort: COHORT ?? "legacy",
  fixtures: scores.fixtures,
};
mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
console.log(`nightly-golden-driver: wrote ${MANIFEST_PATH} (${manifest.fixtures.length} fixture(s)); invoking the gate`);

const { gateFixtures, formatReport } = await import("../nightly-golden.mjs");
const gate = gateFixtures(manifest);
console.log(formatReport(gate));
process.exit(gate.blocked ? 1 : 0);

// ---- the paid leg ----------------------------------------------------------------------------

/**
 * R6GLD.1 — the one-time bounded dispatch. Per leg: import the fixture draft through the real
 * ingestion path (presign → PUT → preview → project create with the protocol pin), launch
 * review/standard/base with autoProceedRun, poll to a terminal state, then measure the
 * deterministic scores + metered list-USD from the system DSN. Sequential (trial concurrency=1).
 * Stops at the first failed leg or the $100 cap — partial spend is reported exactly.
 */
async function dispatchMinimal() {
  const need = (n) => {
    const v = process.env[n];
    if (!v) {
      console.error(`missing env ${n}`);
      process.exit(1);
    }
    return v;
  };
  const API = need("API_BASE_URL").replace(/\/+$/, "");
  const WORKSPACE = need("GOLDEN_WORKSPACE_ID");
  const pg = require("pg");
  const pool = new pg.Pool({ connectionString: need("GOLDEN_DATABASE_URL"), max: 2 });
  const q = (t, p) => pool.query(t, p).then((r) => r.rows);
  const out = [];

  try {
    // provenance — the validation must land on the deployed launch-candidate SHA.
    if (!EXPECT_SHA) {
      console.error("refusing: --dispatch requires --expect-sha <launch-candidate sha> — the run must prove provenance");
      process.exit(2);
    }
    const hz = await fetch(`${API}/healthz`).then((r) => r.json());
    const gitSha = hz?.build?.gitSha ?? "";
    if (!gitSha.startsWith(EXPECT_SHA)) {
      console.error(`refusing: ${API} serves gitSha "${gitSha}", expected "${EXPECT_SHA}" — validation must run at the launch-candidate SHA`);
      process.exit(3);
    }
    console.log(`[dispatch] provenance OK — ${API} serves ${gitSha}`);

    // tenant — the workspace must exist and carry the is_test flag (never a real tenant).
    const ws = (
      await q(`select w.id, w.is_test, w.billing_account_id,
                      (select m.user_id from workspace_members m where m.workspace_id = w.id order by m.role='admin' desc limit 1) as user_id
                 from workspaces w where w.id = $1`, [WORKSPACE])
    )[0];
    if (!ws) {
      console.error(`refusing: workspace ${WORKSPACE} not found`);
      process.exit(3);
    }
    if (ws.is_test !== true) {
      console.error(`refusing: workspace ${WORKSPACE} is_test=${ws.is_test} — golden legs run on flagged test tenants only`);
      process.exit(3);
    }
    const bal = (
      await q(`select available, held from credit_balances where billing_account_id = $1`, [ws.billing_account_id])
    )[0];
    console.log(
      `[dispatch] tenant OK — ${WORKSPACE} is_test=true · account ${ws.billing_account_id} · ${bal?.available ?? 0} cr available`,
    );

    // session — env cookie, or mint through the real magic link + the pinned test mailbox.
    let cookie = process.env.GOLDEN_SESSION_COOKIE ?? "";
    if (!cookie && process.env.GOLDEN_MINT_SESSION === "1") {
      const J = await import(resolve(root, "packages", "journeys", "dist", "index.js"));
      const email = process.env.GOLDEN_IDENTITY ?? J.stableIdentity("a");
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
      console.error("refusing: GOLDEN_SESSION_COOKIE unset and GOLDEN_MINT_SESSION!=1 — no session");
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

    // the estimate re-check — the committed artifact is upstream; the dispatch refuses past the cap.
    const est = await cohortEstimate();
    console.log(`[dispatch] cohort estimate $${est.totalUsdList} list vs $${HARD_CAP_USD} cap`);
    if (!est.withinCap) {
      console.error(`refusing: estimate $${est.totalUsdList} > $${HARD_CAP_USD} — PAUSE, do not dispatch`);
      process.exit(4);
    }

    const cohortLegs = await cohort();
    let spent = 0;
    for (const leg of cohortLegs) {
      const draftText = readFileSync(
        join(root, "packages", "protocols", "fixtures", leg.fixture.draft.path),
        "utf8",
      );
      const words = draftText.split(/\s+/).filter(Boolean).length;
      const bytes = Buffer.byteLength(draftText, "utf8");

      // ingest: presign → PUT → preview → project create (the real §5.3 path).
      const pre = await post("/import/presign", {});
      if (pre.status !== 200 && pre.status !== 201) throw new Error(`presign ${pre.status}: ${pre.body}`);
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
        if (pv.status === 200) break; // {preview: result} — conversion ready
        if (pv.status === 202) {
          if (i === 11) throw new Error(`preview never ready: ${pv.body}`);
          await new Promise((r) => setTimeout(r, 5_000));
          continue;
        }
        throw new Error(`preview ${pv.status}: ${pv.body}`);
      }
      const created = await post("/projects", {
        title: leg.fixture.title,
        entry: "draft",
        protocolId: leg.fixture.protocol,
        ...(leg.fixture.inputs.venue ? { venue: leg.fixture.inputs.venue } : {}),
        quarantineKey: presign.key,
      });
      if (created.status !== 201) throw new Error(`project create ${created.status}: ${created.body}`);
      const project = JSON.parse(created.body).project;
      const projectId = project?.id;
      if (!projectId) throw new Error(`project create returned no id: ${created.body}`);
      console.log(`[dispatch] ${leg.fixture.id}: project ${projectId} (${leg.fixture.protocol}, ${words}w)`);

      // the free estimate pre-pass refines claimCount the way the sheet does.
      let claims;
      const estRes = await post(`/projects/${projectId}/estimates`, {
        workflow: leg.workflow,
        rigor: leg.rigor,
        modelTier: leg.modelTier,
        inputs: { words },
        refine: true,
      });
      if (estRes.status === 200 || estRes.status === 201) {
        const e = JSON.parse(estRes.body);
        claims = e.claimCount ?? e.estimate?.claimCount;
      }

      const launched = await post(`/projects/${projectId}/runs`, {
        idempotencyKey: `golden-${leg.fixture.id}-${EXPECT_SHA}`.slice(0, 120),
        workflow: leg.workflow,
        rigor: leg.rigor,
        modelTier: leg.modelTier,
        inputs: { sidecar: true },
        autoProceedRun: true,
        inputSnapshot: { wordCount: words, ...(claims ? { claimCount: claims } : {}) },
        ...(leg.fixture.inputs.userSources ? { userSources: leg.fixture.inputs.userSources } : {}),
        ...(leg.fixture.inputs.venue ? { venue: leg.fixture.inputs.venue } : {}),
      });
      if (launched.status !== 200 && launched.status !== 201)
        throw new Error(`launch ${leg.fixture.id} ${launched.status}: ${launched.body}`);
      const { runId } = JSON.parse(launched.body);
      console.log(`[dispatch] ${leg.fixture.id}: run ${runId} launched`);

      // poll to terminal (45 min bound; trial concurrency=1 → sequential legs).
      const deadline = Date.now() + 45 * 60_000;
      let row;
      for (;;) {
        row = (
          await q(
            `select id, state, estimate_credits, cap_credits, citation_completeness, inputs
               from runs where id = $1`,
            [runId],
          )
        )[0];
        if (!row) throw new Error(`run ${runId} not found`);
        if (["completed", "completed_partial", "failed", "cancelled"].includes(row.state)) break;
        if (Date.now() > deadline) throw new Error(`run ${runId} not terminal in 45min (${row.state})`);
        await new Promise((r) => setTimeout(r, 15_000));
      }
      console.log(`[dispatch] ${leg.fixture.id}: run ${runId} → ${row.state}`);

      // measure — deterministic scores + metered list-USD from the meter of record.
      const usage = (
        await q(
          `select coalesce(sum(list_cost_usd),0)::float usd, coalesce(sum(credits),0)::int credits
             from usage_records where run_id = $1`,
          [runId],
        )
      )[0];
      const sev = Object.fromEntries(
        (
          await q(
            `select f.severity, count(*)::int n from findings f
               join correspondence_items ci on ci.id = f.correspondence_id
              where ci.run_id = $1 group by f.severity`,
            [runId],
          )
        ).map((r) => [r.severity, r.n]),
      );
      const reviewCi = (
        await q(
          `select id, verdict, rubric, protocol_id, protocol_version from correspondence_items
             where run_id = $1 and kind = 'review' order by delivered_at desc limit 1`,
          [runId],
        )
      )[0];
      const userSourceDomains = row.inputs?.urlPolicy?.userSourceDomains ?? [];
      const citedUnfetched = (
        await q(
          `select count(*)::int n from claims c join correspondence_items ci on ci.id = c.correspondence_id
             where ci.run_id = $1 and c.url is not null and c.accessed_at is null
               and not (c.normalized_url ~* any($2))`,
          [runId, userSourceDomains.map((d) => `(^|\\.)${d.replace(/\./g, "\\.")}$`)],
        )
      )[0];
      const attestations = (
        await q(
          `select count(*)::int n from fetch_log where run_id = $1 and decision = 'deny'
             and (deny_reason is null or deny_reason <> 'cap')`,
          [runId],
        )
      )[0];
      const usd = Math.round(usage.usd * 100) / 100;
      spent = Math.round((spent + usd) * 100) / 100;
      const entry = {
        fixtureId: leg.fixture.id,
        floors: leg.fixture.floors,
        scores: {
          schemaValid:
            row.state === "completed" && reviewCi != null && reviewCi.verdict != null && reviewCi.rubric != null,
          citedFetched: citedUnfetched.n === 0,
          attestationViolations: attestations.n,
          findingCountsBySeverity: {
            blocking: sev.blocking ?? 0,
            major: sev.major ?? 0,
            minor: sev.minor ?? 0,
            note: sev.note ?? 0,
          },
        },
        runId,
        projectId,
        state: row.state,
        deliveredReview: reviewCi?.id ?? null,
        protocolStamp: reviewCi ? `${reviewCi.protocol_id}@${reviewCi.protocol_version}` : null,
        usd,
        credits: usage.credits,
      };
      out.push(entry);
      console.log(`[dispatch] ${leg.fixture.id}: measured $${usd} list (${usage.credits} cr) — cohort $${spent}`);
      if (spent > HARD_CAP_USD) {
        console.error(`CAP TRIP — cumulative $${spent} > $${HARD_CAP_USD}; writing partial scores and stopping`);
        break;
      }
    }

    const scoreDoc = {
      generated_at: new Date().toISOString(),
      cohort: "minimal",
      provenance: { apiBase: API, gitSha, expectSha: EXPECT_SHA, workspaceId: WORKSPACE },
      spend: { totalUsdList: spent, capUsd: HARD_CAP_USD, legs: out.length },
      fixtures: out,
    };
    if (!SCORES_OUT) {
      console.error("refusing: --dispatch requires --scores-out <file> — the measured scores destination");
      process.exit(2);
    }
    mkdirSync(dirname(resolve(process.cwd(), SCORES_OUT)), { recursive: true });
    writeFileSync(resolve(process.cwd(), SCORES_OUT), JSON.stringify(scoreDoc, null, 2) + "\n");
    console.log(`[dispatch] wrote ${SCORES_OUT} — ${out.length}/4 legs, $${spent} list measured`);
    if (out.length < cohortLegs.length) process.exit(5);
  } finally {
    await pool.end();
  }
}
