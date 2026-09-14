import { IncludeEnum, type Collection } from "chromadb";
import { fileContentHash, listSupportedFiles, loadFileChunks } from "./documents.js";
import type { SyncSummary } from "../shared/types.js";

export type { SyncSummary };

export interface IndexDiff {
  added: string[];
  changed: string[];
  removed: string[];
  unchanged: string[];
}

export interface IndexedSource {
  contentHash: string;
  chunks: number;
}

interface Embedder {
  embedDocuments(texts: string[]): Promise<number[][]>;
}

// Chunk ids stay stable across rebuilds so a single source's chunks can be replaced or removed on their own.
export function chunkIds(chunks: { metadata: Record<string, unknown> }[]): string[] {
  const perSource = new Map<string, number>();
  return chunks.map((doc) => {
    const source = String(doc.metadata.source);
    const index = perSource.get(source) ?? 0;
    perSource.set(source, index + 1);
    return `${source}::${index}`;
  });
}

export function diffSources(onDisk: Map<string, string>, indexed: Map<string, string>): IndexDiff {
  const diff: IndexDiff = { added: [], changed: [], removed: [], unchanged: [] };
  for (const source of [...onDisk.keys()].sort()) {
    const previous = indexed.get(source);
    if (previous === undefined) diff.added.push(source);
    else if (previous === onDisk.get(source)) diff.unchanged.push(source);
    else diff.changed.push(source);
  }
  for (const source of [...indexed.keys()].sort()) {
    if (!onDisk.has(source)) diff.removed.push(source);
  }
  return diff;
}

// The index is its own manifest: every chunk carries the hash of the file it came from,
// so there is no side-car state file that can drift away from what is actually stored.
export async function readIndexedSources(collection: Collection): Promise<Map<string, IndexedSource>> {
  const sources = new Map<string, IndexedSource>();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const page = await collection.get({ limit: pageSize, offset, include: [IncludeEnum.metadatas] });
    const metadatas = page.metadatas || [];
    for (const metadata of metadatas) {
      const source = String(metadata?.source || "");
      if (!source) continue;
      const existing = sources.get(source);
      if (existing) existing.chunks += 1;
      else sources.set(source, { contentHash: String(metadata?.contentHash || ""), chunks: 1 });
    }
    if (metadatas.length < pageSize) break;
  }
  return sources;
}

async function hashesOnDisk(directory: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  for (const source of await listSupportedFiles(directory)) {
    hashes.set(source, await fileContentHash(directory, source));
  }
  return hashes;
}

async function indexSource(
  collection: Collection, embeddings: Embedder, directory: string, source: string,
): Promise<number> {
  const chunks = await loadFileChunks(directory, source);
  const ids = chunkIds(chunks);
  for (let offset = 0; offset < chunks.length; offset += 32) {
    const batch = chunks.slice(offset, offset + 32);
    const texts = batch.map((doc) => doc.pageContent);
    await collection.add({
      ids: ids.slice(offset, offset + 32),
      documents: texts,
      metadatas: batch.map((doc) => ({
        source: String(doc.metadata.source),
        format: String(doc.metadata.format || ""),
        section: String(doc.metadata.section || ""),
        contentHash: String(doc.metadata.contentHash || ""),
      })),
      embeddings: await embeddings.embedDocuments(texts),
    });
  }
  return chunks.length;
}

export async function reconcile(options: {
  collection: Collection;
  embeddings: Embedder;
  directory: string;
  onProgress?: (completed: number, total: number) => void;
}): Promise<SyncSummary> {
  const { collection, embeddings, directory, onProgress } = options;
  const indexed = await readIndexedSources(collection);
  const diff = diffSources(
    await hashesOnDisk(directory),
    new Map([...indexed].map(([source, { contentHash }]) => [source, contentHash])),
  );

  // Stale chunks go first so a failure part way through leaves nothing that claims to be current.
  let chunksRemoved = 0;
  for (const source of [...diff.changed, ...diff.removed]) {
    await collection.delete({ where: { source } });
    chunksRemoved += indexed.get(source)?.chunks ?? 0;
  }

  const pending = [...diff.added, ...diff.changed];
  let chunksAdded = 0;
  let completed = 0;
  onProgress?.(0, pending.length);
  for (const source of pending) {
    chunksAdded += await indexSource(collection, embeddings, directory, source);
    onProgress?.(++completed, pending.length);
  }
  return { ...diff, chunksAdded, chunksRemoved };
}
