-- 0017_estimate_cache_prepass.sql — the estimate service's cached claim pre-pass (PRB.03; REQ-SPEC-16;
-- §5.6 item 1). The stateless estimate returns an IMMEDIATE provisional figure from the word count, then a
-- Haiku-class claim pre-pass refines the claim count and the figure ≤5 s; the pre-pass result is cached per
-- (draft sha, workflow, rigor, tier) so a re-open of the same sheet is instant and the COGS (~5 credits,
-- absorbed) is paid once per draft version. The 0002 `estimate_cache` stored only the figures; add the
-- pre-pass's claim count and the provisional flag so a cached row distinguishes a provisional figure from a
-- refined one.
--
-- Forward-only, additive (never a rename — REQ-IDE-50). `cache_key` already encodes the tuple; these columns
-- annotate the cached figure. No credential/secret lives here (a cache row is derived data).

alter table estimate_cache add column claim_count integer;                      -- the pre-pass's claim count once refined; null while provisional / for claim-free workflows
alter table estimate_cache add column provisional boolean not null default true;  -- true until the pre-pass has refined the figure
