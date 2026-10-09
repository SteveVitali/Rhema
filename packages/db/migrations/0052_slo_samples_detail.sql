-- 0052_slo_samples_detail.sql — ONB.1 (§13.5; REQ-ARCH-34; invariant #10).
--
-- `import_preview_p95_s` is a TEXT-FORMAT SLO (md/txt/html/docx — REQ-GROWTH-1 amended), but the
-- api's import route samples every ready preview into `slo_samples` under one signal name
-- (`import_preview_ms`). Without a format column, a multi-minute PDF preview through the same
-- route would pollute the text-format p95 and false-trip the >40 s alert.
--
-- `detail` is a free-form classifier slot the writer fills with the conversion `sourceFormat`
-- ('md'|'txt'|'html'|'docx'|'pdf'|…) — a duration + a format KIND, never draft text or filenames
-- (invariant #10). Nullable + purely additive: the 0042 writers (event_delivery_ms,
-- autosave_save_ms) leave it NULL, and the probes for those signals never read it.

alter table slo_samples
  add column detail text;
