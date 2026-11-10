import { RuleTester } from "eslint";
import { afterAll, describe, it } from "vitest";
import rule from "./no-banned-strings.js";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const options = [{ banned: ["Claude Code"] }];

// R7COPY.1a (REQ-GUARD-2a) — the REQ-COPY-6 regex patterns leg (seeded from @rhema/contracts'
// BANNED_INTERNAL_TERMS in eslint.config.js).
const patterns = [
  {
    bannedPatterns: [
      { text: "Waiting on your call", pattern: "\\bwaiting on your call\\b", flags: "i" },
      { text: "the coherence read", pattern: "\\bthe coherence read\\b", flags: "i" },
      { text: "QUIET", pattern: "\\bQUIET\\b", flags: "" },
      { text: "gate", pattern: "\\bgates?\\b", flags: "i" },
    ],
  },
];

ruleTester.run("no-banned-strings", rule as never, {
  valid: [
    { code: `const brand = "Rhema";`, options },
    { code: `const s = "our own harness";`, options },
    // No options -> rule is inert.
    { code: `const s = "Claude Code";`, options: [] },
    // R7COPY.1a — a quoted property KEY is an internal id (the feed's "gate.opened" event type), not
    // user-facing copy; bannedPatterns never flags it.
    { code: `const templates = { "gate.opened": "Waiting — {kind}" };`, options: patterns },
    // "QUIET" is case-sensitive on purpose — lowercase "quiet" (the feature's name) is not the term.
    { code: `const note = "Quiet hours";`, options: patterns },
    { code: `const a = "waiting for you";`, options: patterns },
  ],
  invalid: [
    {
      code: `const label = "Powered by Claude Code";`,
      options,
      errors: [{ messageId: "banned" }],
    },
    {
      code: "const t = `built on Claude Code today`;",
      options,
      errors: [{ messageId: "banned" }],
    },
    // R7COPY.1a — a seeded banned-term VALUE fails the bannedPatterns leg.
    {
      code: `const copy = { badgeLine: "Waiting on your call: {n}" };`,
      options: patterns,
      errors: [{ messageId: "banned" }],
    },
    {
      code: `const copy = { note: "every change is an unlinked edit (the coherence read)" };`,
      options: patterns,
      errors: [{ messageId: "banned" }],
    },
    {
      code: `const copy = { bucket: "QUIET" };`,
      options: patterns,
      errors: [{ messageId: "banned" }],
    },
    {
      code: "const copy = { hint: `the run asks at the gates you name` };",
      options: patterns,
      errors: [{ messageId: "banned" }],
    },
  ],
});
