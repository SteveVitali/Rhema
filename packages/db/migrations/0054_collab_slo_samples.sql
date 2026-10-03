-- 0054_collab_slo_samples.sql — SLO.1 (§13.5; REQ-ARCH-34; invariant #10).
-- The collab service's `onStoreDocument` → `storeDocument` materialization is the Page's real autosave
-- path; SLO.1 samples its server-side save duration into `slo_samples` (`detail='collab'`) the same way
-- the api's HTTP save route does (`detail='http'`, grant landed in 0045). `rhema_collab` never held the
-- grant — the signal silently dropped every collab-path sample.
--
-- Additive grant only; no schema change, no data write.

grant insert on slo_samples to rhema_collab;
