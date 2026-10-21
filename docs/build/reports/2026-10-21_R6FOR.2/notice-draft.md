# DRAFT — account notice · RLS exposure window 2026-09-17 → 2026-10-01

> **STATUS: DRAFT FOR HUMAN-H11 APPROVAL — NOT SENT.**
> The send is a named mutation (GD-EXPOSURE.R6). Do not send without the operator's explicit
> approval. This file is the approval artifact; recipients are "the holders of the real
> workspaces active in the window" (all currently operator/staff-controlled accounts — see the
> materiality note in `exposure-forensics.md`).

---

Subject: A security notice about your Rhema workspace data

Hello,

We are writing to tell you plainly about a data-exposure incident that affected workspaces on
Rhema.

**What happened.** Between 17 September 2026 and 1 October 2026, a database misconfiguration
meant that row-level security — the mechanism that keeps each workspace's data separate — was
switched off for the account our application used to serve requests, and several of our
endpoints did not carry their own workspace check as a backstop. During that period, requests
to those endpoints could return data belonging to a different workspace.

**What was exposed.** Our review of the full request logs for that period found that
workspace data was in fact served across workspace boundaries on 252 occasions. The data
involved was:

- voice/persona profiles (list and detail views),
- project details and project chat context, and
- review dossier/correspondence content.

We also found 4 requests that may have written to another workspace's records; the evidence
for those is weaker and they are most likely our own administrative activity, but we are
disclosing them for completeness.

**When.** The first confirmed cross-tenant response was on 22 September 2026; the last was on
1 October 2026, before the fix below took full effect at approximately 02:09 UTC that day.

**What we have done.** We fixed the affected endpoints to always check the workspace
explicitly (deployed in stages: the dossier route on 25 September, the remaining routes on
1 October), and on 1 October we moved every user-facing service to a database role that
cannot bypass row-level security, so the same class of bug cannot silently recur. We also
added a standing cross-tenant check to our test suite and an automated census that fails the
build if a new table is added without an isolation decision.

**What you should know.** Every account involved in the confirmed events is an internal or
staff-operated account — we have no evidence that any outside user received anyone else's
data. We are telling you anyway because your workspace was part of the affected set and you
deserve to know.

**Questions.** If you have any questions or want more detail about what was and was not
exposed, reply to this message or write to security@rhema.tools. We will answer directly.

— The Rhema team

---

*Approval block — HUMAN-H11: approved by ______ date ______ (send = named mutation, operator
runs it; recipients = the workspace holders identified in the forensics report).*
