# shavit-chinchilla-2023-scope-passages
- **URL:** https://ar5iv.labs.arxiv.org/html/2303.11341 · **Accessed:** 2026-09-16 · **For:** v2 review, Phase 2 policy
- **What it establishes:** Shavit 2023, full text via ar5iv (supplements the abstract-only note shavit-catch-a-chinchilla-2023). Scope expressly excludes consumer GPUs and personal devices; training-focused; a footnote contemplates snapshotting in-memory weights at inference; inspectors check weight-snapshot hashes against reported training transcripts.
- **Key passages:** 'we distinguish from consumer-oriented GPUs with lower interconnect bandwidth (e.g., the NVIDIA RTX 4090, used in gaming computers)' (§1) · 'the system does not affect individuals' use of their personal computing devices' (§1.2) · 'focus is restricted to specialized data-center accelerators' (§3) · 'One particularly straightforward to address case is ML inference: the model's in-memory weights could be snapshotted' (§4 fn).
- **Reliability:** Primary; technical proposal.
- **Relevance to this project:** Q4: l.286 holds for Shavit; the weights-at-execution idea exists but for datacenter inspection.
