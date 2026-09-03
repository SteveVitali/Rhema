// @rhema/live-clients — the deploy-time bindings for the orchestrator's DI seams (D-P0.08-1 / D-P0.08b-1).
// Thin wrappers over heavy client libraries (pg, ioredis, pg-boss, @kubernetes/client-node,
// @google-cloud/secret-manager), constructed once at deploy in apps/api + apps/worker. The pure logic each one
// carries (RLS tx scoping, heartbeat/pub-sub encoding, the k8s manifest, the RS256 key load) is unit-tested
// here; the wire behavior is proven live (Stage B).

export * from "./tx.js";
export * from "./heartbeat.js";
export * from "./event-bus.js";
export * from "./queue.js";
export * from "./k8s-launcher.js";
export * from "./secret-manager.js";
