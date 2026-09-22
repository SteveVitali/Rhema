// The token-authed internal-api client the HARNESS (uid `harness`) uses to drive the commit/deliver loop
// (P0.15e). It is the ONLY holder of the run token (the agent uid never sees it — REQ-SPEC-10/11); every call
// carries `Authorization: Bearer <runToken>` + the run's `attempt` (fenced server-side). A thin `fetch` shell
// over the `@rhema/api` internal routes; it is deploy wiring (exercised against the live api in Stage B), so it
// is not unit-tested offline — the loop it feeds is tested with an in-process client (harness-loop.test.ts).

import type { CommitCall, FailCall, HarnessApiClient, HarvestCall } from "./harness-loop.js";
import type { DeliveryArgs, NewVersion } from "@rhema/mirror";
import type { HarnessRunSpec } from "@rhema/orchestrator";

export interface HarnessApiClientConfig {
  readonly apiBaseUrl: string;
  readonly runId: string;
  /** the run token (0400 harness-only file) — this client is the sole holder; it never crosses to the agent. */
  readonly runToken: string;
}

/** Serialize a harvested version for the wire (bytes → base64; the JSON body carries no binary). */
function toWireVersion(v: NewVersion): Record<string, unknown> {
  return {
    path: v.path,
    root: v.root,
    kind: v.kind,
    namespace: v.namespace,
    sha256: v.sha256,
    bytesB64: Buffer.from(v.bytes).toString("base64"),
    wordCount: v.wordCount,
    ...(v.producerQueryId !== undefined ? { producerQueryId: v.producerQueryId } : {}),
  };
}

/** Build the `fetch`-backed internal-api client for a run (the harness holds the token). */
export function createHarnessApiClient(cfg: HarnessApiClientConfig): HarnessApiClient {
  const base = cfg.apiBaseUrl.replace(/\/$/, "");
  const runUrl = (path: string): string => `${base}/internal/runs/${cfg.runId}${path}`;
  const authHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
    authorization: `Bearer ${cfg.runToken}`,
    ...extra,
  });

  async function postJson<T>(path: string, body: unknown): Promise<{ status: number; json: T }> {
    const res = await fetch(runUrl(path), {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, json };
  }

  return {
    async heartbeat() {
      const res = await fetch(runUrl("/heartbeat"), { method: "PUT", headers: authHeaders() });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; cancelRequested?: boolean; state?: string };
      return { ok: json.ok === true, ...(json.cancelRequested != null ? { cancelRequested: json.cancelRequested } : {}), ...(json.state ? { state: json.state } : {}) };
    },

    async fetchRunSpec(): Promise<HarnessRunSpec> {
      const res = await fetch(runUrl("/runspec"), { headers: authHeaders() });
      if (!res.ok) throw new Error(`harness: run spec fetch failed ${res.status} for run ${cfg.runId}`);
      return (await res.json()) as HarnessRunSpec;
    },

    async harvest(args: HarvestCall) {
      const { json } = await postJson<{ producedVersionIds?: string[]; byPath?: Record<string, string>; provisionalCredits?: number }>(
        `/steps/${encodeURIComponent(args.stepKey)}/harvest`,
        {
          ordinal: args.ordinal,
          seat: args.seat,
          projectId: args.projectId ?? null,
          personaId: args.personaId ?? null,
          versions: args.versions.map(toWireVersion),
          usage: args.usage,
        },
      );
      return {
        producedVersionIds: json.producedVersionIds ?? [],
        byPath: json.byPath ?? {},
        provisionalCredits: json.provisionalCredits ?? 0,
      };
    },

    async commit(args: CommitCall) {
      const { json } = await postJson<{ ok?: boolean; state?: string; code?: string }>(
        `/steps/${encodeURIComponent(args.stepKey)}/commit`,
        {
          ordinal: args.ordinal,
          of: args.of,
          producedVersionIds: args.producedVersionIds,
          credits: args.credits,
          result: args.result,
          next: args.next,
        },
      );
      return { ok: json.ok === true, ...(json.state ? { state: json.state } : {}), ...(json.code ? { code: json.code } : {}) };
    },

    async failStep(args: FailCall): Promise<void> {
      await postJson(`/steps/${encodeURIComponent(args.stepKey)}/fail`, {
        ordinal: args.ordinal,
        errorClass: args.errorClass,
        ...(args.reason ? { reason: args.reason } : {}),
      });
    },

    async deliver(args: { delivery: DeliveryArgs }) {
      const { json } = await postJson<{ ok?: boolean; state?: string }>("/deliver", { delivery: args.delivery });
      return { ok: json.ok === true, ...(json.state ? { state: json.state } : {}) };
    },

    async finalize() {
      const { json } = await postJson<{ ok?: boolean; state?: string }>("/finalize", {});
      return { ok: json.ok === true, ...(json.state ? { state: json.state } : {}) };
    },
  };
}
