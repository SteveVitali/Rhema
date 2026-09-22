// LIVE fixture prep for a Stage-B green-Review smoke (P0.15f). After migrate+seed (`live-migrate-seed.ts`),
// this: (1) FUNDS the seed billing account (`bill_seed`) — `seedRealProjects` creates the account + a writer
// subscription but no credit balance, so a run's hold would fail; and (2) does the DRAFT-CONTENT FIXUP — the
// seed writes each `<proj>_av1` with a PLACEHOLDER content sha (`a`×64) and NO GCS bytes, so `/work`
// materialization (which fetches the promoted draft version by sha) would dangle. We upload real draft markdown
// to the objects bucket via the content store and repoint `proj_pv_av1` at it (disabling the immutability
// trigger for the one update). Idempotent. Run:
//
//   DATABASE_URL=postgres://…  OBJECTS_BUCKET=rhema-dev-artifacts  node scripts/live/prepare-fixture.mjs
//
// This is a LIVE-OPS helper (like `live-migrate-seed.ts`), not part of the app build.

import { createHash } from "node:crypto";
import pg from "pg";
import { createGcsContentStore } from "@rhema/mirror";

const WS = "ws_seed";
const BILL = "bill_seed";
const PROJECT_AV = "proj_pv_av1"; // the promoted head version of proj_pv's draft (proj_pv_d1)
const FUND_CREDITS = 500_000; // generous headroom over one $10 run's cap (a throwaway test account)

/** A real ~900-word draft for "The Politics of Visibility" — genuine prose for the Editor to review. */
const DRAFT_MARKDOWN = `# The Politics of Visibility

There is a seductive idea, now nearly axiomatic in progressive politics, that to be seen is to be safe.
Representation, on this view, is not merely a good but the good: once a group appears in the culture's mirror —
in its films, its boardrooms, its census categories — its claims become legible, and legibility is the
antechamber of justice. The argument has the great virtue of being partly true. It is also, in ways we have
been slow to admit, a trap.

## The promise

Visibility politics inherits its moral force from a real history. For most of the modern period, the surest
technology of domination was not the cudgel but the blind spot: the systematic refusal to register a people as
present, as injured, as owed. To be counted was to be admitted into the moral community. So the demand to be
seen — in the archive, on the ballot, in the drug trial — was never vanity. It was a demand for the minimal
precondition of redress. When a coalition wins a new category on a form, it wins a lever.

## The turn

But a lever is not a hand. Somewhere in the last two decades the demand for visibility detached from the
outcomes it once served and became an end that could be satisfied on its own terms. A corporation can light its
logo in six colors each June without conceding a single point of contract to the workers whose identities it is
celebrating. A film can cast against the historical grain while its financing flows through the same three
conglomerates. The mirror, it turns out, is cheap to redecorate; the room behind it is not.

This is the first cost. Visibility is a currency that the powerful can mint at will, and a currency they can
mint is a currency they can debase. Every act of representation that costs the representer nothing is an act of
representation that buys the represented nothing — except the feeling of having won, which is the most expensive
thing of all, because it is the thing that ends the campaign.

## The exposure

There is a second cost, and it is graver. To be visible is also to be surveilled. The same infrastructure that
renders a group legible to its allies renders it legible to its enemies, and the state does not read the census
with a friend's eyes. A community that has spent its political capital becoming *seen* has, at the same moment,
made itself easy to *find*. The archive that was to be the instrument of redress becomes, under a different
administration, the instrument of the roundup. We have watched this happen. We will watch it happen again.

The theorists of visibility rarely reckon with this because they hold, implicitly, a benevolent theory of the
watcher. They imagine the gaze as sympathetic — the gaze of the ally, the documentarian, the court. But the
gaze is not a person; it is a capacity, and capacities outlive the intentions of those who build them. To make
yourself visible to a friendly state is to make yourself visible to whatever the state becomes.

## What visibility cannot do

The deeper problem is conceptual. Visibility is a relation between the seen and the seer, and relations of that
kind cannot, by themselves, redistribute anything. They can only *represent* a distribution — ratify it,
dramatize it, mourn it. The work of changing who holds what is done by other means: by law, by the strike, by
the slow capture of institutions, by money moved from one column to another. These are boring. They photograph
poorly. They do not trend. And precisely because they are illegible to the culture of the image, they are the
things the culture of the image teaches us to neglect.

I do not mean that we should court invisibility. The closet is not a strategy. I mean that visibility is a
precondition, not an achievement — the opening move, never the endgame — and that a politics which mistakes the
opening for the victory will keep winning openings while losing games.

## The discipline

What would it mean to treat visibility as a means again? It would mean asking, of every campaign for
representation, the unglamorous follow-up question: *and then what?* Representation on a board — with what
votes? A category on a form — attached to what appropriation? A story on a screen — financed by whom, and does
the financing change? It would mean measuring our victories not by how they feel from inside the coalition but
by what they cost the people we are fighting. A win that costs our opponents nothing is not a win they will
bother to reverse, which is the surest sign that it was never a win at all.

The mirror is not nothing. But we have spent a generation admiring our reflection while the room was
rearranged behind us. It is time to turn around.
`;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const objectsBucket = process.env.OBJECTS_BUCKET ?? "rhema-dev-artifacts";
  if (!databaseUrl) throw new Error("prepare-fixture: DATABASE_URL required");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const log = (m: string): void => console.log(`[prepare-fixture] ${m}`);

  try {
    // 1. Fund the seed billing account so a run's hold succeeds (grant → +available; bucket 'topup').
    await pool.query(
      `insert into credit_ledger (id, workspace_id, billing_account_id, kind, credits, bucket, source, reason, idempotency_key)
       values ('cl_live_fund_p015f', 'ws_seed', $1, 'grant', $2, 'topup', 'live_test', 'P0.15f live fund', 'live-fund-p0.15f')
       on conflict (id) do nothing`,
      [BILL, FUND_CREDITS],
    );
    await pool.query(
      `insert into credit_balances (billing_account_id, bucket, available, held)
       values ($1, 'topup', $2, 0)
       on conflict (billing_account_id, bucket) do update set available = greatest(credit_balances.available, $2), updated_at = now()`,
      [BILL, FUND_CREDITS],
    );
    const bal = (await pool.query("select available, held from credit_balances where billing_account_id=$1 and bucket='topup'", [BILL])).rows[0];
    log(`funded ${BILL}: ${JSON.stringify(bal)}`);

    // 2. Draft-content fixup: upload real bytes + repoint proj_pv_av1 (the seed placeholder has no GCS object).
    const bytes = Buffer.from(DRAFT_MARKDOWN, "utf8");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const wordCount = DRAFT_MARKDOWN.split(/\s+/).filter(Boolean).length;
    const store = await createGcsContentStore({ bucketName: objectsBucket, workspaceId: WS });
    const { key } = await store.put(WS, sha256, bytes);
    log(`uploaded draft bytes → ${key} (${bytes.length} bytes, ${wordCount} words, sha ${sha256.slice(0, 12)}…)`);

    await pool.query("alter table artifact_versions disable trigger t_immutable");
    try {
      const res = await pool.query(
        `update artifact_versions set content_sha256=$1, s3_key=$2, bytes=$3, word_count=$4 where id=$5`,
        [sha256, key, bytes.length, wordCount, PROJECT_AV],
      );
      log(`repointed ${PROJECT_AV}: ${res.rowCount} row(s)`);
    } finally {
      await pool.query("alter table artifact_versions enable trigger t_immutable");
    }
    log("done.");
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[prepare-fixture] failed:", err);
  process.exit(1);
});
