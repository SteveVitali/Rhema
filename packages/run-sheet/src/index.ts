// @rhema/run-sheet — the run sheet's estimator-driven logic (REQ-SPEC-16, REQ-BILL-5, §5.6). The stateless
// estimate (provisional-then-refined), the lever matrix with signed deltas, and the launcher-shape
// RunSheetView. Depends on @rhema/contracts (the money contract) and @rhema/protocols (the estimator); the
// presentational component lives in @rhema/ui and the endpoint in apps/api. The full-IDE sheet (P1.6)
// reuses these contracts verbatim.

export const PACKAGE_NAME = "@rhema/run-sheet" as const;

export * from "./profiles.js";
export * from "./estimate.js";
export * from "./lever-matrix.js";
export * from "./view.js";
