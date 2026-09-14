import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import JSZip from "jszip";
import { loadChunks, listSupportedFiles, loadFileChunks, fileContentHash } from "../server/documents.js";

async function writeXlsx(filename: string) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
    </Types>`);
  zip.file("_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
    </Relationships>`);
  zip.file("xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <sheets><sheet name="Budgets" sheetId="1" r:id="rId1"/></sheets>
    </workbook>`);
  zip.file("xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
    </Relationships>`);
  zip.file("xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>Department</t></is></c><c r="B1" t="inlineStr"><is><t>Limit</t></is></c></row>
        <row r="2"><c r="A2" t="inlineStr"><is><t>Media Arts</t></is></c><c r="B2" t="inlineStr"><is><t>$3200</t></is></c></row>
      </sheetData>
    </worksheet>`);
  await writeFile(filename, await zip.generateAsync({ type: "nodebuffer" }));
}

test("loads nested text and markdown documents with source metadata", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "campus-docs-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, "nested"));
  await writeFile(path.join(directory, "nested", "policy.txt"), "0123456789".repeat(120));
  await writeFile(path.join(directory, "policy.md"), "# Markdown Policy\n\nIndex this policy.");
  await writeFile(path.join(directory, "ignored.png"), "Do not index this.");
  const chunks = await loadChunks(directory);
  const textChunks = chunks.filter((chunk) => chunk.metadata.source === path.join("nested", "policy.txt"));
  assert.deepEqual(textChunks.map((chunk) => chunk.pageContent.length), [500, 500, 300]);
  assert.equal(textChunks[0].pageContent.slice(-50), textChunks[1].pageContent.slice(0, 50));
  assert.ok(chunks.some((chunk) => chunk.metadata.source === "policy.md" && chunk.metadata.format === "md"));
  assert.ok(chunks.every((chunk) => chunk.metadata.source !== "ignored.png"));
});

test("loads html, csv, xlsx, and pptx files with section metadata", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "campus-mixed-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "policy.html"),
    "<html><body><h1>HTML Policy</h1><p>Browser exports are indexed.</p><script>hidden()</script></body></html>");
  await writeFile(path.join(directory, "policy.csv"), "name,rule\nAI,Local only\n");

  await writeXlsx(path.join(directory, "policy.xlsx"));

  const zip = new JSZip();
  zip.file("ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Slide Policy</a:t></a:r></a:p><a:p><a:r><a:t>Workstations need approval.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
    </p:sld>`);
  await writeFile(path.join(directory, "policy.pptx"), await zip.generateAsync({ type: "nodebuffer" }));

  const chunks = await loadChunks(directory);
  const text = chunks.map((chunk) => chunk.pageContent).join("\n");
  assert.match(text, /HTML POLICY/);
  assert.doesNotMatch(text, /hidden/);
  assert.match(text, /Row 2: AI \| Local only/);
  assert.match(text, /Media Arts \| \$3200/);
  assert.match(text, /Slide Policy/);
  assert.ok(chunks.some((chunk) => chunk.metadata.source === "policy.csv" && chunk.metadata.section === "rows 1-2"));
  assert.ok(chunks.some((chunk) => chunk.metadata.source === "policy.xlsx" && chunk.metadata.section === "Budgets rows 1-2"));
  assert.ok(chunks.some((chunk) => chunk.metadata.source === "policy.pptx" && chunk.metadata.section === "slide 1"));
});

test("lists and loads one file at a time, tagging chunks with a content hash", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "campus-perfile-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, "nested"));
  await writeFile(path.join(directory, "nested", "deep.txt"), "Nested policy text.");
  await writeFile(path.join(directory, "policy.md"), "# Policy\n\nOriginal text.");
  await writeFile(path.join(directory, "ignored.png"), "Do not index this.");

  assert.deepEqual(await listSupportedFiles(directory), [path.join("nested", "deep.txt"), "policy.md"]);

  const chunks = await loadFileChunks(directory, "policy.md");
  assert.ok(chunks.length > 0);
  assert.ok(chunks.every((chunk) => chunk.metadata.source === "policy.md"));
  const hash = await fileContentHash(directory, "policy.md");
  assert.ok(chunks.every((chunk) => chunk.metadata.contentHash === hash));

  // A rewritten file must hash differently, or reconciliation would skip it as unchanged.
  await writeFile(path.join(directory, "policy.md"), "# Policy\n\nRevised text.");
  assert.notEqual(await fileContentHash(directory, "policy.md"), hash);
});

test("creates the fallback policy only for a missing directory and reports empty folders", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "campus-empty-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(loadChunks(directory), /readable supported document/);
  const chunks = await loadChunks(path.join(directory, "missing"));
  assert.match(chunks[0].pageContent, /CUNY Demo Policy/);
});
