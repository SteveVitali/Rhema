// Ambient declaration for the vendored, proprietary Agent SDK (REQ-ARCH-4). The package is NOT a
// workspace/registry dependency — it is copied into the run-task image at build time — so this minimal
// declaration lets `sdk-adapter.ts` compile (and run-task's tests run) without it installed. The real
// vendored module resolves at runtime inside the image. Only the `query` export the adapter needs is
// declared; the SDK's own types are a superset.

declare module "@anthropic-ai/claude-agent-sdk" {
  export function query(args: { prompt: string; options: unknown }): AsyncIterable<unknown>;
}
