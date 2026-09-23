import { describe, it, expect } from "vitest";
import { statusMeters, venueCapLabel, WORDS_PER_MINUTE } from "./meters.js";

// Status-bar meters (P1.02; §5.4, REQ-PROD-14): word count, reading time, venue cap.

describe("statusMeters", () => {
  it("counts body words and derives reading minutes", () => {
    const md = "one two three four five.\n\nsix seven eight.";
    const m = statusMeters(md);
    expect(m.words).toBe(8);
    expect(m.readMin).toBe(1);
  });

  it("front-matter never counts toward body words", () => {
    const md = "---\ntitle: Many Wordy Words Here\n---\n\nbody only.";
    expect(statusMeters(md).words).toBe(2);
  });

  it("reading time rounds at ~238 wpm with a 1-minute floor", () => {
    const body = Array.from({ length: WORDS_PER_MINUTE * 3 }, () => "word").join(" ");
    expect(statusMeters(body).readMin).toBe(3);
    expect(statusMeters("short.").readMin).toBe(1);
  });
});

describe("venueCapLabel (REQ-PROD-14)", () => {
  it('over cap → "+212 over WaPo"', () => {
    expect(venueCapLabel(1012, "WaPo", 800)).toBe("+212 over WaPo");
  });
  it("under cap → remaining headroom", () => {
    expect(venueCapLabel(400, "WaPo", 800)).toBe("400 under WaPo");
  });
  it("exactly at cap → 0 under", () => {
    expect(venueCapLabel(800, "WaPo", 800)).toBe("0 under WaPo");
  });
});
