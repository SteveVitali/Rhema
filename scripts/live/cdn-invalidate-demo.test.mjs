import { describe, expect, it } from "vitest";
import {
  assertDemoInvalidationPath,
  CdnInvalidationRefusal,
  DEFAULT_PATH,
  invalidateArgv,
  run,
  urlMapNameFromList,
} from "./cdn-invalidate-demo.mjs";

// R7DEP.1 (S-13; REQ-DWEB-10) — the demo twin CDN invalidation is scoped, dry-runnable and
// refuses every non-demo path. These legs pin the guard before the Part-B act is ever run.

describe("assertDemoInvalidationPath — the namespace guard", () => {
  it("accepts the canonical S-13 act and narrower per-essay prefixes", () => {
    expect(assertDemoInvalidationPath("/bff/p/demo~*")).toBe("/bff/p/demo~*");
    expect(
      assertDemoInvalidationPath("/bff/p/demo~structure-of-political-difference*"),
    ).toBe("/bff/p/demo~structure-of-political-difference*");
    expect(assertDemoInvalidationPath("/bff/p/demo~spd/v/1*")).toBe("/bff/p/demo~spd/v/1*");
    // An exact (non-wildcard) demo twin path is still inside the namespace.
    expect(assertDemoInvalidationPath("/bff/p/demo~spd")).toBe("/bff/p/demo~spd");
  });

  it("refuses every path outside the demo BFF namespace", () => {
    for (const p of [
      "/*",
      "/",
      "/bff/*",
      "/bff/p/*",
      "/bff/p/demo*", // a real tenant slug prefix — no tilde
      "/bff/p/demo~", // missing: must name a concrete demo path or prefix
      "/p/demo~*", // the document namespace is NOT the twin cache
      "/demo*",
      "/bff/x/demo~*",
      "/a/demo*",
      "/bff/demo/*",
      "demo~*",
      "",
      "bff/p/demo~*",
      "https://rhema.tools/bff/p/demo~*",
      "/bff/p/demo~spd*extra*",
      "/bff/p/demo~*/v/1",
      "/bff/p/demo~%2e%2e/*",
      "/bff/p/demo~spd/../admin*",
      "/bff/p/demo~spd?b=1*",
      "/bff/p/demo~spd#frag*",
      "/bff/p/demo~spd x*",
    ]) {
      expect(() => assertDemoInvalidationPath(p), `path ${JSON.stringify(p)}`).toThrow(
        CdnInvalidationRefusal,
      );
    }
  });
});

describe("urlMapNameFromList", () => {
  it("returns the single prod url-map name; null on zero or ambiguous matches", () => {
    expect(
      urlMapNameFromList(JSON.stringify([{ name: "rhema-prod-urlmap-a1b2c3" }])),
    ).toBe("rhema-prod-urlmap-a1b2c3");
    expect(urlMapNameFromList("[]")).toBeNull();
    expect(
      urlMapNameFromList(
        JSON.stringify([{ name: "rhema-prod-urlmap-a" }, { name: "rhema-prod-urlmap-b" }]),
      ),
    ).toBeNull();
    expect(urlMapNameFromList(JSON.stringify([{ name: "other-map" }]))).toBeNull();
    expect(urlMapNameFromList("not json")).toBeNull();
  });
});

describe("invalidateArgv + run — dry-run equals the act", () => {
  const argv = invalidateArgv({
    urlMap: "rhema-prod-urlmap-a1b2c3",
    path: DEFAULT_PATH,
    host: "rhema.tools",
    project: "rhema-507501",
  });
  it("builds the exact gcloud invocation", () => {
    expect(argv).toEqual([
      "compute",
      "url-maps",
      "invalidate-cdn-cache",
      "rhema-prod-urlmap-a1b2c3",
      "--path",
      "/bff/p/demo~*",
      "--project",
      "rhema-507501",
      "--host",
      "rhema.tools",
    ]);
  });

  it("dry-run prints the act's argv and executes nothing", () => {
    const calls = [];
    const out = [];
    const status = run(
      ["--dry-run", "--url-map", "rhema-prod-urlmap-a1b2c3"],
      {
        exec: (args) => {
          calls.push(args);
          return { status: 0, stdout: "" };
        },
        out: (m) => out.push(m),
      },
    );
    expect(status).toBe(0);
    expect(calls).toEqual([]); // explicit --url-map ⇒ not even the list call
    expect(out.join("\n")).toContain("gcloud compute url-maps invalidate-cdn-cache");
    expect(out.join("\n")).toContain("/bff/p/demo~*");
  });

  it("the act runs the printed argv (dry-run output == executed argv)", () => {
    const calls = [];
    run(["--url-map", "rhema-prod-urlmap-a1b2c3"], {
      exec: (args) => {
        calls.push(args);
        return { status: 0, stdout: "" };
      },
      out: () => {},
    });
    expect(calls).toEqual([argv]);
  });

  it("resolves the url map through gcloud when --url-map is absent", () => {
    const calls = [];
    run(["--dry-run"], {
      exec: (args) => {
        calls.push(args);
        return args[1] === "url-maps" && args[2] === "list"
          ? { status: 0, stdout: JSON.stringify([{ name: "rhema-prod-urlmap-x1y2z3" }]) }
          : { status: 0, stdout: "" };
      },
      out: () => {},
    });
    expect(calls).toEqual([
      ["compute", "url-maps", "list", "--project", "rhema-507501", "--format", "json"],
    ]);
  });

  it("refuses a non-demo --path before any exec", () => {
    const calls = [];
    expect(() =>
      run(["--path", "/bff/*", "--dry-run"], {
        exec: (a) => {
          calls.push(a);
          return { status: 0, stdout: "" };
        },
        out: () => {},
      }),
    ).toThrow(CdnInvalidationRefusal);
    expect(calls).toEqual([]);
  });

  it("propagates a failed act as non-zero", () => {
    const status = run(["--url-map", "rhema-prod-urlmap-a1b2c3"], {
      exec: () => ({ status: 7, stdout: "" }),
      out: () => {},
    });
    expect(status).toBe(7);
  });
});
