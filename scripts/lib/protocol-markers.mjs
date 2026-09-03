/**
 * Pure protocol-marker detection (spec §13.2 `public-safe`; REQ-ARCH-33). Protocol IP — skill text,
 * rubric language, calibration prompts — is baked into the private `run-task` image only and must
 * never reach a client bundle, the OpenAPI document, or any event payload. Any occurrence of a
 * sentinel marker in a public-facing artifact is a leak and fails CI.
 *
 * The private `packages/protocols` sources tag their sensitive blocks with these sentinels; the stub
 * carries none. This is the placeholder detector P0.01 ships; later tickets extend the marker set.
 */

export const DEFAULT_MARKERS = [
  "RHEMA-PROTOCOL-SECRET",
  "BEGIN-RHEMA-RUBRIC",
  "BEGIN-RHEMA-CALIBRATION",
  "rhema:protocol-only",
];

/**
 * @param {string} text
 * @param {string[]} [markers]
 * @returns {string[]} the markers found (empty when clean)
 */
export function findMarkers(text, markers = DEFAULT_MARKERS) {
  if (typeof text !== "string" || text.length === 0) return [];
  const hits = [];
  for (const marker of markers) {
    if (text.includes(marker)) hits.push(marker);
  }
  return hits;
}
