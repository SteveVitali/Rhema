# ADR-046: An unresolved relative figure becomes a warning + an inert placeholder — never a live URL

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** ONB.1
- **Requirement ids:** REQ-INGEST-7, REQ-GROWTH-1 (amended)
- **Spec:** §9.5, §5.3

## Context

PR-R5's second fidelity finding: imported drafts carry relative image paths
(`![](figure_1_five_questions.png)` — images are never part of the single-file upload), and the
rendered Page fetched each one live: a stream of 404s against `usercontent` on every page view.
The conversion pipeline had no resolution step — a relative reference passed through verbatim
into the canonical body. REQ-INGEST-7 already wants an honest warning for unconvertible spans;
the question was what the *body* should carry for a reference that can never resolve.

## Decision

- **`inertUnresolvedImages`** (`packages/markdown/src/import-doc.ts`) rewrites every
  `![alt](target)` whose target is not `https?://` or `data:` to `![<resolved-alt>]()` — the
  empty-URL form. The alt text keeps meaning: empty alts inherit the basename
  (`figure_1_five_questions.png` → alt `figure_1_five_questions`) so the placeholder still says
  what is missing. Reference-style image definitions (`[id]: figure_1.png`) used by `![alt][id]`
  are inerted the same way.
- **The empty URL is load-bearing, not cosmetic:** the PM `figure` schema
  (`packages/editor/src/schema.ts`) renders `src=""` as the inert `.rm-figure-placeholder`
  element — zero network requests, ever, on every render of every revision. A live-but-404ing
  URL was never an acceptable body form.
- **Each inerted path is a `image_dropped` warning** — `"figure_1.png wasn't included — add it or
  remove the reference"` (REQ-INGEST-7's copy shape), and a `clean` verdict degrades to `partial`
  only when a warning fired (a doc with no relative references keeps `clean`).
- `convertBytes` runs the rewrite inside the same pre-normalize pass as the title extraction —
  the stored canonical body is already inert, so the Page, the editor, and every mirror path see
  the same safe form with no second pass.

## Consequences

- Imported drafts render their missing figures as labelled placeholders; the Page issues **zero**
  requests for paths that were never uploaded (the ticket's deterministic AC).
- The warning tells the author exactly which file is missing and what to do — the placeholder is
  a reminder, not silent data loss.
- `![](…)`-empty is idempotent under `normalizeMarkdown` and survives the markdown↔PM round trip.
- Absolute `https?://` and `data:` images are untouched — only references that provably cannot
  resolve are inerted.

## Alternatives considered

- **Leave the relative URL; let serving 404.** The status quo — live broken-image requests on
  every Page render, and a console full of 404s the user cannot fix. Rejected.
- **Strip the image node entirely.** Erases the author's intent and makes the warning the only
  trace of a figure — a page with three stripped figures reads as if they never existed.
  Rejected: the placeholder preserves structure for a later upload-and-fix (P1.13's lane).
- **Resolve relatives against `usercontent`.** There is nothing to resolve against — the upload
  is a single file; fabricating a bucket URL just moves the 404 inside a `src` that *will* be
  fetched. Rejected.
- **A `data:` placeholder image.** Still a render-time image node the schema treats as real
  content; `src=""` is the placeholder path the editor already owns. Rejected.

## Revisit trigger

Reopen when figure upload/management (P1.13's lane) can resolve a relative reference against an
import bundle — at that point resolution runs before inerting, and `inertUnresolvedImages`
becomes the fallback for genuinely absent files only.
