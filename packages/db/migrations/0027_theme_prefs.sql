-- 0027_theme_prefs.sql — P1.01 (design system + IDE shell; REQ-IDE-38 amended R17).
--
-- The app theme is a per-USER preference: dark | light | auto, dark default (§5.9 theme policy).
-- The paper theme was already anticipated by 0002 (`projects.paper_theme` —
-- 'light'|'follow'|'dark', pinned-light default) and stays the per-project pin the IDE shell
-- reads/stamps. Additive, nullable-safe, no backfill needed (the CHECK + default carry it).

alter table "user"
  add column if not exists app_theme text not null default 'dark'
    check (app_theme in ('dark','light','auto'));
