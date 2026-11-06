"use strict";

/**
 * eslint-plugin-rhema — repo-local rules enforcing the monorepo's Bazel-compatible invariants and
 * the canonical vocabulary (spec §13.2; cross-cutting invariant 1). Consumed by the flat config at
 * the repo root; the rules themselves are unit-tested with ESLint's RuleTester.
 */

const noCrossPackageRelativeImport = require("./rules/no-cross-package-relative-import.js");
const noBannedStrings = require("./rules/no-banned-strings.js");
const noRawSetTenant = require("./rules/no-raw-set-tenant.js");
const noSystemPoolInUserRoute = require("./rules/no-system-pool-in-user-route.js");
const requireEstimateProp = require("./rules/require-estimate-prop.js");
const noRawControls = require("./rules/no-raw-controls.js");
const noRawControlsExemptions = require("./rules/no-raw-controls-exemptions.js");

module.exports = {
  meta: { name: "eslint-plugin-rhema", version: "0.0.0" },
  rules: {
    "no-cross-package-relative-import": noCrossPackageRelativeImport,
    "no-banned-strings": noBannedStrings,
    "no-raw-set-tenant": noRawSetTenant,
    "no-system-pool-in-user-route": noSystemPoolInUserRoute,
    "require-estimate-prop": requireEstimateProp,
    "no-raw-controls": noRawControls,
  },
  // REQ-GUARD-1 (225a_R7KIT.2b) — the committed no-JS/SSR exemption list, exposed so the
  // batches' enablement blocks and config-resolution tests read the same data.
  noRawControlsExemptions,
};
