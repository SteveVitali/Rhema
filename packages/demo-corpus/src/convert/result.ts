// Shared result/diagnostic vocabulary for the pure converters (REQ-CONV-1/2). A conversion is
// `{ok:true, value, diagnostics}` or `{ok:false, diagnostics}` — a `failed` conversion aborts with
// no partial output (REQ-CONV-2's gate is fail-closed, never a silent partial).

export interface Diagnostic {
  readonly severity: "error" | "warning";
  /** Machine-stable code (e.g. `heading_unparsed`, `summary_mismatch`) for tests and tooling. */
  readonly code: string;
  readonly message: string;
}

export type Conversion<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: Diagnostic[] };

export const warn = (code: string, message: string): Diagnostic => ({
  severity: "warning",
  code,
  message,
});
export const fail = (code: string, message: string): Diagnostic => ({
  severity: "error",
  code,
  message,
});
export const ok = <T>(value: T, diagnostics: Diagnostic[]): Conversion<T> => ({
  ok: true,
  value,
  diagnostics,
});
export const bad = (diagnostics: Diagnostic[]): Conversion<never> => ({ ok: false, diagnostics });
