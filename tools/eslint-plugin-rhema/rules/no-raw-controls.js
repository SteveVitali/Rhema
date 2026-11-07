"use strict";

/**
 * REQ-GUARD-1 — `no-raw-controls` (225a_R7KIT.2b; spec §4.16; RV-16 scope). The UX recurrence
 * guard that keeps migrated surfaces migrated: a raw `<button|input|select|textarea>` (R6 §4's
 * census counted 166 of them across the worst files) or an inline spacing/type/colour/radius
 * literal in a `style={…}` prop is an error — controls come from `primitives/**` and values from
 * `uiCss()`/tokens. Scope lives in `eslint.config.js` (`packages/ui/src/` except `primitives/`
 * — the kit itself — plus every `apps/web/src` tsx file).
 *
 * Enabled GLOBALLY at `error` since 249_R7GUARD.1: authored `off`, each KIT-3 batch enabled it
 * per migrated file via the retired `NO_RAW_CONTROLS_ENABLED` list (232, 234, 240, 240a, 241,
 * 242, 243, 243a, 248a), and 249 collapsed the list into the single global block.
 *
 * Exemptions: the committed no-JS/SSR list in `no-raw-controls-exemptions.js` — `{file,
 * component?, reason}`; `file` suffix-matches the linted path and `component`, when present,
 * narrows the exemption to that component's JSX. `options.exemptions` overrides the default list
 * (tests exercise it directly).
 */

const RAW_ELEMENTS = new Set(["button", "input", "select", "textarea"]);

// The same property list the primitives/ no-inline-literals source-scan bans (spacing, type,
// colour, radius, and their box metrics). CSS custom properties (`--*`) are never literals.
const BANNED_STYLE_KEYS = new Set([
  "fontSize",
  "fontFamily",
  "fontWeight",
  "fontStyle",
  "lineHeight",
  "letterSpacing",
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "gap",
  "rowGap",
  "columnGap",
  "borderRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "borderWidth",
  "borderColor",
  "color",
  "background",
  "backgroundColor",
  "outlineColor",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "top",
  "left",
  "right",
  "bottom",
  "inset",
  "translate",
  "size",
  "aspectRatio",
]);

const DEFAULT_EXEMPTIONS = require("./no-raw-controls-exemptions.js");

/** The name of the function/component enclosing `node`, walking ancestors, or null. */
function enclosingComponentName(node) {
  let cur = node.parent;
  while (cur != null) {
    if (cur.type === "FunctionDeclaration" && cur.id && cur.id.name) return cur.id.name;
    if (
      (cur.type === "FunctionExpression" || cur.type === "ArrowFunctionExpression") &&
      cur.parent != null
    ) {
      const p = cur.parent;
      if (p.type === "VariableDeclarator" && p.id.type === "Identifier") return p.id.name;
      if (p.type === "Property" && p.key.type === "Identifier") return p.key.name;
      if (p.type === "MethodDefinition" && p.key.type === "Identifier") return p.key.name;
      if (p.type === "ClassProperty" && p.key.type === "Identifier") return p.key.name;
      if (p.type === "PropertyDefinition" && p.key.type === "Identifier") return p.key.name;
    }
    cur = cur.parent;
  }
  return null;
}

/** Property key text for `{ key: v }` (identifier or string literal, non-computed), or null. */
function staticKeyName(prop) {
  if (prop.type !== "Property" || prop.computed === true) return null;
  if (prop.key.type === "Identifier") return prop.key.name;
  if (prop.key.type === "Literal" && typeof prop.key.value === "string") return prop.key.value;
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow raw <button|input|select|textarea> elements and inline spacing/type/colour/radius literals in migrated UI surfaces (REQ-GUARD-1)",
    },
    schema: [
      {
        type: "object",
        properties: {
          exemptions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                file: { type: "string" },
                component: { type: "string" },
                reason: { type: "string" },
              },
              required: ["file", "reason"],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      rawControl:
        "Raw <{{element}}> is banned here (REQ-GUARD-1). Use the @rhema/ui primitive (Button/TextField/Select/TextArea…) — migrated surfaces do not reintroduce native controls; no-JS/SSR controls need a named exemption.",
      styleLiteral:
        "Inline spacing/type/colour/radius literal `{{key}}` is banned here (REQ-GUARD-1). The value belongs in uiCss()/tokens; only `--*` custom properties may sit in style={…}.",
    },
  },
  create(context) {
    const options = context.options[0] || {};
    const exemptions = (options.exemptions ?? DEFAULT_EXEMPTIONS).filter(
      (e) => e && typeof e.file === "string" && e.file.length > 0,
    );
    const filename = String(context.physicalFilename ?? context.filename ?? "").replace(/\\/g, "/");
    const matching = exemptions.filter((e) => filename.endsWith(e.file));
    // A file-level entry exempts the whole file — no visitors needed.
    if (matching.some((e) => e.component == null)) return {};
    const componentExempts = matching.filter((e) => typeof e.component === "string");

    function isExempt(node) {
      if (componentExempts.length === 0) return false;
      const name = enclosingComponentName(node);
      return name != null && componentExempts.some((e) => e.component === name);
    }

    return {
      JSXOpeningElement(node) {
        const name = node.name;
        if (name.type !== "JSXIdentifier" || !RAW_ELEMENTS.has(name.name)) return;
        if (isExempt(node)) return;
        context.report({
          node,
          messageId: "rawControl",
          data: { element: name.name },
        });
      },
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "style") return;
        const value = node.value;
        if (
          value == null ||
          value.type !== "JSXExpressionContainer" ||
          value.expression.type !== "ObjectExpression"
        ) {
          return;
        }
        for (const prop of value.expression.properties) {
          // A spread's keys are not statically visible — conservatively accepted (the
          // require-estimate-prop precedent: a false positive is worse than a spread pass).
          if (prop.type === "SpreadElement") continue;
          const key = staticKeyName(prop);
          if (key == null || key.startsWith("--")) continue;
          if (!BANNED_STYLE_KEYS.has(key)) continue;
          if (isExempt(node)) return;
          context.report({ node, messageId: "styleLiteral", data: { key } });
          return;
        }
      },
    };
  },
};
