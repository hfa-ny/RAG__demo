import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DocumentError, listSupportedFiles, supportedExtensions } from "./documents.js";
import type { IndexedSource } from "./reconcile.js";
import type { DocumentSummary } from "../shared/types.js";

const supportedList = () => [...supportedExtensions].sort().join(", ");

// Resolves a caller-supplied name to a path proven to sit inside the corpus folder.
export function resolveSource(directory: string, source: string): string {
  if (!source || source.includes("\0")) throw new DocumentError("Provide a document name.");
  const filename = path.resolve(directory, source);
  const root = path.resolve(directory) + path.sep;
  if (!filename.startsWith(root)) throw new DocumentError("Document names must stay inside the corpus folder.");
  if (!supportedExtensions.has(path.extname(filename).toLowerCase())) {
    throw new DocumentError(`Unsupported file type. Use one of: ${supportedList()}.`);
  }
  return filename;
}

export function createCorpus(directory: string, indexedSources: () => Promise<Map<string, IndexedSource>>) {
  return {
    async list(): Promise<DocumentSummary[]> {
      const [onDisk, indexed] = await Promise.all([listSupportedFiles(directory), indexedSources()]);
      const documents: DocumentSummary[] = onDisk.map((source) => ({
        source,
        format: path.extname(source).slice(1).toLowerCase(),
        chunks: indexed.get(source)?.chunks ?? 0,
        indexed: indexed.has(source),
        missing: false,
      }));
      // Sources the index still holds but the folder no longer has, until the next sync clears them.
      for (const [source, info] of indexed) {
        if (onDisk.includes(source)) continue;
        documents.push({
          source, format: path.extname(source).slice(1).toLowerCase(),
          chunks: info.chunks, indexed: true, missing: true,
        });
      }
      return documents;
    },

    async save(name: string, bytes: Buffer): Promise<string> {
      // Uploads are flat names only: a folder component is rejected rather than quietly flattened.
      const base = path.basename(name || "");
      if (!name || base !== name) throw new DocumentError("Use a plain file name without folders.");
      const filename = resolveSource(directory, base);
      if (!bytes.length) throw new DocumentError("The uploaded file is empty.");
      await mkdir(directory, { recursive: true });
      await writeFile(filename, bytes);
      return path.relative(directory, filename);
    },

    async remove(source: string): Promise<void> {
      const filename = resolveSource(directory, source);
      try {
        await unlink(filename);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new DocumentError("That document is not in the corpus folder.");
        }
        throw error;
      }
    },
  };
}

export type Corpus = ReturnType<typeof createCorpus>;
