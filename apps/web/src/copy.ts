// The beta shell's i18n string table — the single home for every user-facing chrome string. AC4 lints this
// table against Appendix D.2 (via @rhema/contracts `lintCopy`), so the canonical vocabulary is enforced from
// the first screen (REQ-PROD-6 / REQ-BILL-18). Keep ALL user-facing chrome here; editorial CONTENT (the
// sample dossier's prose) lives in sample-dossier.ts and is not product vocabulary.

export const COPY = {
  brand: "Rhēma",
  tagline: "A serious editor for serious writing.",

  invite: {
    heading: "Rhēma is in private beta.",
    lede:
      "Rhēma reads a finished draft the way a demanding editor would — it checks every load-bearing claim against real sources, maps the argument, and hands back a dossier you can act on.",
    accessNote: "Access is by invitation. If you have a code, sign in below.",
    sampleHeading: "See what it hands back",
    sampleLede:
      "A read-only sample dossier from a real essay. Note the contradicted claim, verified against the source it cites.",
    signInCta: "Have a code? Sign in",
  },

  login: {
    heading: "Sign in",
    note: "Private beta — an invitation code is required.",
    codeLabel: "Invitation code",
    codePlaceholder: "Enter your code",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    continueEmail: "Email me a sign-in link",
    continueGoogle: "Continue with Google",
    orDivider: "or",
    linkSent: "Check your email for a sign-in link.",
    errorRequired: "An invitation code is required to sign in.",
    errorInvalid: "That invitation code isn't valid.",
    errorExpired: "That invitation code has expired.",
    errorRevoked: "That invitation code is no longer active.",
    errorExhausted: "That invitation code has already been used.",
    errorEmailMismatch: "That invitation code is reserved for a different email.",
    errorEmailRequired: "Enter the email your invitation was sent to.",
  },

  projects: {
    heading: "Your projects",
    empty: "No projects yet.",
    signOut: "Sign out",
  },

  project: {
    backToList: "All projects",
    betaNote: "The full editing surface arrives with the studio. This is the beta view.",
  },

  dossier: {
    letterHeading: "The Editor's letter",
    claimsHeading: "Claim ledger",
    findingsHeading: "Findings",
    readOnlyNote: "Read-only sample. In your projects, each finding is something you can act on.",
    fetchedLabel: "fetched",
    contradictedTierOneLabel: "Contradicted · Tier 1",
  },

  notFound: {
    heading: "Not found",
    body: "That page doesn't exist.",
    home: "Go home",
  },

  footer: "Rhēma · private beta",
} as const;

/** A `[path, value]` pair for every string leaf in the copy tree (functions/objects skipped). */
export function collectCopyStrings(
  obj: unknown = COPY,
  prefix = "",
): [string, string][] {
  const out: [string, string][] = [];
  if (typeof obj === "string") {
    out.push([prefix || "(root)", obj]);
    return out;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      out.push(...collectCopyStrings(v, prefix ? `${prefix}.${k}` : k));
    }
  }
  return out;
}
