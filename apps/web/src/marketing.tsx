// P1.17 (§15.1–§15.3) — the public funnel pages: the landing (twelve sections, the v0.3 order),
// /pricing (every figure derived through `buildPricingPageData` — nothing hand-typed), and /signup
// (the intent-carrying admission form + the magic-link wait screen's read-only Showcase preview).
// All copy comes from COPY.landing / COPY.pricing / COPY.signup — `lintCopy` AND `lintGrowthCopy`
// run over those keys in copy.test.ts, so the honest-marketing rules fail CI, not review.
// Progressive enhancement everywhere: forms POST, links navigate, and the drop-zone works without
// JS (the file input's label links to /signup; landing.js adds the client-side hold).

import type { ReactNode } from "react";
import { Shell, PageTitle, SectionTitle, DossierView, type DossierLabels } from "@rhema/ui";
import { buildPricingPageData, rangeLabel, PUBLIC_CLAIM_COPY, publicClaimEnabled, MODEL_TIERS, MODEL_TIER_DISPLAY, HERO_RECORDING } from "@rhema/contracts";
import { surfacePricer } from "@rhema/run-sheet";
import { COPY } from "./copy.js";
import { SAMPLE_DOSSIER } from "./sample-dossier.js";
import { usePageData } from "./page-data.js";
import { publicFooter } from "./legal.js";

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

// ---- 249a R7PUB.1 (REQ-PUB-2) — the dedicated marketing chrome + the hero-recording slot ----

/**
 * The R7b marketing layout (REQ-PUB-2): a wider header/nav than the shared flat `Shell` — the
 * wordmark, the product nav (Pricing · the /demo entry · Sign in), and the primary CTA — over
 * the same public footer. The demo link is a document navigation like every other /demo entry
 * (S-14; `data-spa-native` + `data-demo-entry="nav"`).
 */
function MarketingShell({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="ui-t-vh" style={{ display: "flex", flexDirection: "column" }}>
      <header
        data-mk-nav
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          borderBottom: "1px solid var(--shell-border)",
          padding: "14px 24px",
        }}
      >
        <a href="/" className="ui-d-b" style={{ fontSize: "16px", color: "var(--shell-fg)", textDecoration: "none" }}>
          {COPY.brand}
        </a>
        <nav style={{ display: "flex", alignItems: "center", gap: "16px", marginLeft: "auto", fontSize: "14px" }}>
          <a href="/pricing">{COPY.landing.nav.pricing}</a>
          <a href="/demo" data-spa-native data-demo-entry="nav">
            {COPY.footerDemo}
          </a>
          <a href="/login">{COPY.landing.nav.signIn}</a>
          <a href="/signup" style={CTA}>{COPY.landing.hero.ctaPrimary}</a>
        </nav>
      </header>
      <main style={{ flex: 1, width: "100%", maxWidth: "1120px", margin: "0 auto", padding: "24px 24px 0", boxSizing: "border-box" }}>
        {children}
      </main>
      <footer style={{ borderTop: "1px solid var(--shell-border)", textAlign: "center", padding: "16px", fontSize: "12px", color: "var(--shell-fg-faint)" }}>
        {publicFooter()}
      </footer>
    </div>
  );
}

/**
 * The hero-recording slot (REQ-PUB-2 + REQ-GROWTH-3). One box, ONE reserved aspect — the
 * placeholder and the clip render the identical box so swapping states can never shift layout
 * (CLS 0). Until 250 commits the declared asset the slot renders a static placeholder frame —
 * no `<video>`, no corpus bytes. With the clip committed: a muted, looping, playsinline
 * `<video>` whose source is `data-hero-src` (never a `src` — the bytes do not fetch until the
 * landing island arms it) and whose poster paints immediately. No `autoplay`: the island adds
 * the source and calls play() only when the visitor has NOT asked for reduced motion, so a
 * reduced-motion browser shows the poster frame alone and zero `<video>` elements play.
 */
