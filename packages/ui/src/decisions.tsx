import type { ReactNode } from "react";
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
}

/** The minimal Decisions surface — open rows, oldest first, each answerable inline. */
export function DecisionsList({ items, formActionFor, labels }: DecisionsListProps): ReactNode {
  return (
    <section data-decisions-list="true">
      <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--shell-fg)", margin: "0 0 8px" }}>
        {labels.heading}
      </h2>
      {items.length === 0 ? (
        <p data-decisions-empty="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: 0 }}>
          {labels.emptyLabel}
        </p>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {items.map((item) => (
            <li
              key={item.id}
              data-decision={item.id}
              style={{
                border: "1px solid var(--shell-border)",
                borderRadius: "8px",
                padding: "10px 12px",
                marginBottom: "8px",
                background: "var(--shell-raised)",
              }}
            >
              <div style={{ fontSize: "13px", color: "var(--shell-fg)" }}>{item.text}</div>
              <form
                method="post"
                action={formActionFor(item.id)}
                data-decision-form="true"
                style={{ marginTop: "8px", display: "flex", gap: "8px", flexWrap: "wrap" }}
              >
                {item.options.map((option) => (
                  <button
                    key={option}
                    type="submit"
                    name="answer"
                    value={option}
                    data-decision-option={option}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "7px",
                      border: "1px solid var(--shell-border)",
                      background: "var(--shell-bg)",
                      color: "var(--shell-fg)",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    {labels.optionLabel(option)}
                  </button>
                ))}
              </form>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
