// 275_R6WEB.1 (RH-30) — the author-side CSP nonce channel for server-rendered `<script>` tags.
//
// The old contract was a response-body regex (`/<script(?=[\s>])/gi` → `nonce="…"`) stamped over the
// WHOLE served document: any markup that reached the body by a path the server did not author — a
// missed escape, a `dangerouslySetInnerHTML` slip, a future join — silently inherited a WORKING
// nonce and ran under `script-src`. The nonce is now attached only where the server itself authors
// the tag: the document builders stamp their own script strings and provide `CspNonceContext`;
// components emitting a `<script>` use `NonceScript` so the same attribute rides every render path
// (SSR documents through `renderDocument`, the demo/SSR variants, and — with no provider — the SPA
// client mount, where an inline script stays inert under the header nonce anyway).
//
// `CspNonceContext` lives HERE (not apps/web) because the emitters are @rhema/ui components —
// apps/web's `renderDocument` is the provider; a render outside it gets `null` and emits the tag
// un-nonced, which is the fail-closed answer (the tag cannot execute rather than executing).

import { createContext, useContext, type ReactNode, type ScriptHTMLAttributes } from "react";

/** The per-request CSP nonce the document builder provides (null outside a nonced render). */
export const CspNonceContext = createContext<string | null>(null);

/**
 * The ONE sanctioned server-authorship marker for `<script>` tags: identical to a plain `<script>`
 * but stamps `nonce` from `CspNonceContext` when a provider supplied one. All other props pass
 * through verbatim (`src`, `type`, `defer`, `dangerouslySetInnerHTML`, data attributes).
 */
export function NonceScript(props: ScriptHTMLAttributes<HTMLScriptElement>): ReactNode {
  const nonce = useContext(CspNonceContext);
  return <script {...(nonce ? { nonce } : {})} {...props} />;
}
