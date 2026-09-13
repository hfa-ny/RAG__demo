import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export const supportedExtensions = new Set([".txt", ".md", ".html", ".htm", ".pdf", ".docx", ".csv", ".xlsx", ".pptx"]);
const fallbackPolicy = "CUNY Demo Policy: All student data must remain on secure, localized servers. Public LLM APIs are strictly prohibited for processing FERPA-protected information.";

function sourceMetadata(directory: string, filename: string, section?: string) {
  return {
    source: path.relative(directory, filename),
    format: path.extname(filename).slice(1).toLowerCase(),
    ...(section ? { section } : {}),
  };
}

function documentFromText(directory: string, filename: string, text: string, section?: string): Document | undefined {
  const pageContent = text.trim();
  if (!pageContent) return undefined;
  return new Document({ pageContent, metadata: sourceMetadata(directory, filename, section) });
}

function formatRows(rows: string[][], offset: number) {
  return rows.map((row, index) => {
    const cells = row.map((cell) => cell.trim()).filter(Boolean);
    return cells.length ? `Row ${offset + index}: ${cells.join(" | ")}` : "";
  }).filter(Boolean).join("\n");
}

function chunkRows(rows: string[][], sectionPrefix: string) {
  const chunks: { text: string; section: string }[] = [];
  for (let offset = 0; offset < rows.length; offset += 50) {
    const batch = rows.slice(offset, offset + 50);
    chunks.push({
      text: formatRows(batch, offset + 1),
      section: `${sectionPrefix}rows ${offset + 1}-${offset + batch.length}`,
    });
  }
  return chunks;
}

async function loadTextFile(directory: string, filename: string) {
  const document = documentFromText(directory, filename, await readFile(filename, "utf8"));
  return document ? [document] : [];
}

async function loadHtmlFile(directory: string, filename: string) {
  const { htmlToText } = await import("html-to-text");
  const text = htmlToText(await readFile(filename, "utf8"), {
    selectors: [
      { selector: "script", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "noscript", format: "skip" },
    ],
    wordwrap: false,
  });
  const document = documentFromText(directory, filename, text);
  return document ? [document] : [];
}

async function loadPdfFile(directory: string, filename: string) {
  const pdfParseModule = await import("pdf-parse");
  const pdfParse = (pdfParseModule.default ?? pdfParseModule) as any;
  const pages: string[] = [];
  const data = await pdfParse(await readFile(filename), {
    pagerender: async (pageData: any) => {
      const textContent = await pageData.getTextContent();
      const text = textContent.items.map((item: { str?: string }) => item.str || "").join(" ");
      pages.push(text);
      return text;
    },
  });
  const pageTexts = pages.length ? pages : [data.text || ""];
  return pageTexts.flatMap((text, index) => {
    const document = documentFromText(directory, filename, text, pageTexts.length > 1 ? `page ${index + 1}` : "document");
    return document ? [document] : [];
  });
}

async function loadDocxFile(directory: string, filename: string) {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: await readFile(filename) });
  const document = documentFromText(directory, filename, result.value, "document");
  return document ? [document] : [];
}

async function loadCsvFile(directory: string, filename: string) {
  const { parse } = await import("csv-parse/sync");
  const rows = parse(await readFile(filename, "utf8"), {
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][];
  return chunkRows(rows, "").flatMap(({ text, section }) => {
    const document = documentFromText(directory, filename, text, section);
    return document ? [document] : [];
  });
}

async function loadXlsxFile(directory: string, filename: string) {
  const readXlsxModule = await import("read-excel-file/node");
  const readXlsxFile = readXlsxModule.default;
  const readSheetNames = readXlsxModule.readSheetNames;
  const documents: Document[] = [];
  for (const sheetName of await readSheetNames(filename)) {
    const rows = (await readXlsxFile(filename, { sheet: sheetName }))
      .map((row) => row.map((value) => value == null ? "" : String(value)));
    for (const { text, section } of chunkRows(rows, `${sheetName} `)) {
      const document = documentFromText(directory, filename, text, section);
      if (document) documents.push(document);
    }
  }
  return documents;
}

function slideNumber(filename: string) {
  const match = /slide(\d+)\.xml$/i.exec(filename);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function collectXmlText(value: unknown, parts: string[] = []): string[] {
  if (typeof value === "string") {
    parts.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectXmlText(item, parts);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "a:t" || key.endsWith(":t")) collectXmlText(child, parts);
      else if (typeof child === "object") collectXmlText(child, parts);
    }
  }
  return parts;
}

async function loadPptxFile(directory: string, filename: string) {
  const JSZip = (await import("jszip")).default;
  const { XMLParser } = await import("fast-xml-parser");
  const zip = await JSZip.loadAsync(await readFile(filename));
  const parser = new XMLParser({ ignoreAttributes: true });
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
  const documents: Document[] = [];
  for (const [index, slideFile] of slideFiles.entries()) {
    const xml = await zip.files[slideFile].async("text");
    const text = collectXmlText(parser.parse(xml)).join("\n");
    const document = documentFromText(directory, filename, text, `slide ${index + 1}`);
    if (document) documents.push(document);
  }
  return documents;
}

async function loadFile(directory: string, filename: string): Promise<Document[]> {
  switch (path.extname(filename).toLowerCase()) {
    case ".txt":
    case ".md":
      return loadTextFile(directory, filename);
    case ".html":
    case ".htm":
      return loadHtmlFile(directory, filename);
    case ".pdf":
      return loadPdfFile(directory, filename);
    case ".docx":
      return loadDocxFile(directory, filename);
    case ".csv":
      return loadCsvFile(directory, filename);
    case ".xlsx":
      return loadXlsxFile(directory, filename);
    case ".pptx":
      return loadPptxFile(directory, filename);
    default:
      return [];
  }
}

export async function loadChunks(directory: string): Promise<Document[]> {
  try {
    await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "sample_policy.txt"), fallbackPolicy, { flag: "wx" });
  }

  const documents: Document[] = [];
  async function walk(folder: string): Promise<void> {
    const entries = await readdir(folder, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(filename);
      else if (entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase())) {
        try {
          documents.push(...await loadFile(directory, filename));
        } catch (error) {
          throw new Error(`Unable to extract text from ${path.relative(directory, filename)}: ${(error as Error).message}`);
        }
      }
    }
  }
  await walk(directory);
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 50 });
  const chunks = await splitter.splitDocuments(documents);
  if (!chunks.length) {
    throw new Error(`Add a readable supported document to demo_docs (${Array.from(supportedExtensions).sort().join(", ")}), then try again.`);
  }
  return chunks;
}
