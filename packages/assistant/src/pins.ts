import { PINS_MAX_PER_THREAD, PIN_SUMMARY_TOKEN_CAP } from "@rhema/contracts";

// Pins (§7.1; REQ-CHAT-13): a thread's `pins.json` — the ≤12 durable "keep this" facts the
// compaction brief must survive. Each pin carries a ≤300-token summary and the set's token
// FOOTPRINT is shown to the user (the pin dialog's cost line). Pins are the correctability
// surface: the user edits/removes them under "What the assistant remembers".

/** Approximate token count for footprint display — chars/4 is the codebase's conventional estimate. */
export function tokenFootprint(text: string): number {
  return Math.ceil(text.length / 4);
}

/** One pinned fact in `pins.json`. */
export interface Pin {
  /** pin id (thread-local slug or minted id). */
  id: string;
  /** what it pins: a fact, a typed ref, or a source-note path. */
  kind: "fact" | "ref" | "source";
  /** the ref or note path (kind ref/source), else absent. */
  ref?: string;
  /** the ≤300-token summary shown in the remembers view. */
  summary: string;
  /** when it was pinned (ISO). */
  pinnedAt?: string;
}

/** The `pins.json` file shape. */
export interface PinsFile {
  version: 1;
  pins: Pin[];
}

export function emptyPins(): PinsFile {
  return { version: 1, pins: [] };
}

export function parsePins(json: string | null | undefined): PinsFile {
  if (!json) return emptyPins();
  try {
    const v = JSON.parse(json) as PinsFile;
    return { version: 1, pins: Array.isArray(v?.pins) ? v.pins : [] };
  } catch {
    return emptyPins();
  }
}

export function serializePins(file: PinsFile): string {
  return JSON.stringify({ version: 1, pins: file.pins }, null, 2) + "\n";
}

/** The summed token footprint of a pin set (the dialog's cost line). */
export function pinsFootprint(file: PinsFile): number {
  return file.pins.reduce((a, p) => a + tokenFootprint(p.summary), 0);
}

export type AddPinResult =
  | { ok: true; file: PinsFile; droppedOldest: boolean }
  | { ok: false; error: "pins_full" | "summary_too_long" };

/**
 * Add a pin (§7.1; REQ-CHAT-13): cap 12. At the cap the caller chooses: `dropOldest` evicts pin[0]
 * (the dialog's "replace oldest" affordance), otherwise the add refuses with `pins_full` — never a
 * silent overflow. A summary over the 300-token cap refuses `summary_too_long` (the pin is a summary,
 * not a paste buffer).
 */
export function addPin(
  file: PinsFile,
  pin: Pin,
  opts: { dropOldest?: boolean } = {},
): AddPinResult {
  if (tokenFootprint(pin.summary) > PIN_SUMMARY_TOKEN_CAP) {
    return { ok: false, error: "summary_too_long" };
  }
  const pins = [...file.pins];
  let droppedOldest = false;
  if (pins.length >= PINS_MAX_PER_THREAD) {
    if (!opts.dropOldest) return { ok: false, error: "pins_full" };
    pins.shift();
    droppedOldest = true;
  }
  pins.push(pin);
  return { ok: true, file: { version: 1, pins }, droppedOldest };
}

/** Remove a pin by id (the remembers view's unpin affordance). */
export function removePin(file: PinsFile, pinId: string): PinsFile {
  return { version: 1, pins: file.pins.filter((p) => p.id !== pinId) };
}
