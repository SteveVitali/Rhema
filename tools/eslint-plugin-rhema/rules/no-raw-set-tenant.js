"use strict";

/**
 * Tenant-scope guard (REQ-DATA-4 amended; REQ-ARCH-25). The tenant is set ONLY inside the transaction wrapper
 * in packages/db (rls.ts), which uses parameterized `set_config('app.tenant_id', …, true)`. A raw
 * `SET app.tenant_id = …` (or `SET LOCAL app.tenant_id`) anywhere else is a tenancy hole — it can string-
 * concatenate a tenant id into SQL and bypass the single sanctioned code path. This rule flags any string
 * literal or template chunk containing a raw `set [local] app.tenant_id` (case-insensitive), AND —
 * BL-118/RH-A1-9 — a `set_config('app.tenant_id', …)` anywhere except the wrapper file itself:
 * hand-rolled copies of the wrapper's GUC set bypass the rule exactly the same way (the parameterized
 * form was previously invisible to it). The allowlist is exactly rls.ts; everyone else calls withTenant.
 */

const RAW_SET_TENANT = /\bset\s+(?:local\s+)?app\.tenant_id\b/i;
const SET_CONFIG_TENANT = /\bset_config\s*\(\s*['"]app\.tenant_id['"]/i;

/** The one file allowed to name the GUC — withTenant's own implementation. */
const WRAPPER_SUFFIX = "packages/db/src/rls.ts";

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
      setConfigTenant:
        "set_config('app.tenant_id', …) outside @rhema/db's withTenant wrapper is forbidden (REQ-DATA-4/REQ-ARCH-25) — call withTenant() instead of hand-rolling the GUC set.",
    },
  },
  create(context) {
    // The wrapper's own file is the sole site allowed to name the GUC in set_config form.
    const isWrapper = (context.filename || "").replace(/\\/g, "/").endsWith(WRAPPER_SUFFIX);
    function scan(node, text) {
      if (typeof text !== "string") return;
      if (RAW_SET_TENANT.test(text)) {
        context.report({ node, messageId: "rawSetTenant" });
      } else if (!isWrapper && SET_CONFIG_TENANT.test(text)) {
        context.report({ node, messageId: "setConfigTenant" });
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
