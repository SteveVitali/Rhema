import type { ReactNode } from "react";
import { Button } from "./primitives/button.js";
import type { DecisionItemView } from "@rhema/findings-core";

// The Decisions list (§5.7 "Decisions inbox"; beta Inbox stand-in; REQ-OBJ-7/8). One open row = one
// decision blocked on you — escalate dispositions, deferred-obligation horizon arrivals, and stall
// escalations all land here. No-JS: each row's options are plain form buttons POSTing the answer.

export interface DecisionsListLabels {
  readonly heading: string;
  readonly emptyLabel: string;
  /** display for an option ("Decide" / "Dismiss" / a custom label). */
  readonly optionLabel: (option: string) => string;
}

export interface DecisionsListProps {
  readonly items: readonly DecisionItemView[];
  /** the form action for a row's answer (`/p/:slug/decisions/:id`). */
  readonly formActionFor: (id: string) => string;
  readonly labels: DecisionsListLabels;
  /** R7RO.1 — read-only projects withhold the answers: the option buttons render disabled
   *  with this reason tooltip (never a POST). */
  readonly disabledTitle?: string;
}

/** The minimal Decisions surface — open rows, oldest first, each answerable inline. */
export function DecisionsList({
  items,
  formActionFor,
  labels,
  disabledTitle,
}: DecisionsListProps): ReactNode {
  return (
    <section data-decisions-list="true">
      <h2 className="ui-t-f16 ui-d-b ui-t-fg ui-c2-mb">{labels.heading}</h2>
      {items.length === 0 ? (
        <p data-decisions-empty="true" className="ui-d-fd ui-t-mut ui-c2-m0">
          {labels.emptyLabel}
        </p>
      ) : (
        <ol className="ui-c2-m0 ui-d-p0" style={{ listStyle: "none" }}>
          {items.map((item) => (
            <li
              key={item.id}
              data-decision={item.id}
              className="ui-t-r2 ui-t-p1012 ui-t-mb8 ui-rs-box"
              style={{ border: "1px solid var(--shell-border)" }}
            >
              <div className="ui-d-fd ui-t-fg">{item.text}</div>
              <form
                method="post"
                action={formActionFor(item.id)}
                data-decision-form="true"
                className="ui-c2-mt ui-c2-g2"
                style={{ display: "flex", flexWrap: "wrap" }}
              >
                {item.options.map((option) => (
                  <Button
                    key={option}
                    type={disabledTitle != null ? "button" : "submit"}
                    name="answer"
                    value={option}
                    data-decision-option={option}
                    {...(disabledTitle != null ? { disabled: true, title: disabledTitle } : {})}
                    className="ui-t-p612 ui-t-r7 ui-d-eb ui-t-fg ui-d-fs"
                    style={{
                      border: "1px solid var(--shell-border)",
                      cursor: "pointer",
                    }}
                  >
                    {labels.optionLabel(option)}
                  </Button>
                ))}
              </form>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
