// LIVE fixture prep for a Stage-B green-Review smoke (P0.15f; extended to all THREE real projects in P0.15k).
// After migrate+seed (`live-migrate-seed.ts`), this: (1) FUNDS the seed billing account (`bill_seed`) —
// `seedRealProjects` creates the account + a writer subscription but no credit balance, so a run's hold would
// fail; and (2) does the DRAFT-CONTENT FIXUP for EACH real project — the seed writes each `<proj>_av1` with a
// PLACEHOLDER content sha (`a`×64) and NO GCS bytes, so `/work` materialization (which fetches the promoted
// draft version by sha) would dangle. We upload real draft markdown to the objects bucket via the content
// store and repoint each `<proj>_av1` at it (disabling the immutability trigger for the one update).
//
// P0.15k's three-project exit criterion needs all of proj_pv / proj_sd / proj_cr to review real prose, so the
// fixup covers all three (P0.15f/g/h/i exercised proj_pv only). Idempotent. Run:
//
//   DATABASE_URL=postgres://…  OBJECTS_BUCKET=rhema-dev-artifacts  node scripts/live/prepare-fixture.mjs
//
// This is a LIVE-OPS helper (like `live-migrate-seed.ts`), not part of the app build.

import { createHash } from "node:crypto";
import pg from "pg";
import { createGcsContentStore, type ContentStore } from "@rhema/mirror";

const WS = "ws_seed";
const BILL = "bill_seed";
const FUND_CREDITS = 500_000; // generous headroom over one $10 run's cap (a throwaway test account)

/** A real ~900-word draft for "The Politics of Visibility" — genuine prose for the Editor to review. */
const DRAFT_PV = `# The Politics of Visibility

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

/** A real ~800-word draft for "The Structure of Political Difference" — matches the seeded findings (the
 *  Trump "market-leaning" characterization and the currency claim the Editor flags as misleading in context). */
const DRAFT_SD = `# The Structure of Political Difference

We are fluent in a vocabulary of political difference that no longer maps the terrain it was built to describe.
Left and right, market and state, globalist and nationalist: these axes were drawn for a world in which economic
and cultural positions traveled together, and they have not survived that world's dissolution. The result is a
politics conducted almost entirely in miscategorizations — where the labels do the arguing, and the arguing
never reaches the thing being labeled.

## The market that is not one

Consider how casually the American right is still described as "market-leaning." The phrase is a fossil. It
survives from an era when the coalition's economic program really was a program of deregulation and free trade,
and it is applied now, without amendment, to a movement whose signature economic act is a sweeping tariff
regime — a discretionary tax on imports administered from the executive, adjusted by grievance, and defended in
the frankly protectionist language of the 1890s. To call this "market-leaning" is not a simplification; it is an
error. A government that sets the price of a container of steel by proclamation is not deferring to the market.
It is the state, wearing the market's old coat.

The mistake matters because it launders a change of kind into a change of degree. If the program is merely
"market-leaning with exceptions," then critics can quarrel about the exceptions and concede the frame. But the
frame is what moved. What we are watching is not a market coalition that has strayed; it is a coalition that has
substituted a theory of national economic sovereignty for a theory of exchange, and kept the vocabulary because
the vocabulary is disarming.

## The currency tell

The same confusion governs how we talk about money. A strong currency and a weak one are described as though
they sat on a moral spectrum — strength good, weakness bad — when in fact each is an instrument that advantages
some constituencies and injures others. A characterization of a currency as simply "strong" or "weak" says
nothing until you name whose exports it prices out and whose imports it cheapens, whose debts it inflates away
and whose savings it protects. The adjective is doing the work of an argument it has not made. Here too the
label forecloses the analysis: to accept the frame of strength-and-weakness is to accept that there is a single
national interest in the matter, when the entire point is that there is not.

## Positions without a plane

If the old axes fail, the temptation is to draw new ones — to announce that the real division is now between
open and closed, or between somewhere and anywhere, and to install the fresh dyad with the same confidence.
This is a mistake of the same species. Political positions are not points on a plane; they are bundles of
commitments that cohere for contingent, historical reasons and come apart under pressure. A person can want
industrial policy and open borders, or closed borders and free capital, and the incoherence is not a flaw in
the person. It is a fact about a moment in which the bundles are being repacked.

The honest move is not to find the true axis but to abandon the search for one. We should describe coalitions
the way we describe weather systems: by the forces converging in them, not by a single coordinate. That is
harder. It denies us the pleasure of placing an opponent and being done. But the pleasure of placement is
exactly what the miscategorizations sell, and it is why they persist long after they have stopped explaining
anything.

## What is left when the labels go

Strip away the inherited vocabulary and the argument becomes concrete, which is to say difficult. We can no
longer ask whether a coalition is market-leaning; we have to ask what it does to the price of specific goods, to
specific workers, to specific creditors. We can no longer ask whether a currency is strong; we have to ask
strong for whom. The reward for this difficulty is that we would, for the first time in a while, be arguing
about the world rather than about the words. The structure of political difference is real. Our map of it is
not. The task is to draw a new one — and to resist, this time, the wish for it to be simple.
`;

/** A real ~800-word draft for "The Constitution of Reason" — includes the Kaesberg study gloss the Editor flags
 *  as overreaching beyond what the study licenses (matches the seeded discourse finding). */
const DRAFT_CR = `# The Constitution of Reason

