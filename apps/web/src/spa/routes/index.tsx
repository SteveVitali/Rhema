// src/spa/routes/index.tsx — placeholder index route so the router-plugin codegen has a non-empty
// tree to emit (SPA.1 smoke scaffold). SPA.4 writes the real route set — all ~45 auth'd document
// GETs exist in the tree from day one (REQ-FW-1).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => null,
});