export function HeroRecordingSlot(): ReactNode {
  const { heroClip } = usePageData();
  const box = {
    aspectRatio: HERO_RECORDING.aspectRatio,
    width: "100%",
    maxWidth: "560px",
    border: "1px solid var(--shell-border)",
    borderRadius: "12px",
    overflow: "hidden",
    background: "var(--shell-raised)",
  } as const;
  return (
    <div data-hero-slot style={box}>
      {heroClip === true ? (
        <video
          data-hero-video
          muted
          loop
          playsInline
          preload="none"
          poster={HERO_RECORDING.posterUrl}
          aria-label={COPY.landing.hero.recordingAlt}
          style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
        >
          <source data-hero-src={HERO_RECORDING.clipUrl} type="video/mp4" />
        </video>
      ) : (
        <div
          data-hero-placeholder
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", padding: "24px", boxSizing: "border-box" }}
        >
          <span style={MUTED}>{COPY.landing.hero.recordingAlt}</span>
        </div>
      )}
    </div>
  );
}

/**
 * §15.1 — the landing page's twelve sections, v0.3 order: nav · hero · the dossier · workflow strip ·
 * the author's seat · voices · live runs · models · proof · pricing · changelog+FAQ · final CTA
 * (the nav is the Shell's own chrome). The drop-zone hero holds a file client-side (IndexedDB via
 * landing.js) and routes to /signup?intent=review; without JS the affordance is a plain link.
 */
export function LandingPage(): ReactNode {
  const { invite, claims } = usePageData();
  const open = invite?.signupOpen === true;
  // EST.1 — the same estimator-facing API prices the landing figures (never the retired modelled pricer).
  const pricing = buildPricingPageData(claims, surfacePricer());
  const essayCard = pricing.cards.find((card) => card.key === "essay") ?? pricing.cards[0];
  const reviewRow = essayCard?.rows.find((r) => r.key === "review");
  return (
    <MarketingShell>
      {/* 1 — hero (the drop-zone IS the hero's primary affordance; REQ-GROWTH-1) */}
      <section data-section="hero">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "32px", alignItems: "center" }}>
          <div style={{ flex: "1 1 380px", minWidth: "280px" }}>
        {/* §15.1 — the display headline sets in the paper serif (Literata, already the reading
            face): the marketing voice is the written word, not the UI grotesk. */}
        <h1
          data-display-headline
          className="ui-t-ffp"
          style={{ fontSize: "clamp(40px, 5.5vw, 72px)", lineHeight: 1.05, maxWidth: "16ch", margin: "24px 0 16px" }}
        >
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
        {/* 222 R7DEM.6a (REQ-TOUR-4; S-14) — the hero's secondary CTA into /demo: a document
            navigation (data-spa-native), never a client hop. */}
        <p style={{ marginTop: "10px", fontSize: "14px" }}>
          <a href="/demo" data-spa-native data-demo-entry="landing" style={{ color: "var(--accent)", fontWeight: 600 }}>
            {COPY.landing.hero.demoCta}
          </a>
        </p>
          </div>
          {/* REQ-PUB-2 + REQ-GROWTH-3 — the hero-recording slot beside the hero copy: one
              reserved box; the placeholder until 250 commits the declared clip + poster. */}
          <div style={{ flex: "1 1 420px", minWidth: "280px" }}>
            <HeroRecordingSlot />
          </div>
        </div>
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
        {/* REQ-PUB-2 — the FAQ rides the Accordion's `.ui-accordion*` visual system; on the
            no-JS funnel the items ARE styled native <details> (the KIT-1 fallback), so the
            section opens identically with or without the island. */}
        <div className="ui-accordion" data-faq style={{ maxWidth: "68ch" }}>
          {COPY.landing.faq.items.map((f) => {
            // HOT.1 — a `claimId` item renders its PUBLIC_CLAIM_COPY variant only while enabled.
            const answer =
              "claimId" in f && f.claimId != null && publicClaimEnabled(f.claimId, claims)
                ? PUBLIC_CLAIM_COPY[f.claimId].landingFaqAnswer
                : f.a;
            return (
              <details key={f.q} className="ui-accordion-item" data-faq-item>
                <summary className="ui-accordion-trigger" style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600 }}>
                  <span>{f.q}</span>
                </summary>
                <div className="ui-accordion-panel">
                  <p style={{ ...MUTED, marginTop: "6px" }}>{answer}</p>
                </div>
              </details>
            );
          })}
        </div>
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
    </MarketingShell>
  );
}

