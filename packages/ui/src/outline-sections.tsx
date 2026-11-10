import type { ReactNode } from "react";
import type { GateOutlineView } from "@rhema/findings-core";
import { TextField } from "./primitives/fields.js";

// P1.12 — the spine-and-sections structured editor (§7.3). ONE component powers two surfaces:
//   · the Approve-outline gate card (inside the decision form — its `ed.*` fields post with Approve),
//   · the unlocked outline editor (inside the autosave form — the same `ed.*` grammar the web's save
//     route decodes via `decodeGateEditFields` → the api's PATCH `edit`).
// `editable: false` renders the phone/read-only surface (§10.1): badges + text, no inputs.
// Provenance + `[unverified]` are DATA badges on every claim row — never editable fields and never
// styled-away (REQ-DATA-23). Text is lint-checked copy via `labels`.
//
// 242_R7KIT.3c2 (REQ-KIT-3 batch c2): fields ride the 225a `TextField` primitive (a real
// `<input>` — the no-JS gate-card post and the autosave `input` event are untouched); the strike
// checkbox stays a KIT-1-styled native `<input type="checkbox">` inside `EdCheckbox` (the named
// GUARD-1 exemption — the gate card renders to static HTML where a Radix toggle is inert, RV-36).

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

/**
 * The no-JS strike checkbox — the ONLY raw control left in this file, and the named GUARD-1
 * exemption owns it (this component renders inside the Approve-outline gate card's no-JS decision
 * form, where `ed.claim.*.strike` must toggle with zero client JS — RV-36's KIT-1-styled native).
 */
