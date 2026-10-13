// UX.1 — the brand mark the document head + favicon endpoints serve. An inline SVG: the macron'd "R"
// (the Rhēma glyph) on the shell's dark surface. No raster asset pipeline needed at this size; the
// .ico endpoint serves the same bytes (browsers render SVG favicons by content type, not extension).

export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#14171c"/><rect x="19" y="13" width="26" height="5" rx="2.5" fill="#d9d4c8"/><text x="32" y="51" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="38" font-weight="600" fill="#d9d4c8">R</text></svg>`;