/**
 * §15.2 — /pricing: the ladder + cost-range cards + matrix + FAQ, all derived (never hand-typed).
 * REQ-PUB-1 (249a) — the page renders for a signed-in reader too: the account menu links here as
 * a document navigation, so the nav swaps its sign-in affordance for the way back to /app.
 */
export function PricingPage(): ReactNode {
  const { pricing: cycle, claims, signedIn } = usePageData();
  const data = buildPricingPageData(claims, surfacePricer());
  const annual = cycle?.annual === true;
  return (
    <Shell
      brand={COPY.brand}
      tagline={COPY.tagline}
      nav={
        <>
          <a href="/" style={{ marginRight: "16px" }}>{COPY.brand}</a>
          {signedIn === true ? (
            <a href="/app" data-pricing-app style={{ marginRight: "16px" }}>{COPY.pricing.backToApp}</a>
          ) : (
            <a href="/login" style={{ marginRight: "16px" }}>{COPY.landing.nav.signIn}</a>
          )}
        </>
      }
      footer={publicFooter()}
    >
      <PageTitle>{COPY.pricing.heading}</PageTitle>
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
            <strong style={{ fontSize: "15px" }}>{p.display}</strong>
            <div style={{ fontSize: "26px", marginTop: "8px" }}>
              ${annual && p.annualMonthlyUsd != null ? p.annualMonthlyUsd : p.monthlyUsd}
              {/* PR-U6/ACT.1 — Team is per-seat: `$40/seat/mo`, never a bare `$40/mo`. */}
              <span style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>
                {p.perSeat ? "/seat/mo" : "/mo"}
              </span>
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
                /* PR-U6/ACT.1 — a paid plan's CTA names the plan; Free keeps "Start free". */
                <a href="/signup" style={CTA_GHOST}>
                  {p.tier === "free"
                    ? COPY.pricing.startCta
                    : fmtCopy(COPY.pricing.startPlanCtaFmt, { plan: p.display })}
                </a>
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
        {/* R6MNY.1 (REQ-LCH-5a) — the new-user charge explanation: the same metered claim the
            paid-account notice carries, ahead of the ruled launch flips. */}
        <p style={MUTED}>{COPY.pricing.meteredNote}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
          {data.cards.map((card) => (
            <div
              key={card.key}
              style={CARD}
              data-cost-card={card.key}
              data-words={card.words}
              data-claims={card.claims}
            >
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
                <div>
                  {MODEL_TIERS.map((tier, i) => (
                    <span key={tier}>
                      {i > 0 ? " · " : ""}{MODEL_TIER_DISPLAY[tier]} ≈{" "}
                      {card.fullRoundByTier[tier] != null ? card.fullRoundByTier[tier]!.toLocaleString("en-US") : "—"}
                    </span>
                  ))}
                </div>
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
            quick: data.quickReview.byRigor.quick?.toLocaleString("en-US") ?? "—",
            standard: data.quickReview.byRigor.standard?.toLocaleString("en-US") ?? "—",
            fb: data.quickReview.byRigor.full_board?.toLocaleString("en-US") ?? "—",
          })}
        </p>
      </section>

      {/* the matrix — Write · Review · Voice · Run · Account rows, derived cells.
          UX.2 (ADR-066) — contained horizontal scroll below the matrix's natural width: the PAGE
          never scrolls sideways; the table keeps its row↔column mapping inside a named, keyboard-
          scrollable region (WCAG 1.4.10's data-table exemption + axe's scrollable-region rule). */}
      <section style={SECTION}>
        <SectionTitle>{COPY.pricing.matrixHeading}</SectionTitle>
        <div
          className="table-scroll"
          role="region"
          aria-label={COPY.pricing.matrixHeading}
          tabIndex={0}
        >
        <table style={{ borderCollapse: "collapse", fontSize: "13px", marginTop: "8px", width: "100%", minWidth: "560px" }}>
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
        </div>
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
    <Shell brand={COPY.brand} footer={publicFooter()}>
      <div style={{ maxWidth: "380px", margin: "0 auto" }}>
        <PageTitle>{signup?.sent ? COPY.signup.sentHeading : COPY.signup.heading}</PageTitle>
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
            {/* SEC.2 (PR-U1 form half): under `open` the EMAIL field leads and the invitation code sits
                behind a disclosure — never the first focusable field. `invite` mode keeps the code
                first + required. Hidden intent inputs carry no focus order. */}
            <form method="post" action="/signup">
              <input type="hidden" name="entry" value={entry ?? ""} />
              <input type="hidden" name="src" value={signup?.src ?? ""} />
              <input type="hidden" name="held" value={signup?.held === true ? "1" : ""} />
              {open ? (
                <>
                  <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>
                    {COPY.signup.emailLabel}
                    <input name="email" type="email" required defaultValue={signup?.email ?? ""} placeholder={COPY.signup.emailPlaceholder} style={fieldStyle} />
                  </label>
                  {/* a re-rendered code opens the disclosure so the typed value stays visible. */}
                  <details open={!!signup?.code} style={{ marginTop: "12px" }}>
                    <summary style={{ fontSize: "13px", color: "var(--shell-fg-muted)", cursor: "pointer" }}>
                      {COPY.signup.codeToggle}
                    </summary>
                    <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "8px", display: "block" }}>
                      {COPY.signup.codeLabelOptional}
                      <input name="code" defaultValue={signup?.code ?? ""} style={fieldStyle} />
                    </label>
                  </details>
                </>
              ) : (
                <>
                  <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>
                    {COPY.signup.codeLabel}
                    <input name="code" required defaultValue={signup?.code ?? ""} style={fieldStyle} />
                  </label>
                  <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "12px", display: "block" }}>
                    {COPY.signup.emailLabel}
                    <input name="email" type="email" required defaultValue={signup?.email ?? ""} placeholder={COPY.signup.emailPlaceholder} style={fieldStyle} />
                  </label>
                </>
              )}
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

