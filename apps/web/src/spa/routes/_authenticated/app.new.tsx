// `/app/new` — R7HOME.2b (REQ-HOME-3, ADR-128's REQ-IDE-5 item): "New project" is an immediate
// create, never a dialog. The leaf issues the ONE `POST /app/new {entry:'scratch'}` in
// `beforeLoad` (the `p.index` handoff precedent — the side effect is a POST, decided server-side)
// and throws the in-router redirect onto the new Page at `/p/:slug?created=scratch`. The document
// GET of this path is a server-owned redirect to `/app` — a bookmark/refresh can never mint a
// project (GETs don't create). `?entry=outline|draft` keeps validating for the preview leg's own
// links; the create always lands scratch — uploads start from the new Page's affordance row.

import { createFileRoute, redirect } from "@tanstack/react-router";
import { BffError, bffFetch } from "../../bff.js";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { flagParam, oneParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff } from "../../states.js";

interface CreateReply {
  readonly ok?: boolean;
  readonly redirect?: string;
  readonly error?: string;
}

export const Route = createFileRoute("/_authenticated/app/new")({
  validateSearch: validateSearchParams({
    entry: oneParam("scratch", "outline", "draft"),
    held: flagParam,
  }),
  pendingComponent: PendingShell,
  beforeLoad: async ({ context, search }) => {
    // The document GET is a server-owned 302 to /app — an unflipped verdict hands the route back
    // to the document (SsrHandoff below) and NEVER mints a project.
    if (!isSpaEnabled(context.boot, "/app/new")) return;
    let env: CreateReply;
    try {
      env = await bffFetch<CreateReply>("/app/new", {
        method: "POST",
        json: { entry: "scratch" },
      });
    } catch (e) {
      // A refused create (401's session-clear + /login handoff rides BffError's own arm) lands
      // the writer back on the list — never a half-created project.
      if (e instanceof BffError) throw redirect({ href: "/app" });
      throw e;
    }
    // The envelope's `?created=scratch` ride stays a typed in-router nav — never a document hop.
    const slug = typeof env.redirect === "string" ? /^\/p\/([^/?]+)/.exec(env.redirect)?.[1] : null;
    if (slug != null) {
      // ONB.1 — a landing-held file's intent survives: the blank project is created, then the
      // writer lands on its import surface, which hydrates the hold into the file input.
      if (search.held === "1") {
        throw redirect({ to: "/p/$project/import", params: { project: slug }, search: { held: "1" } });
      }
      throw redirect({ to: "/p/$project", params: { project: slug }, search: { created: "scratch" } });
    }
    throw redirect({ href: env.redirect ?? "/app" });
  },
  component: function NewProjectLeaf() {
    if (!isSpaEnabled(getSpaBoot(), "/app/new")) return <SsrHandoff />;
    // Unreachable under the spa verdict — beforeLoad always redirects (create or fallback).
    return null;
  },
});