We speak of reason as though it were a faculty — a thing each of us carries, more or less intact, into the
disputes of public life. On this picture, to reason well is to consult an internal instrument correctly, and
public disagreement is the sum of private malfunctions. It is a flattering picture, and a false one. Reason is
not a possession but a constitution: a set of shared procedures, sustained by institutions, that make it
possible for claims to be tested by more than the confidence of the person making them. When those procedures
decay, individual brilliance does not compensate. It accelerates the decay.

## The private-instrument fallacy

The private-instrument model has one great appeal: it locates the problem of unreason in other people. If
reasoning is a faculty, then the unreasonable are the defective, and the remedy is education or exposure — give
them the facts, and the instrument will do its work. Decades of disappointment have not dislodged this hope,
because the hope is structural: it lets the reasonable person off the hook. But the evidence points the other
way. People reason well inside institutions that reward accuracy and punish invention, and poorly inside
institutions that reward loyalty and punish deviation. The variable is not the instrument. It is the setting.

## What the study can and cannot bear

Here I want to be careful, because the temptation to overreach is strong and I have felt it. A recent study by
Kaesberg and colleagues found that participants who deliberated under conditions of *mutual accountability* —
where each had to justify a conclusion to a listener who might disagree — produced markedly more accurate group
judgments than participants who deliberated without it. It is a clean result, and it is easy to inflate. One
wants to say: this proves that reason is fundamentally social, that the isolated thinker is a myth, that
accountability is the engine of all good judgment. The study licenses none of that. It shows an effect, in a
particular task, under a particular arrangement, on a particular measure of accuracy. To read it as a general
theory of rationality is to ask a single experiment to underwrite a philosophy. The finding is a brick; it is
not the building. If the argument for a social constitution of reason is to stand, it has to be built from many
such bricks, and from history, and not from one study asked to gloss the whole.

## The institutions of testing

What, then, actually constitutes reason in public? Concretely: the procedures by which a claim is made to face
resistance. Peer review, adversarial cross-examination, replication, the correction and the retraction, the
editor who asks how you know — these are not decorations on rational life. They are its load-bearing walls. Each
is a way of arranging that a claim must survive someone whose interest is in its failure. Where the arrangement
holds, even mediocre reasoners produce a reliable collective product. Where it collapses — where claims circulate
without ever being made to answer — even the gifted produce confident nonsense, and produce it faster than the
untutored ever could.

## The fragility

The constitutional view carries a warning the faculty view cannot. A faculty is durable; you do not lose your
capacity to reason because the room has changed. But a constitution is fragile precisely because it is external
and shared. It can be defunded, captured, gamed, or simply exhausted, and when it goes it takes the reliability
of everyone inside it, the brilliant included. This is why the decay of testing institutions is not one problem
among many but the problem beneath the others: it removes the mechanism by which we would otherwise notice that
something had gone wrong.

## Rebuilding

If reason is constituted rather than possessed, then the work of defending it is institutional and unglamorous.
It is the work of keeping the procedures honest — of protecting the venues where a claim still has to survive an
adversary, and of building new ones where the old have failed. It is less exciting than sharpening one's own
mind, and far more important, because a sharpened mind in a corrupted forum is a knife in a dark room. We did not
inherit reason as a gift. We built it, haltingly, out of rules for how to disagree. It can be unbuilt the same
way — and it will be, unless we treat its maintenance as the civic labor it is.
`;

interface DraftFixup {
  /** the promoted head ArtifactVersion id the seed created with a placeholder sha. */
  readonly versionId: string;
  readonly markdown: string;
}

const DRAFTS: readonly DraftFixup[] = [
  { versionId: "proj_pv_av1", markdown: DRAFT_PV },
  { versionId: "proj_sd_av1", markdown: DRAFT_SD },
  { versionId: "proj_cr_av1", markdown: DRAFT_CR },
];

/** Upload real bytes for one draft version + repoint its row (the seed placeholder has no GCS object). */
async function repointDraft(pool: pg.Pool, store: ContentStore, fixup: DraftFixup, log: (m: string) => void): Promise<void> {
  const bytes = Buffer.from(fixup.markdown, "utf8");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const wordCount = fixup.markdown.split(/\s+/).filter(Boolean).length;
  const { key } = await store.put(WS, sha256, bytes);
  log(`uploaded ${fixup.versionId} draft bytes → ${key} (${bytes.length} bytes, ${wordCount} words, sha ${sha256.slice(0, 12)}…)`);

  await pool.query("alter table artifact_versions disable trigger t_immutable");
  try {
    const res = await pool.query(
      `update artifact_versions set content_sha256=$1, s3_key=$2, bytes=$3, word_count=$4 where id=$5`,
      [sha256, key, bytes.length, wordCount, fixup.versionId],
    );
    log(`repointed ${fixup.versionId}: ${res.rowCount} row(s)`);
  } finally {
    await pool.query("alter table artifact_versions enable trigger t_immutable");
  }
}

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

    // 2. Draft-content fixup for ALL THREE real projects (P0.15k) — the three-project exit criterion reviews
    //    real prose for each of proj_pv / proj_sd / proj_cr.
    const store = await createGcsContentStore({ bucketName: objectsBucket, workspaceId: WS });
    for (const fixup of DRAFTS) {
      await repointDraft(pool, store, fixup, log);
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
