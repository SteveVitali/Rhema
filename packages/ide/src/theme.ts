// Theme policy (REQ-IDE-38 amended — P1.01 R17). The app theme is dark | light | auto, resolved against
// the OS; it must be consistent from landing through the app with NO wrong-theme flash, so the resolved
// value is applied by a synchronous inline script BEFORE first paint (see `themeBootScript`), not by the
// hydrated island. The paper pins per project: `light` (default — a warm sheet inset in the dark shell),
// `follow` (tracks the app theme), `dark`. `data-paper` holds the POLICY; the CSS `[data-paper]`
// overrides do the rest — `follow`/absent inherits the theme's paper set.
//
// The app theme is per-USER (server: `user.app_theme`, mirrored to localStorage as the offline boot
// source). The paper theme is per-USER × PROJECT (server: `projects.paper_theme`; localStorage mirror
// keyed by project slug). Neither is ever a URL param.

export const APP_THEMES = ["dark", "light", "auto"] as const;
export type AppTheme = (typeof APP_THEMES)[number];

export const PAPER_THEMES = ["light", "follow", "dark"] as const;
export type PaperTheme = (typeof PAPER_THEMES)[number];

export const THEME_STORAGE_KEY = "rhema:theme:v1";
export const paperStorageKey = (projectSlug: string): string => `rhema:paper:v1:${projectSlug}`;

export function parseAppTheme(v: unknown): AppTheme {
  return typeof v === "string" && (APP_THEMES as readonly string[]).includes(v) ? (v as AppTheme) : "dark";
}
export function parsePaperTheme(v: unknown): PaperTheme {
  return typeof v === "string" && (PAPER_THEMES as readonly string[]).includes(v)
    ? (v as PaperTheme)
    : "light";
}

/** Resolve the pref to the applied theme: auto follows the OS, everything else is literal. */
export function resolveAppTheme(pref: AppTheme, systemPrefersLight: boolean): "dark" | "light" {
  return pref === "auto" ? (systemPrefersLight ? "light" : "dark") : pref;
}

/** The ⌘⇧L cycle (paper): light → follow → dark → light. */
export function cyclePaperTheme(t: PaperTheme): PaperTheme {
  return t === "light" ? "follow" : t === "follow" ? "dark" : "light";
}

/** The app-theme cycle for the Settings control: dark → light → auto → dark. */
export function cycleAppTheme(t: AppTheme): AppTheme {
  return t === "dark" ? "light" : t === "light" ? "auto" : "dark";
}

/**
 * The inline pre-paint script renderDocument() emits in <head> — before any stylesheet could paint a
 * wrong theme. Source of truth order: the SSR-stamped `data-app-theme`/`data-paper` (the server read the
 * DB), else the localStorage mirrors (offline / same-session boot), else the defaults (dark app,
 * pinned-light paper). `auto` resolves against matchMedia AND subscribes to OS changes.
 * Written as an ES5 IIFE string because it must run before modules load.
 */
export function themeBootScript(): string {
  return (
    "!function(){try{var d=document.documentElement;" +
    // --- app theme: SSR-stamped pref wins; fall back to the localStorage mirror; default dark. ---
    "var pref=d.getAttribute('data-app-theme');" +
    "if(!pref){try{pref=localStorage.getItem('" +
    THEME_STORAGE_KEY +
    "')}catch(e){}}" +
    "if(pref!=='dark'&&pref!=='light'&&pref!=='auto')pref='dark';" +
    "d.setAttribute('data-app-theme',pref);" +
    "var apply=function(){" +
    "var res=pref;" +
    "if(pref==='auto'){res=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}" +
    "d.setAttribute('data-theme',res)};" +
    "apply();" +
    "if(pref==='auto'&&window.matchMedia){" +
    "var q=window.matchMedia('(prefers-color-scheme: light)');" +
    "var on=function(e){if(d.getAttribute('data-app-theme')==='auto'){d.setAttribute('data-theme',e.matches?'light':'dark')}};" +
    "q.addEventListener?q.addEventListener('change',on):q.addListener&&q.addListener(on)};" +
    "try{localStorage.setItem('" +
    THEME_STORAGE_KEY +
    "',pref)}catch(e){}" +
    // --- paper theme: per-PROJECT, so it only resolves where a project context exists. SSR stamps the
    //     stored policy; else the localStorage mirror; absent both, leave unset (the CSS default wins). ---
    "var slug=d.getAttribute('data-project');" +
    "if(slug){" +
    "if(!d.getAttribute('data-paper')){" +
    "try{var p=localStorage.getItem('rhema:paper:v1:'+slug);if(p==='light'||p==='follow'||p==='dark')d.setAttribute('data-paper',p)}catch(e){}" +
    "if(!d.getAttribute('data-paper'))d.setAttribute('data-paper','light')}" +
    "try{localStorage.setItem('rhema:paper:v1:'+slug,d.getAttribute('data-paper'))}catch(e){}" +
    "}" +
    // --- font preset + reader step (localStorage — account settings land in a later ticket). ---
    "try{var f=localStorage.getItem('rhema:font:v1');if(f==='sans')d.setAttribute('data-font','sans');" +
    "var s=localStorage.getItem('rhema:reader-step:v1');if(s&&s!=='0'){var n=parseInt(s,10);" +
    "if(n>0&&n<=3)d.style.setProperty('--paper-size',(f==='sans'?16:17)+2*n+'px')}}catch(e){}" +
    "}catch(e){}}();"
  );
}