function EdCheckbox({ name }: { readonly name: string }): ReactNode {
  return <input type="checkbox" name={name} value="1" />;
}

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
    <label key={name} className="ui-os-lf" style={{ display: "flex", flexDirection: "column" }}>
      {label}
      {editable ? (
        <TextField
          type={name === "targetLength" ? "number" : "text"}
          name={`ed.values.${name}`}
          defaultValue={value ?? ""}
        />
      ) : (
        <span data-lever={name} className="ui-os-d">
          {value ?? "—"}
        </span>
      )}
    </label>
  );

  return (
    <div
      data-outline-sections="true"
      className="ui-c2-g3"
      style={{ display: "flex", flexDirection: "column" }}
    >
      {/* ---- the levers (thesis / venue / target length / protocol / voice) ---- */}
      <div
        className="ui-c2-g2"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}
      >
        {leverField("thesis", labels.thesisLabel, outline.thesis)}
        {leverField("venue", labels.venueLabel, outline.venue)}
        {leverField("targetLength", labels.targetLengthLabel, outline.targetLength)}
        {leverField("protocol", labels.protocolLabel, outline.protocol)}
        {leverField("voice", labels.voiceLabel, outline.voice)}
      </div>

      {/* ---- the spine: claim ids in reading order (display — edits recompute it) ---- */}
      {outline.spine.length > 0 ? (
        <div data-outline-spine="true">
          <span className="ui-c2-ts">{labels.spineHeading}</span>
          <ol className="ui-os-ol" style={{ display: "flex", flexDirection: "column" }}>
            {outline.spine.map((id) => (
              <li key={id} data-spine-id={id}>
                {claimText.get(id) ?? id}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {/* ---- the sections + their claim rows ---- */}
      <fieldset
        data-outline-seclist="true"
        className="ui-os-fs ui-c2-g2"
        style={{ display: "flex", flexDirection: "column" }}
      >
        <legend className="ui-c2-ts">{labels.sectionsHeading}</legend>
        {outline.sections.map((sec, si) => (
          <section
            key={si}
            data-outline-section={sec.ref}
            className="ui-os-card"
            style={{ border: "1px solid var(--shell-border)" }}
          >
            <div
              className="ui-c2-g2"
              style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap" }}
            >
              <strong className="ui-os-d">
                {sec.ref} · {sec.title}
              </strong>
              {editable ? (
                <span
                  className="ui-c2-g2"
                  style={{ display: "inline-flex", alignItems: "baseline", flexWrap: "wrap" }}
                >
                  <label className="ui-c2-ts">
                    {labels.orderLabel}
                    <TextField
                      type="number"
                      name={`ed.sec.${si}.ord`}
                      min={1}
                      defaultValue={si + 1}
                      aria-label={labels.orderLabel}
                      className="ui-os-n4 ui-os-ml1"
                      style={{ display: "inline-block" }}
                    />
                  </label>
                  <label className="ui-c2-ts">
                    {labels.targetWordsLabel}
                    <TextField
                      type="number"
                      name={`ed.sec.${si}.targetWords`}
                      min={0}
                      defaultValue={sec.targetWords ?? ""}
                      aria-label={labels.targetWordsLabel}
                      className="ui-os-n7 ui-os-ml1"
                      style={{ display: "inline-block" }}
                    />
                  </label>
                </span>
              ) : (
                <span className="ui-os-i">
                  {sec.targetWords != null ? `${labels.targetWordsLabel} ${sec.targetWords}` : ""}
                </span>
              )}
            </div>
            {editable ? (
              <div
                className="ui-os-g2"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                }}
              >
                <label className="ui-c2-ts">
                  {labels.functionLabel}
                  <TextField
                    type="text"
                    name={`ed.sec.${si}.purpose`}
                    defaultValue={sec.function ?? ""}
                    aria-label={labels.functionLabel}
                  />
                </label>
                <label className="ui-c2-ts">
                  {labels.entryLabel}
                  <TextField
                    type="text"
                    name={`ed.sec.${si}.entry`}
                    defaultValue={sec.entry ?? ""}
                    aria-label={labels.entryLabel}
                  />
                </label>
                <label className="ui-c2-ts">
                  {labels.exitLabel}
                  <TextField
                    type="text"
                    name={`ed.sec.${si}.exit`}
                    defaultValue={sec.exit ?? ""}
                    aria-label={labels.exitLabel}
                  />
                </label>
              </div>
            ) : (
              <div className="ui-os-mr ui-c2-g2" style={{ display: "flex", flexWrap: "wrap" }}>
                {sec.function ? (
                  <span className="ui-os-i">
                    {labels.functionLabel} {sec.function}
                  </span>
                ) : null}
                {sec.entry ? (
                  <span className="ui-os-i">
                    {labels.entryLabel} {sec.entry}
                  </span>
                ) : null}
                {sec.exit ? (
                  <span className="ui-os-i">
                    {labels.exitLabel} {sec.exit}
                  </span>
                ) : null}
              </div>
            )}
            <ul
              data-outline-claims="true"
              className="ui-c2-vl"
              style={{ listStyle: "none", display: "flex", flexDirection: "column" }}
            >
              {sec.claims.map((cl, ci) => (
                <li key={cl.id} data-outline-claim={cl.id} className="ui-os-t">
                  <span>{cl.text}</span>{" "}
                  <span data-provenance={cl.provenanceKind} className="ui-badge ui-os-b">
                    {labels.provenanceBadge(cl.provenanceKind)}
                    {cl.provenance?.url
                      ? ` · ${cl.provenance.url}`
                      : cl.provenance?.notePath
                        ? ` · ${cl.provenance.notePath}`
                        : ""}
                  </span>{" "}
                  {cl.unverified ? (
                    <span data-unverified="true" className="ui-badge ui-os-bw">
                      {labels.unverifiedBadge}
                    </span>
                  ) : null}
                  {editable ? (
                    <span
                      className="ui-os-ml ui-c2-g2"
                      style={{ display: "inline-flex", alignItems: "baseline", flexWrap: "wrap" }}
                    >
                      <label className="ui-c2-ts">
                        {labels.orderLabel}
                        <TextField
                          type="number"
                          name={`ed.claim.${si}.${ci}.ord`}
                          min={1}
                          defaultValue={ci + 1}
                          aria-label={labels.orderLabel}
                          className="ui-os-n1 ui-os-ml1"
                          style={{ display: "inline-block" }}
                        />
                      </label>
                      <label className="ui-c2-ts">
                        {labels.moveLabel}
                        <TextField
                          type="number"
                          name={`ed.claim.${si}.${ci}.to`}
                          min={1}
                          max={outline.sections.length}
                          placeholder={`${si + 1}`}
                          aria-label={labels.moveLabel}
                          className="ui-os-n1 ui-os-ml1"
                          style={{ display: "inline-block" }}
                        />
                      </label>
                      <label className="ui-c2-ts">
                        <EdCheckbox name={`ed.claim.${si}.${ci}.strike`} /> {labels.strikeLabel}
                      </label>
                      <TextField
                        type="text"
                        name={`ed.claim.${si}.${ci}.note`}
                        placeholder={labels.notePlaceholder}
                      />
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
        <div
          data-add-claim="true"
          className="ui-c2-g2"
          style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap" }}
        >
          <span className="ui-c2-ts">{labels.addClaimLabel}</span>
          <TextField
            type="text"
            name="ed.spine.new.text"
            placeholder={labels.addClaimPlaceholder}
            style={{ flex: "1 1 220px" }}
          />
          <TextField
            type="text"
            name="ed.spine.new.note"
            placeholder={labels.addNotePlaceholder}
            style={{ flex: "1 1 160px" }}
          />
          <label className="ui-c2-ts">
            {labels.addClaimSectionLabel}
            <TextField
              type="number"
              name="ed.spine.new.section"
              min={1}
              max={outline.sections.length}
              placeholder={`${outline.sections.length}`}
              className="ui-os-n4 ui-os-ml1"
              style={{ display: "inline-block" }}
            />
          </label>
        </div>
      ) : null}

      {/* ---- alternatives considered (read-only — a record, not an edit surface) ---- */}
      {outline.alternativesConsidered && outline.alternativesConsidered.length > 0 ? (
        <div data-alternatives="true">
          <span className="ui-c2-ts">{labels.alternativesHeading}</span>
          <ul className="ui-os-ul">
            {outline.alternativesConsidered.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ---- the gaps only the author can fill — each Answer posts `ed.gap.<id>` ---- */}
      {outline.gaps.length > 0 ? (
        <div data-outline-gaps="true">
          <span className="ui-c2-ts">{labels.gapsHeading}</span>
          <ul
            className="ui-os-gl"
            style={{ listStyle: "none", display: "flex", flexDirection: "column" }}
          >
            {outline.gaps.map((g) => (
              <li key={g.id} data-outline-gap={g.id} className="ui-os-t">
                <span>{g.needed}</span>
                {g.sectionRef ? <span className="ui-os-fnt">({g.sectionRef})</span> : null}
                {editable ? (
                  <span
                    className="ui-os-ml ui-c2-g2"
                    style={{ display: "inline-flex", alignItems: "baseline" }}
                  >
                    <TextField
                      type="text"
                      name={`ed.gap.${g.id}`}
                      placeholder={labels.answerPlaceholder}
                      aria-label={labels.answerLabel}
                      className="ui-os-n26"
                      style={{ display: "inline-block" }}
                    />
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
          <span className="ui-c2-ts">{labels.sourcesHeading}</span>
          <ul className="ui-os-ul">
            {outline.urls.map((u) => (
              <li key={u.url}>
                {u.url}
                {u.unverified ? (
                  <span data-unverified="true" className="ui-badge ui-os-bw ui-os-ml">
                    {labels.unverifiedBadge}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
