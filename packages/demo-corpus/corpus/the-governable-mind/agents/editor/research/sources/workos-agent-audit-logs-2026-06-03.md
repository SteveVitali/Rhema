# workos-agent-audit-logs-2026-06-03
- **URL:** https://workos.com/blog/agent-audit-logs · **Accessed:** 2026-09-16 · **For:** v2 review, Phase 2 policy
- **What it establishes:** WorkOS engineering post, June 3, 2026: agent audit logs must distinguish user actions from agent actions on the user's behalf; log user ID, agent ID, authorization scope, tool invocations with arguments, delegation chain, approval status; does not discuss excluding prompts.
- **Key passages:** 'If an agent reads a document, queries a database, and sends an email, the user didn't do those things in any direct sense.' · 'A record of who authorized whom to do what. At minimum: user ID, agent ID, and whether the action was human-approved or autonomous.'
- **Reliability:** Secondary; vendor engineering guidance.
- **Relevance to this project:** Q3/Q7: engineering predecessor of the action-log distinction; retains the principal's identity.
