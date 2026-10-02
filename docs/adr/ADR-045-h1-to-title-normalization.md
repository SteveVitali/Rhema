# ADR-045: A document's leading H1 is the title — extracted at convert, defaulted at create, never demoted to a body H2

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** ONB.1
- **Requirement ids:** REQ-GROWTH-1 (amended)
- **Spec:** §9.5, §5.3

## Context

PR-R5's fidelity finding: an imported manuscript whose first line is `# The Question` produced a
project with a filename-derived title AND a body rendered `## The Question` — the document's own
title demoted and duplicated under the wrong one. §9.5's canonical rule is "no body H1; the title
lives in front matter" — `demoteHeadings` correctly refuses body H1s, but nobody *consumed* the
extracted level for the project's title. The ticket owns the rule that closes the loop.

## Decision

- **`ConversionResult.title?: string`** — an optional, additive contract field carrying the
  document's own title.
- **`extractLeadingTitle`** (`packages/markdown/src/import-doc.ts`) is the single extraction:
  applied to the converted body BEFORE `normalizeMarkdown`, it detects a document-leading H1
  (skipping front matter and leading blanks), removes that one heading line, and returns its
  text. A non-leading or absent H1 changes nothing — a *second* H1 in the body still demotes to
  H2 under the canonical rule, untouched.
- **`convertBytes` wires it before normalize** — so the extracted title never reaches the body as
  a demoted duplicate, and the body's canonical form ("title in front matter") is preserved by
  the same normalize pass that already ran.
- **Title resolution at create is `typed → H1 → filename-stem`** (`project-routes.ts`): an
  explicitly typed title always wins; the H1 is the *default when none was typed* (the ticket's
  wording); the filename stem is the last resort (unchanged). The conversion preview shows the
  resolved title so the default is never a surprise.
- Voice-sample imports are untouched: a canonical doc already carries its title in front matter
  and has no leading body H1 — `extractLeadingTitle` is a no-op on it, and `normalizeMarkdown`
  stays idempotent (REQ-DATA-9d).

## Consequences

- An imported `# My Novel` manuscript lands titled "My Novel" with the heading consumed — one
  title, one place, no duplicate body H2.
- The field is optional and additive: older `converted/*.json` payloads (no `title`) still
  validate, and any consumer that ignores it degrades to the pre-ONB.1 filename-stem default.
- The title is *authoritative only about the document's own words* — it can never overwrite an
  author's typed choice.

## Alternatives considered

- **Demote in place (status quo).** Left the duplicate title rendering and the filename-derived
  project title — the exact PR-R5 defect. Rejected.
- **Client-side extraction (the island or the form).** Parses Markdown a second time at the edge
  and can disagree with `convertBytes`' sniff/normalize view of the same bytes. The converter is
  the only place the document's true first block is known. Rejected.
- **`required` title on ConversionResult.** Breaks every stored `converted/*.json` written
  pre-ONB.1 and every format that legitimately has no title. Rejected — optional is the
  append-only contract change.

## Revisit trigger

Reopen if a format's converter produces a leading-H1 semantic other than "the document's title"
(e.g. an EPUB chapter heading that should NOT become the project title) — the extraction would
move behind a per-format flag rather than run unconditionally.
