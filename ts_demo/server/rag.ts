import { ChromaClient, IncludeEnum, type Collection } from "chromadb";
import { ChatOllama, OllamaEmbeddings } from "@langchain/ollama";
import { loadChunks } from "./documents.js";
import { docsDirectory } from "./paths.js";
import type { ChatResponse } from "../shared/types.js";

export const SYSTEM_PROMPT = "You are a secure university assistant. Use the following context to answer the question. " +
  "If the answer is not in the context, explicitly state that you do not have that information.\n\n";

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

export function createRag() {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const chromaUrl = new URL(process.env.CHROMA_URL || "http://127.0.0.1:8000");
  const client = new ChromaClient({
    host: chromaUrl.hostname,
    port: Number(chromaUrl.port || (chromaUrl.protocol === "https:" ? 443 : 80)),
    ssl: chromaUrl.protocol === "https:",
  });
  const embeddings = new OllamaEmbeddings({
    model: process.env.EMBEDDING_MODEL || "nomic-embed-text", baseUrl, maxRetries: 0,
  });
  const llm = new ChatOllama({ model: process.env.CHAT_MODEL || "llama3.2", baseUrl, maxRetries: 0 });
  const collectionName = process.env.CHROMA_COLLECTION || "campus-policies";
  let collection: Collection | undefined;
  let indexPromise: Promise<{ collection: Collection; count: number }> | undefined;

  async function buildIndex() {
    await client.heartbeat();
    // Cosine keeps query distances on a 0-2 scale, so a similarity cutoff stays interpretable.
    collection = await client.getOrCreateCollection({
      name: collectionName, embeddingFunction: null, metadata: { "hnsw:space": "cosine" },
    });
    const indexed = await collection.count();
    if (indexed > 0) return { collection, count: indexed };

    const chunks = await loadChunks(docsDirectory);
    const ids = chunkIds(chunks);
    const added: string[] = [];
    try {
      for (let offset = 0; offset < chunks.length; offset += 32) {
        const batch = chunks.slice(offset, offset + 32);
        const batchIds = ids.slice(offset, offset + 32);
        const texts = batch.map((doc) => doc.pageContent);
        await collection.add({
          ids: batchIds,
          documents: texts,
          metadatas: batch.map((doc) => ({
            source: String(doc.metadata.source),
            format: String(doc.metadata.format || ""),
            section: String(doc.metadata.section || ""),
          })),
          embeddings: await embeddings.embedDocuments(texts),
        });
        added.push(...batchIds);
      }
      return { collection, count: chunks.length };
    } catch (error) {
      // Drop the partial write so the next attempt rebuilds instead of trusting a half-filled collection.
      if (added.length) await collection.delete({ ids: added }).catch(() => {});
      collection = undefined;
      throw error;
    }
  }

  return {
    async ask(question: string): Promise<ChatResponse> {
      // Share the initialization promise across requests, but allow retry after a failure.
      indexPromise ??= buildIndex().catch((error: unknown) => { indexPromise = undefined; throw error; });
      const index = await indexPromise;
      const result = await index.collection.query({
        queryEmbeddings: [await embeddings.embedQuery(question)],
        nResults: Math.min(4, index.count),
        include: [IncludeEnum.documents, IncludeEnum.metadatas],
      });
      const context = (result.documents[0] || []).map((text, i) => ({
        pageContent: text || "",
        source: String(result.metadatas[0]?.[i]?.source || ""),
        format: String(result.metadatas[0]?.[i]?.format || ""),
        section: String(result.metadatas[0]?.[i]?.section || ""),
      }));
      const response = await llm.invoke([
        ["system", SYSTEM_PROMPT + context.map((doc) => doc.pageContent).join("\n\n")],
        ["human", question],
      ]);
      return { answer: response.text, context };
    },
    // The collection outlives the process now; settle in-flight indexing so shutdown cannot tear a batch.
    async close() {
      await indexPromise?.catch(() => {});
    },
  };
}
