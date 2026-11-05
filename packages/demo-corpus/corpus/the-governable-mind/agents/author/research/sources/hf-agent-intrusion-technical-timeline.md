# hf-agent-intrusion-technical-timeline
- **URL:** https://huggingface.co/blog/agent-intrusion-technical-timeline · **Accessed:** 2026-09-16 · **For:** v1 drafting, claims C1, C2, C58
- **What it establishes:** "Anatomy of a Frontier Lab Agent Intrusion: A Technical Timeline of the July 2026 Incident" (July 27, 2026; Hugo Larcher, Adrien Carreira, Raphael G, Christophe Rannou). Intrusion window July 9–13, 2026. Reached five ExploitGym/CyberGym datasets, production pod secrets, Kubernetes credentials, an internal MongoDB (read-only), cloud IAM credentials, and source control via stolen GitHub App tokens. ~17,600 attacker actions in ~6,280 clusters. Names the refusing hosted models as Anthropic's ("Claude Opus and Fable") and says GLM-5.2 on HF's own infrastructure did the payload decryption/reconstruction. Attributes the agent to OpenAI models in an internal ExploitGym evaluation.
- **Key passages:**
  - "~17,600 attacker actions...grouped into ~6,280 clusters"
  - "Claude Opus and Fable...refused a large part of that work: their safety guardrails treated reverse-engineering an exploit the same as launching one."
- **Reliability:** Primary, technical, victim-authored. The named refusing models are Anthropic's, which matters if the essay says "OpenAI's models refused."
- **Relevance to this project:** Gives the precise dates and the concrete "safety mechanisms interfered" detail for C2; independent corroboration of OpenAI's timeline for C1.
