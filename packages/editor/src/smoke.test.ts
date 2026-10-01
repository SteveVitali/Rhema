import { it, expect } from "vitest";
import { normalizeMarkdown } from "@rhema/markdown";
import { markdownToDoc } from "./md-to-pm.js";
import { docToMarkdown } from "./pm-to-md.js";

const RAW = `---
rhema: 1
title: Test
---

## Heading

A claim \\[@smith2020] and multi \\[@a; @b] cite. Math $x^2$ inline. Foot[^1].

$$
E=mc^2
$$

| A | B |
| :- | -: |
| 1 | 2 |

- one
- two

1. first
2. second

- [ ] task
- [x] done

> a quote
>
> second para

\`\`\`ts
const x = 1;
\`\`\`

Some _emphasis_ and **strong** and ~~strike~~ and \`code\` and a [link](https://x.test "t").

![a figure](asset://abc "caption")

---

line one \\
hard break

<div class="x">html block</div>

Inline <em>html</em> here.

[^1]: the note

[^2]: second note

[a]: https://ref.test "Ref"
`;

const CANONICAL = normalizeMarkdown(RAW);

it("md→PM→md is byte-stable on canonical text", () => {
  const doc = markdownToDoc(CANONICAL);
  const out = docToMarkdown(doc);
  if (out !== CANONICAL) {
    console.log("=== CANONICAL ===\n" + CANONICAL + "\n=== OUT ===\n" + out);
  }
  expect(out).toBe(CANONICAL);
});

it("PM→md→PM is structurally equal", () => {
  const doc = markdownToDoc(CANONICAL);
  const md = docToMarkdown(doc);
  const doc2 = markdownToDoc(md);
  expect(doc2.eq(doc)).toBe(true);
  expect(docToMarkdown(doc2)).toBe(md);
});
