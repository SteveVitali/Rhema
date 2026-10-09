import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { convertedResultKey, parseQuarantineKey } from "@rhema/contracts";
import { convertBytes, DecompressionLimitError } from "./convert.js";

// ONB.1 (ADR-044) — the warm convert SERVICE: the same code the Cloud Run Job runs, served over a
// bounded HTTP surface so the interactive §5.3 preview never pays a Job cold start (measured live
// ~2.5–4 min; REQ-GROWTH-1's 20 s row). The §12.1 isolation is UNCHANGED: the service carries no
// GCS client and no network credential — quarantine in / converted out ride the SAME mounted
// user-content bucket the Job uses (a gcsfuse volume at CONVERT_ROOT, gated by the `convert` SA's
// converted/-only write). It makes NO outbound calls: the only socket it owns is the listener.
//
// Surface (invoker-gated at the platform layer — api SA only):
//   GET  /healthz   → 200 {"ok":true}            (startup/liveness probe)
//   POST /convert   → {quarantineKey} → 200 ConversionResult | 202? never — the handler is
//                      synchronous: it reads, converts, writes, answers. Client-side timeouts are
//                      the caller's budget; the write-through to converted/ makes a retry a
//                      read-back cache hit.
//
// Errors: 400 invalid key · 404 missing quarantine object · 413 decompression-limit ·
// 422 conversion failure · 500 everything else. An error NEVER writes a converted/ object.

export interface ConvertServiceDeps {
  /** The mounted user-content bucket root (`/usercontent` in deploy; a tmp dir in tests). */
  readonly root: string;
  /** The port to listen on (PORT env in deploy; 0 = ephemeral in tests). */
  readonly port: number;
}

const JSON_TYPE = { "content-type": "application/json" };
const MAX_BODY = 64 * 1024; // the request body is a key, never the bytes — bound it tight.

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, JSON_TYPE).end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const chunk of req) {
    const b = chunk as Buffer;
    n += b.byteLength;
    if (n > MAX_BODY) throw new Error("request too large");
    chunks.push(b);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Resolve `<root>/<key>` and refuse anything that escapes the mount (defense-in-depth; the
 *  quarantineKey parse already binds the shape to `quarantine/<ws>/<id>`). */
function resolveInside(root: string, key: string): string | null {
  const p = normalize(join(root, key));
  return p.startsWith(normalize(root) + "/") || p === normalize(root) ? p : null;
}

export function createConvertService(deps: ConvertServiceDeps): Server {
  const root = normalize(deps.root);
  return createServer(async (req, res) => {
    try {
      if (req.method === "GET" && (req.url === "/healthz" || req.url === "/")) {
        return reply(res, 200, { ok: true });
      }
      if (req.method !== "POST" || req.url !== "/convert") {
        return reply(res, 404, { error: "not_found" });
      }
      const body = (await readBody(req).catch(() => "")) as string;
      if (!body) return reply(res, 400, { error: "request too large" });
      const key = (JSON.parse(body) as { quarantineKey?: unknown })?.quarantineKey;
      if (typeof key !== "string" || !parseQuarantineKey(key)) {
        return reply(res, 400, { error: "quarantineKey required" });
      }
      const inPath = resolveInside(root, key);
      const outKey = convertedResultKey(key);
      const outPath = resolveInside(root, outKey);
      if (!inPath || !outPath) return reply(res, 400, { error: "invalid quarantineKey" });

      const bytes = await readFile(inPath).catch(() => null);
      if (!bytes) return reply(res, 404, { error: "quarantine object not found" });

      let result;
      try {
        result = await convertBytes(new Uint8Array(bytes));
      } catch (e) {
        if (e instanceof DecompressionLimitError) {
          return reply(res, 413, { error: "decompression_limit", message: e.message.slice(0, 200) });
        }
        return reply(res, 422, { error: "conversion_failed", message: String((e as Error)?.message ?? e).slice(0, 200) });
      }

      // The converted object is the replay transport (same contract as the Job): write it through
      // the mount BEFORE answering, so a retried preview reads it back without a second conversion.
      await mkdir(dirname(outPath), { recursive: true }).catch(() => undefined);
      await writeFile(outPath, JSON.stringify(result), "utf8");
      return reply(res, 200, { preview: result, convertedKey: outKey });
    } catch (e) {
      return reply(res, 500, { error: "internal", message: String((e as Error)?.message ?? e).slice(0, 200) });
    }
  });
}

/** Bind the service and resolve the actual port (0 ⇒ the ephemeral port Cloud Run/tests pick). */
export async function serveConvert(deps: ConvertServiceDeps): Promise<{ server: Server; port: number }> {
  const server = createConvertService(deps);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(deps.port, resolve);
  });
  const addr = server.address();
  return { server, port: typeof addr === "object" && addr ? addr.port : deps.port };
}
