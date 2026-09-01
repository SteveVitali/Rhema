import { describe, it, expect } from "vitest";
import { resolveProtocols } from "./protocols-resolver.mjs";

describe("resolveProtocols (REQ-ARCH-37)", () => {
  const stubPath = "/repo/packages/protocols-stub";

  it("uses the private checkout when it is present (path resolution)", () => {
    const r = resolveProtocols({
      privatePath: "/elsewhere/rhema-protocols",
      stubPath,
      exists: (p) => p === "/elsewhere/rhema-protocols",
    });
    expect(r).toEqual({ source: "private", path: "/elsewhere/rhema-protocols" });
  });

  it("falls back to the stub when no private path is configured (public clone)", () => {
    const r = resolveProtocols({ privatePath: undefined, stubPath, exists: () => false });
    expect(r).toEqual({ source: "stub", path: stubPath });
  });

  it("falls back to the stub when the configured private path does not exist", () => {
    const r = resolveProtocols({
      privatePath: "/missing",
      stubPath,
      exists: () => false,
    });
    expect(r).toEqual({ source: "stub", path: stubPath });
  });
});