/**
 * UX.1 — `/showcase` (manifest invariant 13): the signed-OUT leg renders this page — the static,
 * read-only sample dossier (SAMPLE_DOSSIER, the same board read the landing and signup pages embed).
 * Signed-in visitors never reach this component: the server redirects them to their own Showcase
 * project's dossier (the api's session-bound `GET /showcase`). `signedIn` only swaps the CTAs.
 */
export function ShowcasePage({ signedIn = false }: { signedIn?: boolean } = {}): ReactNode {
  const C = COPY.showcase;
  return (
    <Shell
      brand={COPY.brand}
      tagline={COPY.tagline}
      nav={
        <>
          <a href="/pricing" style={{ fontSize: "13px" }}>{COPY.landing.pricing.cta}</a>
          <a href={signedIn ? "/app" : "/signup"} style={{ fontSize: "13px" }}>
            {signedIn ? COPY.project.backToList : C.signUpCta}
          </a>
        </>
      }
      footer={publicFooter()}
    >
      <PageTitle>{C.pageHeading}</PageTitle>
      <p style={{ fontSize: "16px", lineHeight: 1.6, color: "var(--shell-fg)", maxWidth: "68ch" }}>{C.pageLede}</p>
      <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px", maxWidth: "68ch" }}>{C.readOnlyNote}</p>
      {/* 222 R7DEM.6a (REQ-TOUR-4; S-14) — the /showcase → /demo entry: a document navigation. */}
      <p style={{ fontSize: "14px", maxWidth: "68ch" }}>
        {C.demoLead}{" "}
        <a href="/demo" data-spa-native data-demo-entry="showcase" style={{ color: "var(--accent)" }}>{C.demoLink}</a>
      </p>
      <DossierView
        title={SAMPLE_DOSSIER.projectTitle}
        letter={SAMPLE_DOSSIER.letter}
        claims={SAMPLE_DOSSIER.claims}
        findings={SAMPLE_DOSSIER.findings}
        labels={dossierLabels}
      />
    </Shell>
  );
}
