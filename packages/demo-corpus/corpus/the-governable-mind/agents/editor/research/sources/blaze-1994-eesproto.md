# blaze-1994-eesproto
- **URL:** https://www.mattblaze.org/papers/eesproto.pdf · **Accessed:** 2026-09-16 · **For:** v1 review, Phase 1
- **What it establishes:** Supports C49/C79: 42 minutes = 38 ms × 2^16 trials on a Mykotronx prototype PCMCIA EES card; what is forged is a random LEAF whose 16-bit checksum validates, so the wiretapper gets random bits instead of the session key. Caveat: too slow for real-time voice; parallelizable.
- **Key passages:** 'a rogue PCMCIA application can search for a valid-looking LEAF in 38 ∗ 2^16 ms, or 2,490,368 ms, which is about 42 minutes.' / '42 minutes obviously adds too much latency … to be useful in real-time applications such as secure telephone calls.'
- **Reliability:** Primary (author preprint, Aug 20, 1994; ACM CCS Nov 1994).
- **Relevance to this project:** C49, C79
