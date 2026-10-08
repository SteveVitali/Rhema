// apps/web/vite.config.ts — SPA bundle for the auth'd shell (design/21 §Design, REQ-TL-1..3/6/9).
// The esbuild island pipeline (build-client.mjs → public/<entry>.js, REQ-TL-12) is UNTOUCHED; this
// file owns ONLY src/spa → public/spa, and all output is inert until SPA.3's shell document and
// SPA.4's skeleton exist — nothing serves it.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
  appType: "custom", // no index.html — the shell is a Hono-served template (design/21 F5)
  publicDir: false, // apps/web/public is a GENERATED dir (islands + fonts) — never copy it (F2)
  plugins: [
    tanstackRouter({
      // MUST precede react() — plugin order is load-bearing (design/21 F4, REQ-TL-9).
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "src/spa/routes",
      generatedRouteTree: "src/spa/routeTree.gen.ts", // committed; typecheck stays a pure tsc -p
    }),
    react(),
  ],
  build: {
    target: "es2022", // matches the islands' esbuild target (build-client.mjs)
    outDir: "public/spa", // inside the existing served-asset root → Dockerfile COPY is free
    assetsDir: "assets", // URLs become /assets/spa/assets/<name>-<hash>.js (F5)
    manifest: true, // → public/spa/.vite/manifest.json (REQ-TL-4's consumer lands at SPA.3)
    sourcemap: "hidden", // maps exist for the REQ-SAFE-2 provenance scan; never linked or served
    modulePreload: { polyfill: false }, // the inline polyfill script would need a nonce slot (REQ-TL-7)
    rollupOptions: { input: "src/spa/main.tsx" },
  },
});
