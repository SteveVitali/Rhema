// Lazy PNG@2x rasterization (§7.5; REQ-VIZ-15's asset half; resolves §16.3 #8). `@resvg/resvg-js`
// is a napi-rs native binding — deterministic across environments, no node-canvas, no system deps.
// It is an OPTIONAL dependency: the module is imported lazily so a host without the binding (or a
// deploy where the MPL-2.0 exception is declined at review) keeps every SVG path working — PNG
// stays unrendered, which is the §7.5 floor, and callers get `null` rather than a crash.

/** The §7.5 scale factor: `render@2x.png` is the 2× raster of the LIGHT svg. */
export const PNG_SCALE = 2 as const;

interface ResvgCtor {
  new (svg: string, options?: { fitTo?: { mode: "zoom"; value: number } }): {
    render(): { asPng(): Uint8Array };
  };
}

/**
 * Rasterize an SVG string to PNG bytes at 2×. Returns `null` when the resvg binding is unavailable
 * (the caller leaves `render@2x.png` unwritten — PNG is lazy by spec, so absence is a state, not
 * an error). Throws only on a malformed SVG (a real render fault the caller should surface).
 */
export async function renderPng2x(svg: string): Promise<Uint8Array | null> {
  let Resvg: ResvgCtor;
  try {
    const mod = (await import("@resvg/resvg-js")) as { Resvg: ResvgCtor };
    Resvg = mod.Resvg;
  } catch {
    return null; // optional dep absent — PNG stays lazy-unrendered
  }
  const resvg = new Resvg(svg, { fitTo: { mode: "zoom", value: PNG_SCALE } });
  return resvg.render().asPng();
}
