// @vitest-environment happy-dom
//
// R7KIT.1 (REQ-KIT-1; UXC-14) — the Stage-A proxy for the control base layer: raw native controls
// mounted under the REAL generated stylesheet must resolve theme tokens in dark AND light. Covers
// every REQ-KIT-1 control class the six Stage-B surfaces use (/app filters, settings, billing, the
// run sheet, Export, /app/new — the census in R6 §4 lists button/input/select/textarea plus
// checkbox, radio and file inputs). The Stage-B screenshot leg is D-R7KIT.1-1 (phase preview 224).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { themeCss, ideCss, DARK_VARS, LIGHT_VARS } from "@rhema/tokens";

const CONTROL_IDS = ["btn", "inp", "sel", "ta", "cb", "rd", "fl"] as const;

function mountControls() {
  const style = document.createElement("style");
  style.textContent = themeCss();
  document.head.appendChild(style);
  const host = document.createElement("div");
  host.innerHTML =
    `<button id="btn" type="button">Go</button>` +
    `<input id="inp" type="text" name="q">` +
    `<select id="sel" name="s"><option>a</option></select>` +
    `<textarea id="ta" name="t"></textarea>` +
    `<input id="cb" type="checkbox" name="c">` +
    `<input id="rd" type="radio" name="r">` +
    `<input id="fl" type="file" name="f">`;
  document.body.appendChild(host);
  return { style, host };
}

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-paper");
});

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("the native-control base layer (REQ-KIT-1)", () => {
  it("dark theme: every control class resolves the token background, border, fg and 13-px shell size", () => {
    mountControls();
    expect(getComputedStyle(document.documentElement).getPropertyValue("color-scheme")).toBe(
      "dark",
    );
    for (const id of ["btn", "inp", "sel", "ta", "fl"] as const) {
      const cs = getComputedStyle(document.getElementById(id)!);
      expect(cs.backgroundColor, `${id} background`).toBe(DARK_VARS["--shell-raised"]);
      expect(cs.borderColor, `${id} border`).toBe(DARK_VARS["--shell-border"]);
      expect(cs.color, `${id} color`).toBe(DARK_VARS["--shell-fg"]);
      expect(cs.fontSize, `${id} font-size`).toBe("13px");
    }
    // checkbox/radio keep the UA widget, themed by accent-color + the 14-px box — never the
    // light-UA default the missing color-scheme produced.
    for (const id of ["cb", "rd"] as const) {
      const cs = getComputedStyle(document.getElementById(id)!);
      expect(cs.accentColor, `${id} accent`).toBe(DARK_VARS["--accent"]);
      expect(cs.width, `${id} width`).toBe("14px");
    }
  });

  it("light theme: the same controls re-resolve onto the light token set", () => {
    mountControls();
    document.documentElement.setAttribute("data-theme", "light");
    expect(getComputedStyle(document.documentElement).getPropertyValue("color-scheme")).toBe(
      "light",
    );
    for (const id of ["btn", "inp", "sel", "ta", "fl"] as const) {
      const cs = getComputedStyle(document.getElementById(id)!);
      expect(cs.backgroundColor, `${id} background`).toBe(LIGHT_VARS["--shell-raised"]);
      expect(cs.borderColor, `${id} border`).toBe(LIGHT_VARS["--shell-border"]);
      expect(cs.color, `${id} color`).toBe(LIGHT_VARS["--shell-fg"]);
    }
    expect(getComputedStyle(document.getElementById("cb")!).accentColor).toBe(
      LIGHT_VARS["--accent"],
    );
  });

  it("controls inside .paper read the SHEET's palette through the --shell-* remap (pinned pairings)", () => {
    mountControls();
    const paper = document.createElement("div");
    paper.className = "paper";
    paper.innerHTML = `<button id="pb" type="button">On paper</button>`;
    document.body.appendChild(paper);
    const cs = getComputedStyle(document.getElementById("pb")!);
    // dark default: the sheet's raised lift + rule border + paper fg — never the shell's values.
    expect(cs.backgroundColor).toBe("#221f24"); // paperScopeVars("dark")["--shell-raised"]
    expect(cs.borderColor).toBe(DARK_VARS["--paper-rule"]);
    expect(cs.color).toBe(DARK_VARS["--paper-fg"]);
    expect(getComputedStyle(paper).getPropertyValue("color-scheme")).toBe("dark");
    // pinned-light paper inside the dark shell: light palette + light color-scheme.
    // (happy-dom binds selector matches at insertion — mount a fresh sheet AFTER stamping the pin,
    // exactly what a served `[data-paper]` document does.)
    document.documentElement.setAttribute("data-paper", "light");
    const pinned = document.createElement("div");
    pinned.className = "paper";
    pinned.innerHTML = `<button id="pb2" type="button">Pinned</button>`;
    document.body.appendChild(pinned);
    const cs2 = getComputedStyle(document.getElementById("pb2")!);
    expect(cs2.color).toBe(LIGHT_VARS["--paper-fg"]);
    expect(cs2.borderColor).toBe(LIGHT_VARS["--paper-rule"]);
    expect(getComputedStyle(pinned).getPropertyValue("color-scheme")).toBe("light");
  });

  it("the IDE-region rules still win (specificity contract) — panel-tabs + statusbar buttons keep their look", () => {
    mountControls();
    const ide = document.createElement("style");
    ide.textContent = ideCss();
    document.head.appendChild(ide);
    const shell = document.createElement("div");
    shell.className = "ide";
    shell.innerHTML =
      `<aside class="ide-panel"><div class="ide-panel-tabs"><button id="rb" type="button">R</button></div></aside>` +
      `<footer class="ide-statusbar"><button id="sb" type="button">S</button></footer>`;
    document.body.appendChild(shell);
    // .ide-panel .ide-panel-tabs button / .ide-statusbar button carry `background: none;
    // border: none` — the base layer's raised-bg + border must NOT reach them.
    for (const id of ["rb", "sb"] as const) {
      const cs = getComputedStyle(document.getElementById(id)!);
      expect(cs.backgroundColor, `${id} background`).toBe("none");
      expect(cs.borderColor, `${id} border`).toBe("none");
    }
    // the palette input keeps its IDE bg/fg — the base layer's raised/border never overrides it.
    const pal = document.createElement("div");
    pal.className = "ide-palette";
    pal.innerHTML = `<input id="pi" data-palette-input>`;
    document.body.appendChild(pal);
    const pcs = getComputedStyle(document.getElementById("pi")!);
    expect(pcs.backgroundColor).toBe(DARK_VARS["--shell-bg"]);
    expect(pcs.borderColor).toBe(DARK_VARS["--shell-border"]);
    expect(pcs.fontSize).toBe("15px");
  });

  it("an existing inline-styled control renders unchanged — inline always beats the base layer", () => {
    mountControls();
    const b = document.createElement("button");
    b.id = "inl";
    b.setAttribute(
      "style",
      "background: rgb(200, 0, 0); border: 2px solid rgb(0, 0, 200); font-size: 12.5px; padding: 10px 14px;",
    );
    document.body.appendChild(b);
    const cs = getComputedStyle(b);
    expect(cs.backgroundColor).toBe("rgb(200, 0, 0)");
    expect(cs.borderColor).toBe("rgb(0, 0, 200)");
    expect(cs.fontSize).toBe("12.5px");
    expect(cs.paddingTop).toBe("10px");
  });

  it("every REQ-KIT-1 control class mounts and carries SOME base-layer rule (coverage census)", () => {
    mountControls();
    // guard against a control class silently dropping out of the emitted stylesheet: every class
    // resolves at least one base-layer property (token bg/border, or accent-color for check/radio).
    for (const id of CONTROL_IDS) {
      const el = document.getElementById(id)!;
      const cs = getComputedStyle(el);
      const styled = cs.backgroundColor !== "" || cs.accentColor !== "";
      expect(styled, `${id} carries a base-layer rule`).toBe(true);
    }
  });
});
