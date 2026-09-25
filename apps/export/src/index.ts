// @rhema/export — the conversion container (§12.1, §13.4). One conversion per invocation across
// the full format registry (md/txt/html/docx/rtf/pdf/latex + the substack md profile). Pandoc and
// typst run ONLY in this image — `api`, `web` and `worker` call the ExportRunner seam; their
// images carry neither binary.

export const PACKAGE_NAME = "@rhema/export" as const;

export {
  CSL_STYLES,
  EXPORT_FORMATS,
  EXPORT_FORMAT_INFO,
  MD_EXPORT_PROFILES,
  PROVENANCE_APPENDIX_FORMATS,
  exportMarkdown,
  exportFileName,
  ExportError,
} from "./export.js";
export type {
  CslStyle,
  ExportArgs,
  ExportFigure,
  ExportFormat,
  ExportFormatInfo,
  ExportResult,
  MdExportProfile,
} from "./export.js";
export { execPandoc, pandocBin, pandocAvailable, typstBin, typstAvailable, PandocError } from "./pandoc.js";
export type { PandocExec, PandocArgs } from "./pandoc.js";
export { rewriteFiguresForFormat, figureSourcesAppendix } from "./figures.js";
export { substackMarkdown } from "./substack.js";
export { CSL_STYLE_XML } from "./csl-styles.js";
export { runExportFile, createExportServer } from "./main.js";
