import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export async function loadChunks(directory: string): Promise<Document[]> {
  try {
    await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "sample_policy.txt"),
      "CUNY Demo Policy: All student data must remain on secure, localized servers. Public LLM APIs are strictly prohibited for processing FERPA-protected information.",
      { flag: "wx" });
  }

  const documents: Document[] = [];
  async function walk(folder: string): Promise<void> {
    const entries = await readdir(folder, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(filename);
      else if (entry.isFile() && entry.name.endsWith(".txt")) {
        documents.push(new Document({
          pageContent: await readFile(filename, "utf8"),
          metadata: { source: path.relative(directory, filename) },
        }));
      }
    }
  }
  await walk(directory);
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 50 });
  const chunks = await splitter.splitDocuments(documents);
  if (!chunks.length) throw new Error("Add a nonempty .txt policy file to demo_docs, then try again.");
  return chunks;
}
