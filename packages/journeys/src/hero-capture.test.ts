// 249a R7PUB.1 (REQ-PUB-2; REQ-GROWTH-3) — the capture recipe's deterministic half: the
// limits check (a seeded over-limit clip MUST fail), the markup contract (the clip arm's
// muted/loop/lazy attrs; the placeholder arm), and the signed-in refusal inputs.

import { describe, expect, it } from "vitest";
import { HERO_RECORDING } from "@rhema/contracts";
import { checkHeroLimits, checkHeroMarkup } from "./hero-capture.js";

describe("hero-capture — checkHeroLimits (REQ-GROWTH-3)", () => {
  it("a conforming clip passes", () => {
    expect(checkHeroLimits({ durationS: 12.4, bytes: 1_400_000, hasAudio: false })).toEqual([]);
  });
  it("a seeded over-duration clip fails", () => {
    const v = checkHeroLimits({ durationS: HERO_RECORDING.maxSeconds + 0.1, bytes: 100, hasAudio: false });
    expect(v.join(" ")).toMatch(/exceeds the 15s limit/);
  });
  it("a seeded over-bytes clip fails", () => {
    const v = checkHeroLimits({ durationS: 10, bytes: HERO_RECORDING.maxBytes + 1, hasAudio: false });
    expect(v.join(" ")).toMatch(/exceeds the 2097152B limit/);
  });
  it("a clip carrying an audio stream is not muted and fails", () => {
    expect(checkHeroLimits({ durationS: 10, bytes: 100, hasAudio: true }).join(" ")).toMatch(/muted/);
  });
});

describe("hero-capture — checkHeroMarkup", () => {
  const clipArm = `<div data-hero-slot style="aspect-ratio: 16 / 9"><video data-hero-video muted loop playsinline preload="none" poster="/assets/media/hero-tour-poster.jpg"><source data-hero-src="/assets/media/hero-tour.mp4" type="video/mp4"></video></div>`;
  const placeholderArm = `<div data-hero-slot><div data-hero-placeholder>frame</div></div>`;
  it("the clip arm passes with muted+loop+playsinline+lazy source+poster", () => {
    expect(checkHeroMarkup(clipArm)).toEqual([]);
  });
  it("the placeholder arm passes (no <video>, no corpus bytes)", () => {
    expect(checkHeroMarkup(placeholderArm)).toEqual([]);
  });
  it("an un-muted, non-looping, eager clip fails the contract", () => {
    const bad = `<div data-hero-slot><video data-hero-video autoplay preload="auto"><source src="/x.mp4"></video></div>`;
    const v = checkHeroMarkup(bad).join(" ");
    expect(v).toMatch(/muted/);
    expect(v).toMatch(/loop/);
    expect(v).toMatch(/autoplay/);
    expect(v).toMatch(/inline src/);
  });
  it("a missing slot fails", () => {
    expect(checkHeroMarkup("<div>plain</div>").join(" ")).toMatch(/data-hero-slot/);
  });
});

describe("hero-capture — the declaration the recipe and slot share", () => {
  it("the declared paths and limits are the ONE source of truth", () => {
    expect(HERO_RECORDING.maxSeconds).toBe(15);
    expect(HERO_RECORDING.maxBytes).toBe(2 * 1024 * 1024);
    expect(HERO_RECORDING.clipUrl).toBe(`/assets/media/${HERO_RECORDING.clipLocalRel.split("/")[1]}`);
    expect(HERO_RECORDING.posterUrl).toBe(`/assets/media/${HERO_RECORDING.posterLocalRel.split("/")[1]}`);
  });
});
