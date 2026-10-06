// P1.17 (§15.1–§15.3) — the public funnel pages: the landing (twelve sections, the v0.3 order),
// /pricing (every figure derived through `buildPricingPageData` — nothing hand-typed), and /signup
// (the intent-carrying admission form + the magic-link wait screen's read-only Showcase preview).
// All copy comes from COPY.landing / COPY.pricing / COPY.signup — `lintCopy` AND `lintGrowthCopy`
// run over those keys in copy.test.ts, so the honest-marketing rules fail CI, not review.
// Progressive enhancement everywhere: forms POST, links navigate, and the drop-zone works without
// JS (the file input's label links to /signup; landing.js adds the client-side hold).

import type { ReactNode } from "react";
import { Shell, SectionTitle, DossierView, type DossierLabels } from "@rhema/ui";
import { buildPricingPageData, rangeLabel, PUBLIC_CLAIM_COPY, publicClaimEnabled } from "@rhema/contracts";
import { COPY } from "./copy.js";
import { SAMPLE_DOSSIER } from "./sample-dossier.js";
import { usePageData } from "./page-data.js";

const dossierLabels: DossierLabels = {
  letterHeading: COPY.dossier.letterHeading,
  claimsHeading: COPY.dossier.claimsHeading,
  findingsHeading: COPY.dossier.findingsHeading,
  readOnlyNote: COPY.dossier.readOnlyNote,
  fetchedLabel: COPY.dossier.fetchedLabel,
  tierLabel: (t: number) => `Tier ${t}`,
  contradictedTierOneLabel: COPY.dossier.contradictedTierOneLabel,
};

