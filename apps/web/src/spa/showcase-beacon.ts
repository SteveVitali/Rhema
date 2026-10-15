// SPA.21 — the React twin of the SSR dossier's inline showcase-anchor beacon script
// (`DossierArticle` emits the verbatim `<script>` under SSR; innerHTML scripts never execute under
// a React mount, so the leaf calls this hook instead — the gate-presence.ts precedent).
import { useEffect } from "react";

/**
 * P1.17 (§3.5) — `showcase.finding_anchor_viewed`: only the client observes the scroll onto the
 * first finding's card — an IntersectionObserver posts the beacon once (the <60 s funnel leg).
 * Verbatim port of the inline script in `DossierArticle`'s `beacon="script"` branch.
 */
export function useShowcaseAnchorBeacon(findingId: string | undefined): void {
  useEffect(() => {
    if (findingId == null) return;
    const el = document.querySelector(`[data-finding="${findingId}"]`);
    if (!(el instanceof Element)) return;
    let sent = false;
    const fire = () => {
      if (sent) return;
      sent = true;
      const b = JSON.stringify({ event: "showcase.finding_anchor_viewed", props: {} });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/a/acq", new Blob([b], { type: "application/json" }));
          return;
        }
      } catch {
        /* fall through to the keepalive fetch */
      }
      void fetch("/a/acq", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: b,
        keepalive: true,
      }).catch(() => undefined);
    };
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (e.isIntersecting) {
            fire();
            io.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    const t = setTimeout(() => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) fire();
    }, 1200);
    return () => {
      io.disconnect();
      clearTimeout(t);
    };
  }, [findingId]);
}
