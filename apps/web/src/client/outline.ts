// The outline editor island (P1.12; §7.3). Progressive enhancement only — the SSR form's Save button
// stays the no-JS path. With JS, edits to any `ed.*` field debounce into a fetch POST to the form's
// own action (Accept: application/json → the web route decodes the same `ed.*` grammar the gate card
// posts and forwards the api's PATCH `edit`; each save lands one new version pair). The status text
// comes from the form's SSR'd data-label-* attributes (the copy table stays server-side, REQ-ARCH-33);
// the bundle carries no credentials — same-origin cookies carry the session.

const DEBOUNCE_MS = 800;

const form = document.querySelector<HTMLFormElement>("form[data-outline-editor][data-autosave]");

if (form) {
  const f: HTMLFormElement = form; // a stable non-null binding for the async closures below
  const status = document.createElement("span");
  status.setAttribute("data-autosave-status", "true");
  status.style.cssText = "margin-left:12px;font-size:12px;color:var(--shell-fg-muted)";
  form.querySelector("button[type='submit']")?.insertAdjacentElement("afterend", status);

  const labels = {
    saving: form.dataset["labelSaving"] ?? "Saving…",
    saved: form.dataset["labelSaved"] ?? "Saved",
    failed: form.dataset["labelFailed"] ?? "Save failed",
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight = false;
  let again = false;

  async function save(): Promise<void> {
    if (inflight) {
      again = true; // edits landed mid-flight — coalesce into one follow-up save
      return;
    }
    inflight = true;
    status.textContent = labels.saving;
    try {
      const res = await fetch(f.action, {
        method: "POST",
        body: new FormData(f),
        headers: { accept: "application/json" },
      });
      status.textContent = res.ok ? labels.saved : labels.failed;
    } catch {
      status.textContent = labels.failed; // offline — the next input retries
    } finally {
      inflight = false;
      if (again) {
        again = false;
        schedule(0);
      }
    }
  }

  function schedule(ms: number = DEBOUNCE_MS): void {
    clearTimeout(timer);
    timer = setTimeout(() => void save(), ms);
  }

  form.addEventListener("input", (e) => {
    const el = e.target;
    if (
      el instanceof HTMLInputElement &&
      typeof el.name === "string" &&
      el.name.startsWith("ed.")
    ) {
      schedule();
    }
  });
}
