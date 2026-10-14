// src/spa/routes/__root.tsx — the SPA root route (SPA.1 toolchain smoke scaffold). SPA.4 replaces
// this with the real root: the beforeLoad session gate, the shell chrome, error/pending boundaries.
import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({ component: Outlet });
