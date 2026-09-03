"use strict";

/**
 * Tenant-scope guard (REQ-DATA-4 amended; REQ-ARCH-25). The tenant is set ONLY inside the transaction wrapper
 * in packages/db (rls.ts), which uses parameterized `set_config('app.tenant_id', …, true)`. A raw
 * `SET app.tenant_id = …` (or `SET LOCAL app.tenant_id`) anywhere else is a tenancy hole — it can string-
 * concatenate a tenant id into SQL and bypass the single sanctioned code path. This rule flags any string
 * literal or template chunk containing a raw `set [local] app.tenant_id` (case-insensitive). The wrapper's
 * `set_config(...)` form does NOT match, so it is allowed; nothing else may set the GUC.
 */

const RAW_SET_TENANT = /\bset\s+(?:local\s+)?app\.tenant_id\b/i;

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow a raw `SET app.tenant_id`; set the tenant only via the packages/db withTenant wrapper (set_config)",
    },
    schema: [],
    messages: {
      rawSetTenant:
        "Raw `SET app.tenant_id` is forbidden (REQ-DATA-4). Set the tenant only via withTenant() in @rhema/db, which uses parameterized set_config('app.tenant_id', …, true).",
    },
  },
  create(context) {
    function scan(node, text) {
      if (typeof text === "string" && RAW_SET_TENANT.test(text)) {
        context.report({ node, messageId: "rawSetTenant" });
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
