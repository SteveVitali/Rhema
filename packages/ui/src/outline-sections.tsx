import type { CSSProperties, ReactNode } from "react";
import type { GateOutlineView } from "@rhema/findings-core";

// P1.12 — the spine-and-sections structured editor (§7.3). ONE component powers two surfaces:
//   · the Approve-outline gate card (inside the decision form — its `ed.*` fields post with Approve),
//   · the unlocked outline editor (inside the autosave form — the same `ed.*` grammar the web's save
//     route decodes via `decodeGateEditFields` → the api's PATCH `edit`).
// `editable: false` renders the phone/read-only surface (§10.1): badges + text, no inputs.
// Provenance + `[unverified]` are DATA badges on every claim row — never editable fields and never
// styled-away (REQ-DATA-23). Text is lint-checked copy via `labels`.

export interface OutlineSectionsLabels {
  /** the lever fields (post as `ed.values.*`). */
  readonly thesisLabel: string;
  readonly venueLabel: string;
  readonly targetLengthLabel: string;
  readonly protocolLabel: string;
  readonly voiceLabel: string;
  readonly spineHeading: string;
  readonly sectionsHeading: string;
  readonly alternativesHeading: string;
  readonly gapsHeading: string;
  readonly sourcesHeading: string;
  readonly orderLabel: string;
  readonly strikeLabel: string;
  readonly notePlaceholder: string;
  readonly addClaimLabel: string;
  readonly addClaimPlaceholder: string;
  readonly addNotePlaceholder: string;
  readonly addClaimSectionLabel: string;
  readonly targetWordsLabel: string;
  readonly functionLabel: string;
  readonly entryLabel: string;
  readonly exitLabel: string;
  /** "Move to section" — the `to` field's label. */
  readonly moveLabel: string;
  /** the `[unverified]` badge text (the badge itself is data — this is its caption). */
  readonly unverifiedBadge: string;
  /** provenance badge text per kind ("from thread", "from source", "you typed", "generated"). */
  readonly provenanceBadge: (kind: "thread" | "source" | "user_typed" | "generated") => string;
  /** a gap's Answer affordance ("Answer") + its input placeholder. */
  readonly answerLabel: string;
  readonly answerPlaceholder: string;
}

const fieldInput: CSSProperties = {
  padding: "5px 8px",
  borderRadius: "6px",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-bg)",
  color: "var(--shell-fg)",
  fontSize: "12px",
};

const fieldLabel: CSSProperties = {
  fontSize: "12px",
  color: "var(--shell-fg-muted)",
};

const badge: CSSProperties = {
  display: "inline-block",
  padding: "1px 6px",
  borderRadius: "999px",
  border: "1px solid var(--shell-border)",
  fontSize: "10px",
  color: "var(--shell-fg-muted)",
};

const unverifiedBadgeStyle: CSSProperties = {
  ...badge,
  borderColor: "var(--sev-major)",
  color: "var(--sev-major)",
};

/**
 * The shared spine-and-sections editor. `editable` flips every row between form fields (`ed.*`
 * grammar — `decodeGateEditFields` decodes it) and a read-only render (the phone surface / a locked
 * card). The spine is DISPLAY-only here — it names claim ids in reading order; moving/striking rows
 * recomputes it server-side.
 */