/** Replace `{key}` placeholders in a copy template (the same helper pages.tsx carries). */
function fmtCopy(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

const SECTION = { marginTop: "48px" } as const;
const MUTED = { color: "var(--shell-fg-muted)", fontSize: "14px", lineHeight: 1.6, maxWidth: "68ch" } as const;
const CARD = {
  border: "1px solid var(--shell-border)",
  borderRadius: "12px",
  padding: "20px",
  background: "var(--shell-raised)",
} as const;
const CTA = {
  display: "inline-block",
  padding: "10px 18px",
  borderRadius: "8px",
  background: "var(--accent)",
  color: "var(--shell-bg)",
  fontWeight: 600,
  fontSize: "14px",
  textDecoration: "none",
} as const;
const CTA_GHOST = {
  ...CTA,
  background: "var(--shell-raised)",
  color: "var(--shell-fg)",
  border: "1px solid var(--shell-border)",
} as const;

/**
 * §15.1 — the landing page's twelve sections, v0.3 order: nav · hero · the dossier · workflow strip ·
 * the author's seat · voices · live runs · models · proof · pricing · changelog+FAQ · final CTA
 * (the nav is the Shell's own chrome). The drop-zone hero holds a file client-side (IndexedDB via
 * landing.js) and routes to /signup?intent=review; without JS the affordance is a plain link.
 */
export function LandingPage(): ReactNode {
  const { invite, claims } = usePageData();
  const open = invite?.signupOpen === true;
  const pricing = buildPricingPageData(claims);
  const essayCard = pricing.cards.find((card) => card.key === "essay") ?? pricing.cards[0];
  const reviewRow = essayCard?.rows.find((r) => r.key === "review");
  return (
    <Shell
      brand={COPY.brand}
      tagline={COPY.tagline}
      nav={
        <>
          <a href="/pricing" style={{ marginRight: "16px" }}>{COPY.landing.nav.pricing}</a>
          <a href="/login" style={{ marginRight: "16px" }}>{COPY.landing.nav.signIn}</a>
          <a href="/signup" style={CTA}>{COPY.landing.hero.ctaPrimary}</a>
        </>
      }
      footer={<span>{COPY.footer}</span>}
    >
      {/* 1 — hero (the drop-zone IS the hero's primary affordance; REQ-GROWTH-1) */}
      <section data-section="hero">
        <h1 style={{ fontSize: "40px", lineHeight: 1.15, maxWidth: "18ch", margin: "24px 0 16px" }}>
          {COPY.landing.hero.headline}
        </h1>
        <p style={{ ...MUTED, fontSize: "16px" }}>{COPY.landing.hero.lede}</p>
        <form data-dropzone action="/signup" method="get" style={{ ...CARD, marginTop: "24px", maxWidth: "560px" }}>
          <input type="hidden" name="intent" value="review" />
          <label
            data-dropzone-label
            htmlFor="hero-file"
            style={{ display: "block", border: "1px dashed var(--shell-border)", borderRadius: "8px", padding: "28px", textAlign: "center", cursor: "pointer", color: "var(--shell-fg)" }}
          >
            <strong>{COPY.landing.dropzone.label}</strong>
            <div data-dropzone-hint style={{ ...MUTED, maxWidth: "100%", marginTop: "6px" }}>{COPY.landing.dropzone.hint}</div>
          </label>
          <input id="hero-file" name="held" type="file" accept=".md,.markdown,.docx,.pdf,.txt" style={{ position: "absolute", width: "1px", height: "1px", opacity: 0 }} />
          <details style={{ marginTop: "12px" }}>
            <summary style={{ fontSize: "13px", color: "var(--shell-fg-muted)", cursor: "pointer" }}>{COPY.landing.dropzone.paste}</summary>
            <textarea name="paste" placeholder={COPY.landing.dropzone.pastePlaceholder} rows={4} style={{ width: "100%", marginTop: "8px", boxSizing: "border-box" }} />
          </details>
        </form>
        <p style={{ ...MUTED, marginTop: "12px" }}>
          {/* HOT.1 — the "first review is included" variant is gated claim copy; the honest
              copy-table default renders while `trial.firstReviewIncluded` is hidden. */}
          <strong style={{ color: "var(--shell-fg)" }}>
            {publicClaimEnabled("trial.firstReviewIncluded", claims)
              ? PUBLIC_CLAIM_COPY["trial.firstReviewIncluded"].landingTrialNote
              : COPY.landing.hero.trialNote}
          </strong>
        </p>
        <p style={{ marginTop: "8px", fontSize: "14px" }}>
          <a href="/signup?entry=draft">{COPY.landing.hero.ctaPrimary}</a>
          {" · "}
          <a href="/signup?entry=outline">{COPY.landing.hero.ctaOutline}</a>
          {" · "}
          <a href="/signup?entry=scratch">{COPY.landing.hero.ctaScratch}</a>
        </p>
      </section>

      {/* 2 — the dossier (the real sample board read; REQ-POS-11) */}
      <section data-section="dossier" style={SECTION}>
        <SectionTitle>{COPY.landing.dossier.heading}</SectionTitle>
        <ul style={{ ...MUTED, paddingLeft: "18px" }}>
          {COPY.landing.dossier.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <p style={MUTED}>{COPY.landing.dossier.sampleNote}</p>
        <DossierView
          title={SAMPLE_DOSSIER.projectTitle}
          letter={SAMPLE_DOSSIER.letter}
          claims={SAMPLE_DOSSIER.claims}
          findings={SAMPLE_DOSSIER.findings}
          labels={dossierLabels}
        />
      </section>

      {/* 3 — the workflow strip (lifecycle order; Draft's authorship frame + approval gate named) */}
      <section data-section="workflow" style={SECTION}>
        <SectionTitle>{COPY.landing.workflow.heading}</SectionTitle>
        <ol style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", padding: 0, listStyle: "none" }}>
          {COPY.landing.workflow.steps.map((s) => (
            <li key={s.key} style={CARD}>
              <strong style={{ fontSize: "14px" }}>{s.label}</strong>
              <p style={{ ...MUTED, maxWidth: "100%", marginTop: "6px", fontSize: "13px" }}>{s.note}</p>
            </li>
          ))}
        </ol>
        <p style={MUTED}>{COPY.landing.workflow.gateNote}</p>
      </section>

      {/* 4 — the author's seat */}
      <section data-section="seat" style={SECTION}>
        <SectionTitle>{COPY.landing.seat.heading}</SectionTitle>
        <p style={MUTED}>{COPY.landing.seat.body}</p>
      </section>

      {/* 5 — voices ("a register, not a person" + the staleness pill's promise) */}
      <section data-section="voices" style={SECTION}>
        <SectionTitle>{COPY.landing.voices.heading}</SectionTitle>
        <p style={MUTED}>{COPY.landing.voices.body}</p>
      </section>

      {/* 6 — live runs (the estimate-and-cap contract, on the marketing page) */}
      <section data-section="runs" style={SECTION}>
        <SectionTitle>{COPY.landing.runs.heading}</SectionTitle>
        <p style={MUTED}>{COPY.landing.runs.body}</p>
      </section>

      {/* 7 — models ("Stay on the frontier"; "Powered by Claude" permitted) */}
      <section data-section="models" style={SECTION}>
        <SectionTitle>{COPY.landing.models.heading}</SectionTitle>
        <p style={MUTED}>{COPY.landing.models.body}</p>
      </section>

      {/* 8 — proof (measured claims only — no testimonials, no logos; REQ-GROWTH-5 amended) */}
      <section data-section="proof" style={SECTION}>
        <SectionTitle>{COPY.landing.proof.heading}</SectionTitle>
        <p style={MUTED}>{COPY.landing.proof.body}</p>
      </section>

      {/* 9 — pricing (the same pricing.json as /pricing; the Essay card leads — REQ-POS-2) */}
      <section data-section="pricing" style={SECTION}>
        <SectionTitle>{COPY.landing.pricing.heading}</SectionTitle>
        <p style={MUTED}>{COPY.landing.pricing.body}</p>
        {essayCard && reviewRow ? (
          <div style={{ ...CARD, maxWidth: "420px" }}>
            <strong>{essayCard.label}</strong>
            <p style={{ ...MUTED, maxWidth: "100%", fontSize: "13px" }}>
              {essayCard.words.toLocaleString("en-US")} words · {essayCard.claims} claims — Review {rangeLabel(reviewRow.range)} credits
            </p>
          </div>
        ) : null}
        <p style={{ marginTop: "12px" }}>
          <a href="/pricing" style={CTA_GHOST}>{COPY.landing.pricing.cta}</a>
        </p>
      </section>

      {/* 10 — changelog + FAQ */}
      <section data-section="changelog" style={SECTION}>
        <SectionTitle>{COPY.landing.changelog.heading}</SectionTitle>
        <p style={MUTED}>{COPY.landing.changelog.body}</p>
      </section>
      <section data-section="faq" style={SECTION}>
        <SectionTitle>{COPY.landing.faq.heading}</SectionTitle>
        {COPY.landing.faq.items.map((f) => {
          // HOT.1 — a `claimId` item renders its PUBLIC_CLAIM_COPY variant only while enabled.
          const answer =
            "claimId" in f && f.claimId != null && publicClaimEnabled(f.claimId, claims)
              ? PUBLIC_CLAIM_COPY[f.claimId].landingFaqAnswer
              : f.a;
          return (
            <details key={f.q} style={{ marginBottom: "8px", maxWidth: "68ch" }}>
              <summary style={{ cursor: "pointer", fontSize: "14px", fontWeight: 600 }}>{f.q}</summary>
              <p style={{ ...MUTED, marginTop: "6px" }}>{answer}</p>
            </details>
          );
        })}
      </section>

      {/* 11 — final CTA */}
      <section data-section="final-cta" style={{ ...SECTION, marginBottom: "48px" }}>
        <SectionTitle>{COPY.landing.finalCta.heading}</SectionTitle>
        <p style={MUTED}>{COPY.landing.finalCta.body}</p>
        <p style={{ marginTop: "16px" }}>
          <a href="/signup" style={CTA}>{COPY.landing.finalCta.cta}</a>{" "}
          <a href="/invite" style={{ marginLeft: "16px", fontSize: "14px" }}>{COPY.landing.finalCta.signIn}</a>
          {open ? null : null}
        </p>
      </section>
      {/* the drop-zone hold + landing.viewed beacon (progressive — absent bundle ⇒ no-JS links still work) */}
      <script src="/assets/landing.js" defer />
    </Shell>
  );
}

/** §15.2 — /pricing: the ladder + cost-range cards + matrix + FAQ, all derived (never hand-typed). */
export function PricingPage(): ReactNode {
  const { pricing: cycle, claims } = usePageData();
  const data = buildPricingPageData(claims);
  const annual = cycle?.annual === true;
  return (
    <Shell
      brand={COPY.brand}
      tagline={COPY.tagline}
      nav={
        <>
          <a href="/" style={{ marginRight: "16px" }}>{COPY.brand}</a>
          <a href="/login" style={{ marginRight: "16px" }}>{COPY.landing.nav.signIn}</a>
        </>
      }
      footer={<span>{COPY.footer}</span>}
    >
      <SectionTitle>{COPY.pricing.heading}</SectionTitle>
      <p style={MUTED}>{COPY.pricing.lede}</p>
      <p style={MUTED}>{fmtCopy(COPY.pricing.annualSavingLine, { pct: data.annualSavingsPct })}</p>
      <p style={{ fontSize: "14px" }}>
        <a href="/pricing">{COPY.pricing.monthlyLabel}</a>
        {" · "}
        <a href="/pricing?cycle=annual">{COPY.pricing.annualLabel}</a>
      </p>

      {/* the ladder — Free honest before AND after day 14; Team's price + waitlist CTA */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px", marginTop: "20px" }}>
        {data.plans.map((p) => (
          <div key={p.tier} style={CARD}>
            <strong style={{ fontSize: "15px" }}>{p.display}{p.perSeat ? ` ${COPY.pricing.perSeatLabel}` : ""}</strong>
            <div style={{ fontSize: "26px", marginTop: "8px" }}>
              ${annual && p.annualMonthlyUsd != null ? p.annualMonthlyUsd : p.monthlyUsd}
              <span style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>/mo</span>
            </div>
            {annual && p.annualSavingsUsdPerYear != null && p.annualSavingsUsdPerYear > 0 ? (
              <div style={{ fontSize: "12px", color: "var(--state-ready)" }}>
                {fmtCopy(COPY.pricing.annualSaveFmt, { n: p.annualSavingsUsdPerYear })}
              </div>
            ) : null}
            <div style={{ fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "8px" }}>
              {p.includedCreditsMonthly > 0
                ? `${p.includedCreditsMonthly.toLocaleString("en-US")} ${COPY.pricing.includedCreditsLabel}`
                : "—"}
            </div>
            {p.freeNotes ? (
              <div style={{ fontSize: "12px", color: "var(--shell-fg-muted)", marginTop: "8px" }}>
                {/* HOT.1 — absent while the included-Review claim is hidden. */}
                {p.freeNotes.trialWindow != null ? <div>{p.freeNotes.trialWindow}</div> : null}
                <div style={{ marginTop: "4px" }}>{p.freeNotes.postTrial}</div>
              </div>
            ) : (
              /* HOT.1 — null while the plan's coverage line is a hidden claim. */
              p.whatItCovers != null ? (
                <div style={{ fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "8px" }}>{p.whatItCovers}</div>
              ) : null
            )}
            <div style={{ marginTop: "14px" }}>
              {p.waitlist ? (
                <a href="/signup?intent=team" style={CTA_GHOST}>{COPY.pricing.waitlistCta}</a>
              ) : (
                <a href="/signup" style={CTA_GHOST}>{COPY.pricing.startCta}</a>
              )}
            </div>
          </div>
        ))}
      </div>
      <p style={{ ...MUTED, marginTop: "10px", fontSize: "12px" }}>
        {fmtCopy(
          publicClaimEnabled("trial.firstReviewIncluded", claims)
            ? PUBLIC_CLAIM_COPY["trial.firstReviewIncluded"].trialRuleFmt
            : COPY.pricing.trialRuleFmt,
          { days: data.trial.windowDays },
        )}
      </p>

      {/* the cost-range cards — Essay leads, Academic second, then Book chapter + the voice card
          (REQ-POS-2); every figure is a tier range at Standard rigor, never a single number
          (REQ-GROWTH-6). */}
      <section style={SECTION}>
        <SectionTitle>{COPY.pricing.costCardsHeading}</SectionTitle>
        <p style={MUTED}>{COPY.pricing.costCardsNote}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
          {data.cards.map((card) => (
            <div key={card.key} style={CARD} data-cost-card={card.key}>
              <strong>{card.label}</strong>
              <div style={{ fontSize: "12px", color: "var(--shell-fg-muted)", marginTop: "4px" }}>
                {card.words.toLocaleString("en-US")} words · {card.claims} claims
              </div>
              <dl style={{ fontSize: "13px", marginTop: "10px" }}>
                {card.rows.map((r) => (
                  <div key={r.key} style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                    <dt style={{ color: "var(--shell-fg-muted)" }}>{r.label}</dt>
                    <dd style={{ margin: 0 }}>{rangeLabel(r.range)} cr</dd>
                  </div>
                ))}
              </dl>
              <details style={{ fontSize: "12px", color: "var(--shell-fg-muted)", marginTop: "8px" }}>
                <summary>Full round by tier</summary>
                <div>Base ≈ {card.fullRoundByTier.base.toLocaleString("en-US")} · Balanced ≈ {card.fullRoundByTier.balanced.toLocaleString("en-US")} · Frontier ≈ {card.fullRoundByTier.frontier.toLocaleString("en-US")}</div>
              </details>
            </div>
          ))}
          <div style={CARD} data-cost-card="voice">
            <strong>{COPY.pricing.voiceCardHeading}</strong>
            <div style={{ fontSize: "12px", color: "var(--shell-fg-muted)", marginTop: "4px" }}>
              {fmtCopy(COPY.pricing.voiceCardLine, { words: data.voiceCard.words.toLocaleString("en-US") })}
            </div>
            <div style={{ fontSize: "13px", marginTop: "10px" }}>{rangeLabel(data.voiceCard.range)} cr</div>
          </div>
        </div>
        <p style={{ ...MUTED, fontSize: "12px", marginTop: "10px" }}>
          {fmtCopy(COPY.pricing.quickLineFmt, {
            cap: data.quickReview.wordCap.toLocaleString("en-US"),
            quick: data.quickReview.byRigor.quick,
            standard: data.quickReview.byRigor.standard,
            fb: data.quickReview.byRigor.full_board,
          })}
        </p>
      </section>

      {/* the matrix — Write · Review · Voice · Run · Account rows, derived cells */}
      <section style={SECTION}>
        <SectionTitle>{COPY.pricing.matrixHeading}</SectionTitle>
        <table style={{ borderCollapse: "collapse", fontSize: "13px", marginTop: "8px" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "6px 12px 6px 0", borderBottom: "1px solid var(--shell-border)" }} />
              {data.matrix.columns.map((col) => (
                <th key={col} style={{ textAlign: "left", padding: "6px 12px", borderBottom: "1px solid var(--shell-border)" }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.matrix.rows.map((row) => (
              <tr key={row.label}>
                <th style={{ textAlign: "left", padding: "6px 12px 6px 0", borderBottom: "1px solid var(--shell-border)", color: "var(--shell-fg-muted)", fontWeight: 500 }}>{row.label}</th>
                {row.cells.map((cellv, i) => (
                  <td key={i} style={{ padding: "6px 12px", borderBottom: "1px solid var(--shell-border)" }}>{cellv}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* top-up packs — derived rows */}
      <section style={SECTION}>
        <SectionTitle>{COPY.pricing.topUpHeading}</SectionTitle>
        <ul style={{ ...MUTED, paddingLeft: "18px" }}>
          {data.topUpPacks.map((t) => (
            <li key={t.id}>${t.usd} → {t.credits.toLocaleString("en-US")} {COPY.pricing.creditsLabel}</li>
          ))}
        </ul>
        <p style={MUTED}>{fmtCopy(COPY.pricing.topUpNoteFmt, { months: data.topUp.expiryMonths })}</p>
      </section>

      {/* the FAQ — generated from the same constants the estimator uses (REQ-GROWTH-9) */}
      <section style={SECTION}>
        <SectionTitle>{COPY.pricing.faqHeading}</SectionTitle>
        {data.faq.map((f) => (
          <details key={f.q} style={{ marginBottom: "8px", maxWidth: "72ch" }}>
            <summary style={{ cursor: "pointer", fontSize: "14px", fontWeight: 600 }}>{f.q}</summary>
            <p style={{ ...MUTED, marginTop: "6px" }}>{f.a}</p>
          </details>
        ))}
      </section>
    </Shell>
  );
}

const fieldStyle = {
  display: "block",
  width: "100%",
  padding: "8px 10px",
  marginTop: "4px",
  borderRadius: "8px",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-bg)",
  color: "var(--shell-fg)",
  fontSize: "14px",
  boxSizing: "border-box" as const,
};

/**
 * §15.3 — /signup: the intent-carrying admission form (Google or magic link — no password, no
 * questionnaire, no card). `?intent=review` (a held drop-zone file) / `?entry=` / `?src=` ride the
 * POST's hidden fields into POST /signup's `intent` — the api persists them once at creation. The
 * sent state renders the read-only Showcase preview (the sample dossier) per §15.3.
 */
export function SignupPage(): ReactNode {
  const { signup } = usePageData();
  const open = signup?.signupOpen === true;
  const entry = signup?.entry;
  const intentNote =
    entry === "draft"
      ? COPY.signup.intentNoteDraft
      : entry === "outline"
        ? COPY.signup.intentNoteOutline
        : null;
  return (
    <Shell brand={COPY.brand} footer={<span>{COPY.footer}</span>}>
      <div style={{ maxWidth: "380px", margin: "0 auto" }}>
        <SectionTitle>{signup?.sent ? COPY.signup.sentHeading : COPY.signup.heading}</SectionTitle>
        {signup?.sent ? (
          <>
            <p role="status" style={{ color: "var(--state-ready)", fontSize: "13px" }}>{COPY.login.linkSent}</p>
            <p style={MUTED}>{COPY.signup.sentBody}</p>
          </>
        ) : (
          <>
            <p style={{ color: "var(--shell-fg-muted)", fontSize: "13px" }}>{COPY.signup.lede}</p>
            {intentNote ? <p style={{ fontSize: "13px", color: "var(--state-ready)" }}>{intentNote}</p> : null}
            {signup?.error ? (
              <p role="alert" style={{ color: "var(--sev-blocking)", fontSize: "13px" }}>{signup.error}</p>
            ) : null}
            <form method="post" action="/signup">
              <input type="hidden" name="entry" value={entry ?? ""} />
              <input type="hidden" name="src" value={signup?.src ?? ""} />
              <input type="hidden" name="held" value={signup?.held === true ? "1" : ""} />
              <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>
                {open ? COPY.signup.codeLabelOptional : COPY.signup.codeLabel}
                <input name="code" required={!open} defaultValue={signup?.code ?? ""} style={fieldStyle} />
              </label>
              <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "12px", display: "block" }}>
                {COPY.signup.emailLabel}
                <input name="email" type="email" required defaultValue={signup?.email ?? ""} placeholder={COPY.signup.emailPlaceholder} style={fieldStyle} />
              </label>
              <div style={{ marginTop: "16px" }}>
                <button type="submit" name="method" value="magic_link" style={{ ...CTA, border: "none", cursor: "pointer", width: "100%" }}>
                  {COPY.signup.continueEmail}
                </button>
              </div>
              <div style={{ textAlign: "center", color: "var(--shell-fg-faint)", fontSize: "12px", margin: "12px 0" }}>{COPY.signup.orDivider}</div>
              <div>
                <button type="submit" name="method" value="google" style={{ ...CTA_GHOST, border: "1px solid var(--shell-border)", cursor: "pointer", width: "100%" }}>
                  {COPY.signup.continueGoogle}
                </button>
              </div>
            </form>
            <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", marginTop: "20px" }}>
              {COPY.signup.chooseEntry}{" "}
              <a href="/signup?entry=scratch">{COPY.signup.entryScratch}</a>
              {" · "}
              <a href="/signup?entry=outline">{COPY.signup.entryOutline}</a>
              {" · "}
              <a href="/signup?entry=draft">{COPY.signup.entryDraft}</a>
            </p>
          </>
        )}
      </div>
      {signup?.sent ? (
        <section style={SECTION}>
          <SectionTitle>{COPY.signup.sampleHeading}</SectionTitle>
          <DossierView
            title={SAMPLE_DOSSIER.projectTitle}
            letter={SAMPLE_DOSSIER.letter}
            claims={SAMPLE_DOSSIER.claims}
            findings={SAMPLE_DOSSIER.findings}
            labels={dossierLabels}
          />
        </section>
      ) : null}
    </Shell>
  );
}
