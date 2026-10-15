// VERIF.1 / D-SPACAP.2-2 leg (b) — the raw BFF-layer two-tenant isolation probe, live on prod.
// Recipe (SPACAP.2_COMPOSED_VERIFICATION.md §3.3): with tenant A and tenant B session cookies
// minted by the journey magic-link path —
//   1. A's /bff/app carries A's nonce markers (vacuity check).
//   2. B's reads across /bff/app, /bff/app/inbox, /bff/voices, /bff/usage, /bff/settings/billing
//      carry ZERO of A's marker strings.
//   3. B GET /bff/p/<a-slug> → >=400 (foreign slug is a not_found, never a read).
//   4. Anonymous GET /bff/app → 401 {error:"unauthenticated"}.
// Raw response bodies are preserved under --out for the evidence ledger.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const WEB = process.env.JOURNEY_WEB ?? "https://rhema.tools";
const STATE_DIR = process.env.JOURNEY_STATE ?? ".journeys-state";
const NONCE = (process.env.X1_NONCE ?? "523e86229f04").toLowerCase();
const OUT = process.argv[2] ?? ".";
mkdirSync(OUT, { recursive: true });

const MARKER_A = `JRN-${NONCE.toUpperCase()}-TENANTA`;
const VOICE_A = `JRN-${NONCE.toUpperCase()}-VOICEA`;
// X1 plants on the RETURNING tenant A (`returningUser("a")` → test+jrn-a@); B is jrn-b.
const stateA = JSON.parse(readFileSync(join(STATE_DIR, "test_jrn_a_rhema_tools.json"), "utf8"));
const stateB = JSON.parse(readFileSync(join(STATE_DIR, "test_jrn_b_rhema_tools.json"), "utf8"));
const cookieA = stateA.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const cookieB = stateB.cookies.map((c) => `${c.name}=${c.value}`).join("; ");

const get = async (path, cookie) => {
  const res = await fetch(`${WEB}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  return { status: res.status, text: await res.text() };
};

const out = { web: WEB, nonce: NONCE, markerA: MARKER_A, voiceA: VOICE_A, checks: {} };
const fail = (name, msg) => {
  out.checks[name] = { pass: false, detail: msg };
  console.log(`FAIL ${name}: ${msg}`);
};
const ok = (name, detail) => {
  out.checks[name] = { pass: true, detail };
  console.log(`PASS ${name}: ${detail}`);
};

// --- A side: /bff/app must carry A's planted markers (else the B-side greps are vacuous) ---
const aApp = await get("/bff/app", cookieA);
writeFileSync(join(OUT, "A-bff-app.json"), aApp.text);
if (aApp.status !== 200) {
  fail("A:/bff/app", `status ${aApp.status} — the cached A session is stale; re-run --steps X1 first`);
  writeFileSync(join(OUT, "two-tenant-bff.json"), JSON.stringify(out, null, 2));
  process.exit(1);
}
const aHasMarker = aApp.text.includes(MARKER_A);
const aHasVoice = aApp.text.includes(VOICE_A);
if (!aHasMarker || !aHasVoice) {
  fail(
    "A:markers",
    `A's /bff/app carries marker=${aHasMarker} voice=${aHasVoice} — the isolation probes would be vacuous`,
  );
}
const aSlug =
  JSON.parse(aApp.text)
    .rows?.map((r) => r.slug)
    .find((s) => typeof s === "string" && s.includes(`jrn-${NONCE}-tenanta`)) ?? null;
out.aSlug = aSlug;
if (aHasMarker && aHasVoice) ok("A:markers", `marker + voice present; aSlug=${aSlug}`);

// --- B side: every tenant list route carries NONE of A's strings --------------------------
const bRoutes = ["/bff/app", "/bff/app/inbox", "/bff/voices", "/bff/usage", "/bff/settings/billing"];
for (const p of bRoutes) {
  const r = await get(p, cookieB);
  const safe = p.replaceAll("/", "_");
  writeFileSync(join(OUT, `B-${safe}.json`), r.text);
  if (r.status !== 200) {
    fail(`B:${p}`, `status ${r.status} (expected 200 on B's own twin)`);
    continue;
  }
  const hits = [MARKER_A, VOICE_A, aSlug].filter((m) => m && r.text.includes(m));
  if (hits.length) fail(`B:${p}`, `A's strings visible to B: ${hits.join(", ")}`);
  else ok(`B:${p}`, "zero of A's marker strings");
}

// --- foreign-slug detail: B opening A's project twin must answer >=400 --------------------
if (aSlug) {
  const r = await get(`/bff/p/${aSlug}`, cookieB);
  writeFileSync(join(OUT, `B-bff-p-${aSlug}.json`), r.text);
  if (r.status < 400) {
    fail("B:foreign-slug", `GET /bff/p/${aSlug} → ${r.status} — a foreign slug served a body`);
  } else {
    ok("B:foreign-slug", `GET /bff/p/${aSlug} → ${r.status}`);
  }
}

// --- anonymous: the twin layer itself gates ----------------------------------------------
const anon = await get("/bff/app", null);
writeFileSync(join(OUT, "anon-bff-app.json"), anon.text);
const anonErr = (() => {
  try {
    return JSON.parse(anon.text)?.error;
  } catch {
    return null;
  }
})();
if (anon.status === 401 && anonErr === "unauthenticated") {
  ok("anon:/bff/app", `401 {error:"${anonErr}"}`);
} else {
  fail("anon:/bff/app", `status=${anon.status} body=${anon.text.slice(0, 200)}`);
}

writeFileSync(join(OUT, "two-tenant-bff.json"), JSON.stringify(out, null, 2));
const failed = Object.entries(out.checks).filter(([, v]) => !v.pass).map(([k]) => k);
console.log(failed.length ? `TWO-TENANT-BFF: FAIL (${failed.join(", ")})` : "TWO-TENANT-BFF: PASS");
process.exit(failed.length ? 1 : 0);
