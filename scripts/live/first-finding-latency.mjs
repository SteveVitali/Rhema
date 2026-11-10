#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
// R5OPS.1 (REQ-OPS-4; §13.5's "first finding ≤ 4 min" activation SLO) — the committed
// measurement query. The telemetry beacons exist (`signup.completed` server-emitted at signup,
// `finding.viewed` client-emitted through POST /analytics/events); what is missing is organic
// traffic — the production cohort is empty until a non-test signup completes a run to findings.
// This script is READ-ONLY (BEGIN READ ONLY … ROLLBACK like funded-query.mjs) and answers, per
// real user, the signup→first-finding latency and whether it beat 4 minutes.
//
//   DATABASE_URL=<system dsn> node scripts/live/first-finding-latency.mjs
//
// Deferred execution per the contract: until `signup.completed` rows exist on non-test
// workspaces the report is legitimately empty — an empty cohort is "no data", never evidence.
export const FIRST_FINDING_QUERY = `
with signups as (
  select ae.user_id, ae.workspace_id, min(ae.at) as signup_at
    from analytics_events ae
    left join "user" u on u.id = ae.user_id
    join workspaces w on w.id = ae.workspace_id
   where ae.event = 'signup.completed'
     and coalesce(u.analytics_opt_out, false) = false
     and not w.is_test
   group by ae.user_id, ae.workspace_id
),
first_findings as (
  select ae.user_id, ae.workspace_id, min(ae.at) as first_finding_at
    from analytics_events ae
    join workspaces w on w.id = ae.workspace_id
   where ae.event = 'finding.viewed'
     and not w.is_test
   group by ae.user_id, ae.workspace_id
)
select s.user_id,
       s.workspace_id,
       s.signup_at,
       f.first_finding_at,
       round(extract(epoch from f.first_finding_at - s.signup_at) / 60.0, 3) as minutes_to_first_finding,
       (f.first_finding_at - s.signup_at) <= interval '4 minutes' as within_4m
  from signups s
  join first_findings f
    on f.user_id = s.user_id and f.workspace_id = s.workspace_id
 order by s.signup_at;
`;

export const FIRST_FINDING_SUMMARY = `
with per_user as (${FIRST_FINDING_QUERY.replace(/order by s\.signup_at;\s*$/, "")})
select count(*)::int as signups_with_findings,
       count(*) filter (where within_4m)::int as within_4m,
       round(avg(minutes_to_first_finding), 3) as avg_minutes,
       round(percentile_cont(0.5) within group (order by minutes_to_first_finding)::numeric, 3) as p50_minutes
  from per_user;
`;

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const require = createRequire(
    resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "integration", "package.json"),
  );
  const pg = require("pg");
  if (!process.env.DATABASE_URL) {
    console.error("requires DATABASE_URL (system-role DSN over the IAP tunnel) — read-only");
    process.exit(3);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const c = await pool.connect();
    try {
      await c.query("begin read only");
      const per = await c.query(FIRST_FINDING_QUERY);
      const sum = await c.query(FIRST_FINDING_SUMMARY);
      console.log(
        JSON.stringify(
          {
            req: "REQ-OPS-4",
            at: new Date().toISOString(),
            cohort: per.rows,
            summary: sum.rows[0],
            note: "empty cohort = no organic signups yet — no data, NOT evidence",
          },
          null,
          1,
        ),
      );
    } finally {
      await c.query("rollback").catch(() => undefined);
      c.release();
    }
  } finally {
    await pool.end();
  }
}
