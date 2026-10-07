# ADR-035: Model-tier default resolution — explicit → project → account → §6.5 notch, plan-clamped

- **Status:** Accepted
- **Date:** 2026-10-04
- **Ticket:** EST.1
- **Requirement ids:** REQ-IDE-13 (amended), REQ-PERSONA-5 (tier half), REQ-BILL-6
- **Spec:** §5.6, §6.5 (the rigor table's model-tier column), §14.2; PR-E2 (tier never the user's)
- **Related:** ADR-014 §6 (the tier is a user choice), ADR-034 (the one API), ADR-033

## Context

Before this ticket the sheet never showed the model tier and never submitted one: `POST /p/:slug/run`
called `normalizeTier("")`, which silently derived the tier from the rigor notch's §6.5 column — so a
user's stored `model_tier_default` (project) and `prefs.defaultModelTier` (account) were written but
never read, and the tier the run priced was an accident of the rigor pick (BL-58, PR-E2).

The decision to own: the precedence order among (a) an explicit choice (`?tier=` / the select's
posted value), (b) the project default, (c) the account pref, (d) the §6.5 rigor-notch column, and
where the plan's permitted tiers bite.

## Decision

**`resolveSheetConfig` (run-sheet `surface.ts`) is the one resolver**, applied identically by the
sheet GET/POST, the Timeline chip, and the protocol cards:

1. **Explicit** — `?rigor=`/`?tier=` (or the posted `rigor`/`modelTier`).
2. **Project** — `projects.rigor_default` / `projects.model_tier_default`.
3. **Account** — `prefs.rigorByWorkflow[workflow]` → `prefs.defaultRigor`; `prefs.defaultModelTier`.
4. **Notch** — the §6.5 rigor column's `modelTier` (rigor defaults to `"standard"`).

Then the result is **clamped to the plan's `allowedModelTiers`** (`clampModelTierTo` — nearest
permitted tier at-or-below, `base` floor). A clamped tier records `requestedModelTier` so the sheet
renders the "Your plan includes Base only — priced on Base" notice (never silently repricing to a
different tier without saying so).

- The sheet's **Model-tier select** is a user choice inside plan rules: permitted tiers are
  selectable; locked tiers render disabled with their repriced estimate for context
  (`(not on your plan)` suffix). A Free/trial plan sees Base only.
- The **POST forwards the chosen tier verbatim** when canonical; the api's plan gate
  (`modelTierAllowed`, trial Base-only) is the enforcer — a forged locked-tier POST 403s
  `model_tier_requires_upgrade`/`trial_base_only` and the web re-renders the clamped sheet.
- The **inline recompute script** repaints the estimate box on a tier change (the embedded lever
  matrix covers every rigor|tier|toggle state), and a rigor change KEEPS the user's tier — the tier
  is the user's pick, not a rigor consequence.
- The insufficient-balance panel's "switch to Base" option appears only when the plan permits Base
  AND the run isn't already priced at it (`resolveInsufficientBalance`'s `allowedModelTiers`).

## Consequences

- Tier is independent state on the run (frozen `model_tier`, REQ-BILL-6) — a rigor flip on a
  submitted sheet no longer silently reprices to the notch's tier.
- Stored account/project defaults finally take effect (the "dead" settings become live).
- The Timeline chip, protocol card and sheet can only agree about the tier because they share the
  resolver + the clamp.

## Alternatives considered

- **Tier as pure rigor consequence (status quo).** Rejected — BL-58/PR-E2: the spec gives the user
  the choice within plan rules.
- **Account pref beating the project default.** Rejected — a project's explicit setting is the
  narrower scope and should win (mirrors the rigor chain that already resolved project → account).
- **Server-side clamp only (no UI lock).** Rejected — REQ-PERSONA-5: a locked tier renders locked
  with its price, not absent; "shown locked" is the disclosure.

## Revisit trigger

A fourth tier level, or per-workflow tier entitlements (per-plan × per-workflow allowlists) — then
`allowedModelTiers` becomes a function of (plan, workflow) rather than plan alone.
