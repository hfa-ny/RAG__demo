import { ChromaClient, IncludeEnum, type Collection } from "chromadb";
import { ChatOllama, OllamaEmbeddings } from "@langchain/ollama";
import { docsDirectory } from "./paths.js";
import { readIndexedSources, reconcile, type SyncSummary } from "./reconcile.js";
import type { ChatResponse } from "../shared/types.js";

export const SYSTEM_PROMPT = "You are a secure university assistant. Use the following context to answer the question. " +
  "If the answer is not in the context, explicitly state that you do not have that information.\n\n";

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
  let collectionPromise: Promise<Collection> | undefined;
  let firstSync: Promise<void> | undefined;

  function collection(): Promise<Collection> {
    // Share the connection across requests, but allow a retry after a failure.
    collectionPromise ??= (async () => {
      await client.heartbeat();
      // Cosine keeps query distances on a fixed scale, so a similarity cutoff stays interpretable.
      return client.getOrCreateCollection({
        name: collectionName, embeddingFunction: null, metadata: { "hnsw:space": "cosine" },
      });
    })().catch((error: unknown) => { collectionPromise = undefined; throw error; });
    return collectionPromise;
  }

  async function sync(onProgress?: (completed: number, total: number) => void): Promise<SyncSummary> {
    const summary = await reconcile({
      collection: await collection(), embeddings, directory: docsDirectory, onProgress,
    });
    firstSync ??= Promise.resolve(); // An explicit sync also satisfies the lazy one below.
    return summary;
  }

  async function ensureIndexed(): Promise<void> {
    firstSync ??= sync().then(() => undefined).catch((error: unknown) => { firstSync = undefined; throw error; });
    await firstSync;
  }

  return {
    sync,
    async documents() {
      return readIndexedSources(await collection());
    },
    async ask(question: string): Promise<ChatResponse> {
      await ensureIndexed();
      const active = await collection();
      const indexed = await active.count();
      if (!indexed) throw new Error("The index is empty. Add a supported document, then run a sync.");
      const result = await active.query({
        queryEmbeddings: [await embeddings.embedQuery(question)],
        nResults: Math.min(4, indexed),
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
      await firstSync?.catch(() => {});
    },
  };
}
