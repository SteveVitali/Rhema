import JSZip from "jszip";

// Test fixtures for the convert pipeline. There are NO committed manuscript binaries in the repo (the six real
// PDFs are the operator's H2 corpus — deferred), so we synthesize minimal-but-valid docx/pdf bytes here.

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function paragraph(text: string, heading?: 1 | 2): string {
  const pPr = heading ? `<w:pPr><w:pStyle w:val="Heading${heading}"/></w:pPr>` : "";
  return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

function documentXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
}

/** Build valid .docx bytes from a heading + paragraphs (compression STORE by default). */
export async function makeDocx(opts: { headingText?: string; paragraphs: string[] }): Promise<Uint8Array> {
  const body =
    (opts.headingText ? paragraph(opts.headingText, 1) : "") +
    opts.paragraphs.map((p) => paragraph(p)).join("");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS);
  zip.file("word/_rels/document.xml.rels", DOC_RELS);
  zip.file("word/document.xml", documentXml(body));
  return zip.generateAsync({ type: "uint8array" });
}

/** An 8,000-word .docx with a heading and a few citation-like spans. */
export async function make8kWordDocx(): Promise<Uint8Array> {
  const sentence = "The argument develops across many careful and deliberate sentences of prose. ";
  const wordsPerSentence = sentence.trim().split(/\s+/).length; // 12
  const paragraphs: string[] = [];
  let words = 0;
  let p = "";
  while (words < 8000) {
    p += sentence;
    words += wordsPerSentence;
    if (words % 120 === 0) {
      p += "See the evaluation [12] and the ruling [3, 4]. ";
      words += 6;
      paragraphs.push(p.trim());
      p = "";
    }
  }
  if (p.trim()) paragraphs.push(p.trim());
  return makeDocx({ headingText: "A Real Manuscript", paragraphs });
}

/** A .docx whose main part is a highly-compressible megabyte-scale blob — a decompression bomb. */
export async function makeZipBombDocx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS);
  zip.file("word/document.xml", "A".repeat(6 * 1024 * 1024)); // 6 MB of one byte → tiny compressed → huge ratio
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/** A minimal but VALID single-page PDF with a real text layer ("<text>"), correct xref offsets. */
export function makePdf(text: string): Uint8Array {
  const enc = (s: string) => new TextEncoder().encode(s);
  const objects: string[] = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    "", // filled below (content stream)
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  const stream = `BT /F1 24 Tf 72 700 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET`;
  objects[3] = `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets[i] = pdf.length;
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF`;
  return enc(pdf);
}

/** An HTML fixture with an unconvertible island (iframe) + a normal paragraph. */
export function htmlWithUnconvertible(): string {
  return `<html><body><h1>Heading</h1><p>A paragraph with a <a href="https://example.org/src">source</a>.</p><iframe src="https://evil.example/x"></iframe></body></html>`;
}
