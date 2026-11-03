import { describe, it, expect } from "vitest";
import { resolveProxyDatabaseUrl } from "./main.js";

// R6HRD.1 — the proxy's resolver DSN moved out of the InstanceTemplate `database-url`
// metadata (plaintext, visible to `compute.instances.get`) into a Secret Manager reference
// the app resolves at boot through the same `SecretAccessor` seam as ANTHROPIC_KEY_SECRET.
// `DATABASE_URL` stays the local/test fallback; neither set fails closed.
describe("resolveProxyDatabaseUrl (R6HRD.1)", () => {
  const accessor = async (name: string): Promise<string> => `resolved:${name}`;

  it("prefers DATABASE_URL_SECRET — the value comes from Secret Manager, not env", async () => {
    await expect(
      resolveProxyDatabaseUrl(
        {
          databaseUrl: "postgresql://legacy-fallback",
          databaseUrlSecret: "projects/p/secrets/rhema-prod-proxy-database-url/versions/latest",
        },
        accessor,
      ),
    ).resolves.toBe("resolved:projects/p/secrets/rhema-prod-proxy-database-url/versions/latest");
  });

  it("passes the secret NAME verbatim — metadata carries a reference, never the value", async () => {
    let seen = "";
    await resolveProxyDatabaseUrl(
      { databaseUrlSecret: "projects/p/secrets/s/versions/3" },
      async (n) => ((seen = n), "dsn"),
    );
    expect(seen).toBe("projects/p/secrets/s/versions/3");
  });

  it("falls back to the literal DATABASE_URL env when no secret name is set", async () => {
    await expect(
      resolveProxyDatabaseUrl({ databaseUrl: "postgresql://local" }, accessor),
    ).resolves.toBe("postgresql://local");
  });

  it("fails closed with a named reason when neither path is configured", async () => {
    await expect(resolveProxyDatabaseUrl({}, accessor)).rejects.toThrow(
      "missing required env DATABASE_URL or DATABASE_URL_SECRET",
    );
  });

  it("an accessor failure propagates — a versionless/unnamed secret never silently serves", async () => {
    await expect(
      resolveProxyDatabaseUrl(
        { databaseUrlSecret: "projects/p/secrets/missing/versions/latest" },
        async (n) => {
          throw new Error(`secret-manager: ${n} has no payload`);
        },
      ),
    ).rejects.toThrow("has no payload");
  });
});