export function OutlineSections({
  outline,
  editable,
  labels,
}: {
  readonly outline: GateOutlineView;
  readonly editable: boolean;
  readonly labels: OutlineSectionsLabels;
}): ReactNode {
  // claim id → text, for the spine's display order (the spine names ids, never text).
  const claimText = new Map<string, string>();
  for (const s of outline.sections) for (const cl of s.claims) claimText.set(cl.id, cl.text);

  const leverField = (
    name: "thesis" | "venue" | "targetLength" | "protocol" | "voice",
    label: string,
    value: string | number | undefined,
  ): ReactNode => (
    <label key={name} style={{ ...fieldLabel, display: "flex", flexDirection: "column", gap: "3px" }}>
      {label}
      {editable ? (
        <input
          type={name === "targetLength" ? "number" : "text"}
          name={`ed.values.${name}`}
          defaultValue={value ?? ""}
          style={fieldInput}
        />
      ) : (
        <span data-lever={name} style={{ fontSize: "13px", color: "var(--shell-fg)" }}>
          {value ?? "—"}
        </span>
      )}
    </label>
  );

  return (
    <div data-outline-sections="true" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* ---- the levers (thesis / venue / target length / protocol / voice) ---- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" }}>
        {leverField("thesis", labels.thesisLabel, outline.thesis)}
        {leverField("venue", labels.venueLabel, outline.venue)}
        {leverField("targetLength", labels.targetLengthLabel, outline.targetLength)}
        {leverField("protocol", labels.protocolLabel, outline.protocol)}
        {leverField("voice", labels.voiceLabel, outline.voice)}
      </div>

      {/* ---- the spine: claim ids in reading order (display — edits recompute it) ---- */}
      {outline.spine.length > 0 ? (
        <div data-outline-spine="true">
          <span style={fieldLabel}>{labels.spineHeading}</span>
          <ol style={{ margin: "4px 0 0", paddingLeft: "20px", fontSize: "12px", color: "var(--shell-fg-muted)", display: "flex", flexDirection: "column", gap: "2px" }}>
            {outline.spine.map((id) => (
              <li key={id} data-spine-id={id}>
                {claimText.get(id) ?? id}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {/* ---- the sections + their claim rows ---- */}
      <fieldset data-outline-seclist="true" style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
        <legend style={fieldLabel}>{labels.sectionsHeading}</legend>
        {outline.sections.map((sec, si) => (
          <section key={si} data-outline-section={sec.ref} style={{ border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "8px" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap" }}>
              <strong style={{ fontSize: "13px", color: "var(--shell-fg)" }}>
                {sec.ref} · {sec.title}
              </strong>
              {editable ? (
                <span style={{ display: "inline-flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap" }}>
                  <label style={fieldLabel}>
                    {labels.orderLabel}
                    <input type="number" name={`ed.sec.${si}.ord`} min={1} defaultValue={si + 1} aria-label={labels.orderLabel} style={{ ...fieldInput, width: "44px", marginLeft: "4px" }} />
                  </label>
                  <label style={fieldLabel}>
                    {labels.targetWordsLabel}
                    <input type="number" name={`ed.sec.${si}.targetWords`} min={0} defaultValue={sec.targetWords ?? ""} aria-label={labels.targetWordsLabel} style={{ ...fieldInput, width: "72px", marginLeft: "4px" }} />
                  </label>
                </span>
              ) : (
                <span style={{ fontSize: "11px", color: "var(--shell-fg-faint)" }}>
                  {sec.targetWords != null ? `${labels.targetWordsLabel} ${sec.targetWords}` : ""}
                </span>
              )}
            </div>
            {editable ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "6px", marginTop: "6px" }}>
                <label style={fieldLabel}>
                  {labels.functionLabel}
                  <input type="text" name={`ed.sec.${si}.purpose`} defaultValue={sec.function ?? ""} aria-label={labels.functionLabel} style={{ ...fieldInput, width: "100%", boxSizing: "border-box" }} />
                </label>
                <label style={fieldLabel}>
                  {labels.entryLabel}
                  <input type="text" name={`ed.sec.${si}.entry`} defaultValue={sec.entry ?? ""} aria-label={labels.entryLabel} style={{ ...fieldInput, width: "100%", boxSizing: "border-box" }} />
                </label>
                <label style={fieldLabel}>
                  {labels.exitLabel}
                  <input type="text" name={`ed.sec.${si}.exit`} defaultValue={sec.exit ?? ""} aria-label={labels.exitLabel} style={{ ...fieldInput, width: "100%", boxSizing: "border-box" }} />
                </label>
              </div>
            ) : (
              <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--shell-fg-faint)", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {sec.function ? <span>{labels.functionLabel} {sec.function}</span> : null}
                {sec.entry ? <span>{labels.entryLabel} {sec.entry}</span> : null}
                {sec.exit ? <span>{labels.exitLabel} {sec.exit}</span> : null}
              </div>
            )}
            <ul data-outline-claims="true" style={{ margin: "8px 0 0", paddingLeft: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
              {sec.claims.map((cl, ci) => (
                <li key={cl.id} data-outline-claim={cl.id} style={{ fontSize: "12px" }}>
                  <span style={{ color: "var(--shell-fg)" }}>{cl.text}</span>{" "}
                  <span data-provenance={cl.provenanceKind} style={badge}>
                    {labels.provenanceBadge(cl.provenanceKind)}
                    {cl.provenance?.url ? ` · ${cl.provenance.url}` : cl.provenance?.notePath ? ` · ${cl.provenance.notePath}` : ""}
                  </span>{" "}
                  {cl.unverified ? (
                    <span data-unverified="true" style={unverifiedBadgeStyle}>{labels.unverifiedBadge}</span>
                  ) : null}
                  {editable ? (
                    <span style={{ marginLeft: "6px", display: "inline-flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap" }}>
                      <label style={fieldLabel}>
                        {labels.orderLabel}
                        <input type="number" name={`ed.claim.${si}.${ci}.ord`} min={1} defaultValue={ci + 1} aria-label={labels.orderLabel} style={{ ...fieldInput, width: "40px", marginLeft: "4px" }} />
                      </label>
                      <label style={fieldLabel}>
                        {labels.moveLabel}
                        <input type="number" name={`ed.claim.${si}.${ci}.to`} min={1} max={outline.sections.length} placeholder={`${si + 1}`} aria-label={labels.moveLabel} style={{ ...fieldInput, width: "40px", marginLeft: "4px" }} />
                      </label>
                      <label style={fieldLabel}>
                        <input type="checkbox" name={`ed.claim.${si}.${ci}.strike`} value="1" /> {labels.strikeLabel}
                      </label>
                      <input type="text" name={`ed.claim.${si}.${ci}.note`} placeholder={labels.notePlaceholder} style={fieldInput} />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </fieldset>

      {/* ---- add a claim (lands with user_typed provenance; `section` = its 1-based slot) ---- */}
      {editable ? (
        <div data-add-claim="true" style={{ display: "flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={fieldLabel}>{labels.addClaimLabel}</span>
          <input type="text" name="ed.spine.new.text" placeholder={labels.addClaimPlaceholder} style={{ ...fieldInput, flex: "1 1 220px" }} />
          <input type="text" name="ed.spine.new.note" placeholder={labels.addNotePlaceholder} style={{ ...fieldInput, flex: "1 1 160px" }} />
          <label style={fieldLabel}>
            {labels.addClaimSectionLabel}
            <input type="number" name="ed.spine.new.section" min={1} max={outline.sections.length} placeholder={`${outline.sections.length}`} style={{ ...fieldInput, width: "44px", marginLeft: "4px" }} />
          </label>
        </div>
      ) : null}

      {/* ---- alternatives considered (read-only — a record, not an edit surface) ---- */}
      {outline.alternativesConsidered && outline.alternativesConsidered.length > 0 ? (
        <div data-alternatives="true">
          <span style={fieldLabel}>{labels.alternativesHeading}</span>
          <ul style={{ margin: "4px 0 0", paddingLeft: "18px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {outline.alternativesConsidered.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ---- the gaps only the author can fill — each Answer posts `ed.gap.<id>` ---- */}
      {outline.gaps.length > 0 ? (
        <div data-outline-gaps="true">
          <span style={fieldLabel}>{labels.gapsHeading}</span>
          <ul style={{ margin: "6px 0 0", paddingLeft: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
            {outline.gaps.map((g) => (
              <li key={g.id} data-outline-gap={g.id} style={{ fontSize: "12px" }}>
                <span style={{ color: "var(--shell-fg)" }}>{g.needed}</span>
                {g.sectionRef ? (
                  <span style={{ marginLeft: "6px", color: "var(--shell-fg-faint)" }}>({g.sectionRef})</span>
                ) : null}
                {editable ? (
                  <span style={{ marginLeft: "8px", display: "inline-flex", gap: "6px", alignItems: "baseline" }}>
                    <input type="text" name={`ed.gap.${g.id}`} placeholder={labels.answerPlaceholder} aria-label={labels.answerLabel} style={{ ...fieldInput, width: "260px" }} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ---- the provenance url ledger (read-only; failed re-fetches carry the badge) ---- */}
      {outline.urls && outline.urls.length > 0 ? (
        <div data-outline-sources="true">
          <span style={fieldLabel}>{labels.sourcesHeading}</span>
          <ul style={{ margin: "4px 0 0", paddingLeft: "18px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {outline.urls.map((u) => (
              <li key={u.url}>
                {u.url}
                {u.unverified ? (
                  <span data-unverified="true" style={{ ...unverifiedBadgeStyle, marginLeft: "6px" }}>{labels.unverifiedBadge}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
