import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { Collection } from "chromadb";
import { fileContentHash } from "../server/documents.js";
import { chunkIds, diffSources, reconcile } from "../server/reconcile.js";

interface Row { id: string; metadata: Record<string, unknown> }

function fakeCollection(rows: Row[]) {
  const deleted: string[] = [];
  const collection = {
    async get({ limit, offset }: { limit: number; offset: number }) {
      return { metadatas: rows.slice(offset, offset + limit).map((row) => row.metadata) };
    },
    async delete({ where }: { where: { source: string } }) {
      deleted.push(where.source);
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index].metadata.source === where.source) rows.splice(index, 1);
      }
    },
    async add({ ids, metadatas }: { ids: string[]; metadatas: Record<string, unknown>[] }) {
      ids.forEach((id, index) => rows.push({ id, metadata: metadatas[index] }));
    },
  };
  return { collection: collection as unknown as Collection, deleted };
}

const embeddings = { async embedDocuments(texts: string[]) { return texts.map(() => [0, 0, 0]); } };

test("classifies sources as added, changed, removed, or unchanged", () => {
  const onDisk = new Map([["keep.txt", "a"], ["edit.txt", "new"], ["fresh.txt", "c"]]);
  const indexed = new Map([["keep.txt", "a"], ["edit.txt", "old"], ["gone.txt", "d"]]);
  assert.deepEqual(diffSources(onDisk, indexed), {
    added: ["fresh.txt"], changed: ["edit.txt"], removed: ["gone.txt"], unchanged: ["keep.txt"],
  });
});

test("numbers chunk ids per source so each file owns a stable range", () => {
  assert.deepEqual(chunkIds([
    { metadata: { source: "a.txt" } }, { metadata: { source: "a.txt" } }, { metadata: { source: "b.txt" } },
  ]), ["a.txt::0", "a.txt::1", "b.txt::0"]);
});

test("reconcile re-indexes only changed and new files and drops removed ones", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "campus-sync-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "keep.txt"), "Unchanged policy.");
  await writeFile(path.join(directory, "edit.txt"), "Revised policy.");
  await writeFile(path.join(directory, "fresh.txt"), "Brand new policy.");

  const rows: Row[] = [
    { id: "keep.txt::0", metadata: { source: "keep.txt", contentHash: await fileContentHash(directory, "keep.txt") } },
    { id: "edit.txt::0", metadata: { source: "edit.txt", contentHash: "stale-hash" } },
    { id: "gone.txt::0", metadata: { source: "gone.txt", contentHash: "orphan" } },
  ];
  const { collection, deleted } = fakeCollection(rows);

  const summary = await reconcile({ collection, embeddings, directory });

  assert.deepEqual(summary.added, ["fresh.txt"]);
  assert.deepEqual(summary.changed, ["edit.txt"]);
  assert.deepEqual(summary.removed, ["gone.txt"]);
  assert.deepEqual(summary.unchanged, ["keep.txt"]);
  assert.deepEqual(deleted.sort(), ["edit.txt", "gone.txt"]);
  assert.equal(summary.chunksRemoved, 2);
  assert.equal(summary.chunksAdded, 2);

  // The unchanged file keeps its original row; the deleted source leaves nothing behind.
  const sources = rows.map((row) => row.metadata.source).sort();
  assert.deepEqual(sources, ["edit.txt", "fresh.txt", "keep.txt"]);

  // A second pass with nothing touched on disk must do no work at all.
  const repeat = await reconcile({ collection, embeddings, directory });
  assert.deepEqual(repeat.unchanged.sort(), ["edit.txt", "fresh.txt", "keep.txt"]);
  assert.equal(repeat.chunksAdded, 0);
  assert.equal(repeat.chunksRemoved, 0);
});
