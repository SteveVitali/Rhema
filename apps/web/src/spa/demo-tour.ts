// R7DEM.5 (REQ-DWEB-13) — THE LAZY TOUR SEAM. This module is the dynamic-`import()` boundary
// `demo-effects.tsx` owns: the whole guided tour (step schema, coach marks, tour copy) loads
// through this chunk and stays out of the entry graph. **222_R7DEM.6a fills it** — until
// then `mountDemoTour` is an honest no-op: no overlay, no steps, no copy.
//
// It must never import snapshot JSON or corpus text — the snapshot-marker bundle grep
// (demo-bundle.test.ts) fails on any snapshot byte in `public/spa` (REQ-DWEB-13; S-12: tour
// copy is `COPY` leaves, not data).

/** The seam's entry point — 222 replaces the body with the tour mount. */
export function mountDemoTour(): void {
  // intentionally empty — the boundary is what 221 ships; the tour lands in 222.
}
