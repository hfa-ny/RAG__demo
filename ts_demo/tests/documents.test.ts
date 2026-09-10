import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { loadChunks } from "../server/documents.js";

test("loads nested text documents and splits them with overlap and source metadata", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "campus-docs-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, "nested"));
  await writeFile(path.join(directory, "nested", "policy.txt"), "0123456789".repeat(120));
  await writeFile(path.join(directory, "ignored.md"), "Do not index this.");
  const chunks = await loadChunks(directory);
  assert.deepEqual(chunks.map((chunk) => chunk.pageContent.length), [500, 500, 300]);
  assert.ok(chunks.every((chunk) => chunk.metadata.source === path.join("nested", "policy.txt")));
  assert.equal(chunks[0].pageContent.slice(-50), chunks[1].pageContent.slice(0, 50));
});

test("creates the fallback policy only for a missing directory and reports empty folders", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "campus-empty-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(loadChunks(directory), /nonempty .txt/);
  const chunks = await loadChunks(path.join(directory, "missing"));
  assert.match(chunks[0].pageContent, /CUNY Demo Policy/);
});
