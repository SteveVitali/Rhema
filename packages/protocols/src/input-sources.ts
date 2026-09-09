// Closed input-source schema (REQ-OBJ-11). The protocol package declares the ONLY sources a protocol's
// configuration may derive from — venue tables, §18 evaluation results, run inputs — and NEVER anything
// derived from `dispositions` or any reception of Editor output feeding review configs, severity
// thresholds, phase prompts, or rubric anchors. The Editor→config feedback loop is the firewall this
// closes: if what the Editor says could tune the config that judges the next piece, the review is no
// longer independent. A CI contract test enumerates the allowed sources and fails a planted
// disposition-derived parameter (AC8), the way REQ-ARCH-33 greps client bundles for protocol markers.

/** The closed set of sources a protocol config may derive from. */
export const ALLOWED_INPUT_SOURCES = ["protocol_seed", "venue_table", "eval_result", "run_input", "genre_ledger"] as const;
export type ProtocolInputSource = (typeof ALLOWED_INPUT_SOURCES)[number];

/** Sources that are explicitly forbidden, with the reason (all are Editor-output → config feedback). */
export const FORBIDDEN_INPUT_SOURCES: Record<string, string> = {
  disposition: "derived from `dispositions` — Editor/author output feeding config (REQ-OBJ-11)",
  editor_output: "a reception of Editor output feeding a review config",
  review_finding: "review findings feeding config or severity thresholds",
  severity_feedback: "severity thresholds tuned from Editor output",
  rubric_reception: "rubric anchors fed back from reception of Editor output",
  phase_prompt_feedback: "phase prompts derived from Editor output",
};

export interface InputSourceViolation {
  source: string;
  reason: string;
}

/** Validate a declared input-source list against the closed enumeration (REQ-OBJ-11). */
export function validateInputSources(sources: readonly string[]): { ok: boolean; violations: InputSourceViolation[] } {
  const violations: InputSourceViolation[] = [];
  for (const source of sources) {
    const forbidden = FORBIDDEN_INPUT_SOURCES[source];
    if (forbidden) {
      violations.push({ source, reason: forbidden });
    } else if (!(ALLOWED_INPUT_SOURCES as readonly string[]).includes(source)) {
      violations.push({ source, reason: "not in the closed allowed-input-source enumeration (REQ-OBJ-11)" });
    }
  }
  return { ok: violations.length === 0, violations };
}

/** Enumerate a protocol's declared input sources (the field the contract test scans). */
export function enumerateProtocolInputSources(protocol: { inputSources: readonly string[] }): readonly string[] {
  return protocol.inputSources;
}

/** Throw if any declared input source is not in the closed allowed set (REQ-OBJ-11). */
export function assertClosedInputSources(protocol: { id?: string; inputSources: readonly string[] }): void {
  const { ok, violations } = validateInputSources(protocol.inputSources);
  if (!ok) {
    const detail = violations.map((v) => `${v.source} (${v.reason})`).join("; ");
    throw new Error(`protocol ${protocol.id ?? "?"}: forbidden input source(s): ${detail}`);
  }
}
