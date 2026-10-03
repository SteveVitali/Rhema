// The LIVE WalkthroughGenerator binding (P1.05; §5.5 D20; REQ-IDE-19 amended): one package-class model
// call over the narrow delivered-artifact whitelist `generateWalkthrough` assembled. The prompt it builds
// is server-side only — nothing here reaches an event payload or the client. Cost is metered by the
// caller's record (model name + input digest on `runs.walkthrough`), not a run usage row — the run is
// already terminal.

import type { WalkthroughGenerator, WalkthroughInput, WalkthroughResult } from "@rhema/orchestrator";

/** Base-tier ("package-class") model — the cheapest member of the pinned family (rates.ts). */
const WALKTHROUGH_MODEL = "claude-haiku-4-5";
const MAX_OUTPUT_TOKENS = 400;

/** Build the one bounded prompt from the whitelist — identity + shape + run facts, never bodies. */
export function buildWalkthroughPrompt(input: WalkthroughInput): string {
  const artifacts = input.artifacts
    .map((a) => `- ${a.kind} at ${a.path}${a.wordCount != null ? ` (~${a.wordCount} words)` : ""}`)
    .join("\n");
  const phases = input.phases.map((p) => `${p.phase} (${p.credits} credits)`).join(", ");
  const claims = input.claimsVerified != null ? `${input.claimsVerified} claims verified` : "claims not counted";
  return [
    `A document ${input.workflow} run finished (${input.state}). It produced:`,
    artifacts || "- (no delivered artifacts listed)",
    `Phases: ${phases}. ${claims}. Total cost ${input.spentCredits} credits.`,
    "",
    "Write a walkthrough of at most 200 words for the document's author: what was delivered,",
    "what each artifact is, and the ONE thing to read first. Plain prose, no headings, no lists.",
    "Do not speculate beyond the facts given.",
  ].join("\n");
}

export interface AnthropicWalkthroughArgs {
  /** the provider API key (Secret Manager `anthropic-api-key` — the same version the proxy holds). */
  readonly apiKey: string;
  readonly baseUrl?: string;
}

/** The deploy-bound generator: POST /v1/messages with the bounded prompt; one call per `generate`. */
export class AnthropicWalkthroughGenerator implements WalkthroughGenerator {
  constructor(private readonly args: AnthropicWalkthroughArgs) {}

  async generate(input: WalkthroughInput): Promise<WalkthroughResult> {
    const base = this.args.baseUrl ?? "https://api.anthropic.com";
    const res = await fetch(`${base}/v1/messages`, {
      method: "post",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.args.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: WALKTHROUGH_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [{ role: "user", content: buildWalkthroughPrompt(input) }],
      }),
    });
    if (!res.ok) throw new Error(`walkthrough model call failed: ${res.status}`);
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (body.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
    if (text === "") throw new Error("walkthrough model call returned no text");
    return { text, model: WALKTHROUGH_MODEL };
  }
}

/**
 * RUN.1 — the env→binding seam lifted out of `main.ts` so it is unit-testable: an UNSET or
 * placeholder `WALKTHROUGH_MODEL_KEY_SECRET` binds the failing stub (every job lands `failed` on
 * `runs.walkthrough`; the card's Retry covers it once the secret lands); a live secret name resolves
 * its value and binds the real generator. `access` is the Secret-Manager fetch (injectable). The
 * deployed-regression proof lives in `infra/pulumi/compute.test.ts`: the worker's env MUST carry the
 * secret name whenever `anthropic-api-key` is provisioned — this function can then never stub.
 */
export async function loadWalkthroughGenerator(
  secretName: string | undefined,
  access: (name: string) => Promise<string>,
): Promise<WalkthroughGenerator> {
  const secret = secretName ? await access(secretName) : undefined;
  const key = secret && !/placeholder/i.test(secret) ? secret : undefined;
  if (!key) {
    console.log(
      secretName
        ? "[worker] walkthrough model key is a placeholder — run.walkthrough binds the failing stub"
        : "[worker] WALKTHROUGH_MODEL_KEY_SECRET unset — run.walkthrough binds the failing stub",
    );
    return { generate: () => Promise.reject(new Error("walkthrough unconfigured")) };
  }
  return new AnthropicWalkthroughGenerator({ apiKey: key });
}
