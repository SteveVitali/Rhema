"use strict";

/**
 * Canonical-vocabulary guard (cross-cutting invariant 1; REQ-SPEC-2, Appendix D.2): plans, model
 * tiers, rigor levels, seats and approvals are a disjoint, verbatim vocabulary; banned synonyms
 * must never appear in source or user-facing strings. This rule flags configured banned substrings
 * inside string literals and template chunks. The authoritative banned list is passed as options
 * (kept in one place: eslint.config.js), so later tickets extend it without touching the rule.
 */

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow banned canonical-vocabulary strings in source",
    },
    schema: [
      {
        type: "object",
        properties: {
          banned: {
            type: "array",
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      banned:
        "Banned canonical-vocabulary string '{{term}}'. Use the disjoint vocabulary from spec Appendix D.2.",
    },
  },
  create(context) {
    const options = context.options[0] || {};
    const banned = (options.banned || []).filter((s) => typeof s === "string" && s.length > 0);
    if (banned.length === 0) return {};
    const lowered = banned.map((b) => ({ raw: b, lc: b.toLowerCase() }));

    function scan(node, text) {
      if (typeof text !== "string") return;
      const hay = text.toLowerCase();
      for (const { raw, lc } of lowered) {
        if (hay.includes(lc)) {
          context.report({ node, messageId: "banned", data: { term: raw } });
          return;
        }
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === "string") scan(node, node.value);
      },
      TemplateElement(node) {
        scan(node, node.value && node.value.cooked);
      },
    };
  },
};
