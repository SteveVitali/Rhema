// @rhema/export — the pandoc export container (PRB.11; §12.1, §13.4). One conversion per invocation:
// md / txt / docx from canonical markdown at beta (Typst/PDF + LaTeX → P1.18). Pandoc runs ONLY in
// this image — `api`, `web` and `worker` call the ExportRunner seam; their images carry no pandoc.

export const PACKAGE_NAME = "@rhema/export" as const;

export { EXPORT_FORMATS, EXPORT_FORMAT_INFO, exportMarkdown, exportFileName, ExportError } from "./export.js";
export type { ExportFormat, ExportFormatInfo, ExportResult } from "./export.js";
export { execPandoc, pandocBin, pandocAvailable, PandocError } from "./pandoc.js";
export type { PandocExec, PandocArgs } from "./pandoc.js";
export { runExportFile, createExportServer } from "./main.js";
