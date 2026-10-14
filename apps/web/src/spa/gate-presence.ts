import { useEffect, useRef, type RefObject } from "react";

/**
 * SPA.11 — the React twin of GateCard's inline presence script (REQ-SPEC-18). The SSR card emits a
 * `<script>` that pings `activity: present|blur|reading` to `/p/:slug/gates/:id/activity` so an
 * auto-proceed deadline pauses while the tab is focused and the reader has opened the artifact. An
 * innerHTML script never executes inside a React mount, so a surface rendering `gateCardFor` with
 * `presenceScript: false` mounts this effect on the card's row element instead — identical pings,
 * identical gating: only `model.autoProceed` cards get a live `activityUrl`; a wait-default card
 * passes `null`, mounts nothing, and can never arm the timer.
 *
 * Best-effort by design: a dropped ping just lets the countdown run (the same failure shape as a
 * no-JS read). Returns the ref to put on the element wrapping the card.
 */
export function useGatePresence<T extends HTMLElement = HTMLElement>(
  activityUrl: string | null,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!activityUrl) return;
    const send = (kind: "present" | "blur" | "reading"): void => {
      const body = new FormData();
      body.set("activity", kind);
      try {
        if (navigator.sendBeacon?.(activityUrl, body)) return;
        void fetch(activityUrl, { method: "POST", body, credentials: "same-origin" }).catch(
          () => undefined,
        );
      } catch {
        // presence pings are best-effort — a dropped ping just lets the countdown run.
      }
    };
    const vis = (): void => send(document.hidden ? "blur" : "present");
    const focus = (): void => send("present");
    const blur = (): void => send("blur");
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("focus", focus);
    window.addEventListener("blur", blur);
    const artifact = ref.current?.querySelector("[data-gate-artifact]");
    const reading = (): void => send("reading");
    artifact?.addEventListener("click", reading);
    vis();
    return () => {
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", blur);
      artifact?.removeEventListener("click", reading);
    };
  }, [activityUrl]);
  return ref;
}
