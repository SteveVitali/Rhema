import { describe, expect, it } from "vitest";
import { GOOGLE_OAUTH_ORIGINS, isGoogleOAuthRedirect } from "./oauth.js";

describe("GOOGLE_OAUTH_ORIGINS / isGoogleOAuthRedirect", () => {
  it("admits the Google authorization endpoint", () => {
    expect(GOOGLE_OAUTH_ORIGINS).toContain("https://accounts.google.com");
    expect(isGoogleOAuthRedirect("https://accounts.google.com/o/oauth2/v2/auth?state=x")).toBe(true);
  });

  it("refuses lookalike and non-Google origins — never followed", () => {
    expect(isGoogleOAuthRedirect("https://accounts.google.com.evil.example/x")).toBe(false);
    expect(isGoogleOAuthRedirect("https://evil.example/steal")).toBe(false);
    expect(isGoogleOAuthRedirect("http://accounts.google.com/x")).toBe(false); // https only
    expect(isGoogleOAuthRedirect("javascript:alert(1)")).toBe(false);
    expect(isGoogleOAuthRedirect("not a url")).toBe(false);
  });
});
