import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { execPandoc } from "./pandoc.js";
import { exportMarkdown, ExportError, EXPORT_FORMATS } from "./export.js";

// Export job entrypoint (§12.1: one Cloud Run Job per export; §13.4). The container carries pandoc +
// typst (pdf engine) and nothing else — no database, no secrets. Two modes:
//   job   — `node dist/main.js <input.md> <format> <output>`: convert the file, print a result JSON
//           (the per-export job the api's ExportRunner launches; the GCS binding is the deploy leg).
//   serve — `node dist/main.js serve`: a minimal `POST /export` endpoint returning the bytes, for
//           the synchronous download path (the export Cloud Run service).
// The POST body is `{markdown, format, profile?, cslStyle?, bibliography?, figures?}` — figure
// payloads and the CSL-JSON bibliography are api-resolved, so no GETs and no state: every
// invocation is one conversion.

export async function runExportFile(inputPath: string, format: string, outputPath: string): Promise<void> {
  const markdown = await readFile(inputPath, "utf8");
  const result = await exportMarkdown({ pandoc: execPandoc }, { markdown, format });
  await writeFile(outputPath, result.bytes);
  console.log(JSON.stringify({ format, bytes: result.bytes.byteLength, mediaType: result.mediaType, output: outputPath }));
}

// Figure payloads can carry embedded PNG@2x bytes + spec/data/provenance text — 64 MB keeps a
// figure-dense manuscript well inside the cap while staying far beyond any sane draft.
const MAX_BODY = 64 * 1024 * 1024;

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).byteLength;
    if (size > MAX_BODY) throw new ExportError("conversion_failed", "export body exceeds the 64 MB cap");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

interface ExportPostBody {
  markdown?: unknown;
  format?: unknown;
  profile?: unknown;
  cslStyle?: unknown;
  bibliography?: unknown;
  figures?: unknown;
}

export function createExportServer(port = Number(process.env.PORT ?? 8080)) {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.method === "GET" && req.url === "/healthz") {
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, service: "export" }));
        return;
      }
      if (req.method !== "POST" || req.url !== "/export") {
        res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "not_found" }));
        return;
      }
      const body = JSON.parse((await readBody(req)).toString("utf8")) as ExportPostBody;
      if (typeof body.markdown !== "string" || typeof body.format !== "string") {
        res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "markdown and format required" }));
        return;
      }
      const result = await exportMarkdown(
        { pandoc: execPandoc },
        {
          markdown: body.markdown,
          format: body.format,
          profile: typeof body.profile === "string" ? body.profile : null,
          cslStyle: typeof body.cslStyle === "string" ? body.cslStyle : null,
          bibliography: typeof body.bibliography === "string" ? body.bibliography : null,
          figures: Array.isArray(body.figures) ? (body.figures as Parameters<typeof exportMarkdown>[1]["figures"]) : null,
        },
      );
      res.writeHead(200, { "content-type": result.mediaType }).end(result.bytes);
    } catch (e) {
      const status = e instanceof ExportError ? (e.reason === "unsupported_format" || e.reason === "unsupported_profile" ? 422 : 400) : 500;
      res.writeHead(status, { "content-type": "application/json" }).end(
        JSON.stringify({ error: e instanceof ExportError ? e.reason : "conversion_failed", message: String((e as Error)?.message ?? e) }),
      );
    }
  }).listen(port, () => console.log(`[export] serving on :${port}`));
}

if (process.argv[1] && process.argv[1].endsWith("main.js")) {
  const [modeOrInput, format, output] = process.argv.slice(2);
  if (modeOrInput === "serve") {
    createExportServer();
  } else if (modeOrInput && format && output) {
    runExportFile(modeOrInput, format, output).catch((e) => {
      console.error(`export failed: ${String((e as Error)?.message ?? e)}`);
      process.exit(1);
    });
  } else {
    console.error(`usage: export <input.md> <format> <output>   (formats: ${EXPORT_FORMATS.join(", ")})\n       export serve`);
    process.exit(2);
  }
}
