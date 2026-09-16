import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { execPandoc } from "./pandoc.js";
import { exportMarkdown, ExportError, EXPORT_FORMATS } from "./export.js";

// Export job entrypoint (§12.1: one Cloud Run Job per export; §13.4). The container carries pandoc and
// nothing else — no database, no secrets. Two modes:
//   job   — `node dist/main.js <input.md> <format> <output>`: convert the file, print a result JSON
//           (the per-export job the api's ExportRunner launches; the GCS binding is the deploy leg).
//   serve — `node dist/main.js serve`: a minimal `POST /export {markdown, format}` endpoint returning
//           the bytes, for the synchronous download path (the export Cloud Run service).
// No GETs, no state: every invocation is one conversion.

export async function runExportFile(inputPath: string, format: string, outputPath: string): Promise<void> {
  const markdown = await readFile(inputPath, "utf8");
  const result = await exportMarkdown({ pandoc: execPandoc }, { markdown, format });
  await writeFile(outputPath, result.bytes);
  console.log(JSON.stringify({ format, bytes: result.bytes.byteLength, mediaType: result.mediaType, output: outputPath }));
}

const MAX_BODY = 32 * 1024 * 1024; // a manuscript export is text; 32 MB is far beyond any sane draft.

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).byteLength;
    if (size > MAX_BODY) throw new ExportError("conversion_failed", "export body exceeds the 32 MB cap");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
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
      const body = JSON.parse((await readBody(req)).toString("utf8")) as { markdown?: unknown; format?: unknown };
      if (typeof body.markdown !== "string" || typeof body.format !== "string") {
        res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "markdown and format required" }));
        return;
      }
      const result = await exportMarkdown({ pandoc: execPandoc }, { markdown: body.markdown, format: body.format });
      res.writeHead(200, { "content-type": result.mediaType }).end(result.bytes);
    } catch (e) {
      const status = e instanceof ExportError ? (e.reason === "unsupported_format" ? 422 : 400) : 500;
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
