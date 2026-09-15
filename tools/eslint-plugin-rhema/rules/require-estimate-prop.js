"use strict";

/**
 * REQ-GROWTH-16 — `RunButton` is one of the only two components that trigger agent work, and it REQUIRES an
 * `estimate` prop: a run is never launched without a shown estimate (§5.6; the run sheet is the only
 * paywall). This rule flags a `<RunButton …>` JSX element (or `React.createElement(RunButton, …)`) that has
 * no `estimate` attribute. A spread attribute (`{...props}`) is conservatively accepted — the estimate may
 * come through it, and a false positive on a legitimate spread is worse than the type system already
 * requiring the prop. `AskButton` is exempt (it opens a free Assistant turn, not a run).
 */

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "require an `estimate` prop on <RunButton> (REQ-GROWTH-16: a run is never launched without a shown estimate)",
    },
    schema: [],
    messages: {
      missingEstimate:
        "<RunButton> requires an `estimate` prop (REQ-GROWTH-16): a run is never launched without a shown estimate.",
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const name = node.name;
        if (!name || name.type !== "JSXIdentifier" || name.name !== "RunButton") return;
        let hasEstimate = false;
        let hasSpread = false;
        for (const attr of node.attributes) {
          if (attr.type === "JSXSpreadAttribute") hasSpread = true;
          else if (attr.type === "JSXAttribute" && attr.name && attr.name.name === "estimate") hasEstimate = true;
        }
        if (!hasEstimate && !hasSpread) {
          context.report({ node, messageId: "missingEstimate" });
        }
      },
    };
  },
};
