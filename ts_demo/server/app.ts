import express, { type ErrorRequestHandler, type Response } from "express";
import type { ChatResponse, RetrievalSettings } from "../shared/types.js";
import type { IndexJob } from "./indexJob.js";
import type { Corpus } from "./corpus.js";
import { DocumentError } from "./documents.js";

export interface AppDependencies {
  ask: (question: string) => Promise<ChatResponse>;
  index: IndexJob;
  corpus: Corpus;
  settings: { get(): RetrievalSettings; update(patch: unknown): RetrievalSettings };
}

// Corpus problems describe themselves; anything else stays generic so service details do not leak.
function fail(res: Response, error: unknown) {
  if (error instanceof DocumentError) res.status(400).json({ error: error.message });
  else res.status(503).json({ error: "Unable to read or update the corpus. Check that Chroma is running and that the demo_docs folder is writable." });
}

export function createApp({ ask, index, corpus, settings }: AppDependencies) {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  app.use(express.json({ limit: "64kb" }));
  app.get("/api/health", (_req, res) => { res.json({ status: "ok" }); });
  app.post("/api/chat", async (req, res) => {
    const question: unknown = req.body?.question;
    if (typeof question !== "string" || !question.trim() || question.length > 10000) {
      res.status(400).json({ error: "Enter a question between 1 and 10,000 characters." });
      return;
    }
    try {
      res.json(await ask(question.trim()));
    } catch {
      res.status(503).json({ error: "Unable to query local policies. Check that Ollama and Chroma are running, llama3.2 and nomic-embed-text are installed, and demo_docs contains readable supported files. Then try again." });
    }
  });
  app.get("/api/settings", (_req, res) => { res.json(settings.get()); });
  app.put("/api/settings", (req, res) => {
    try {
      res.json(settings.update(req.body));
    } catch (error) {
      // Only our own bounds checks throw here, so the message is safe to return.
      res.status(400).json({ error: (error as Error).message });
    }
  });
  app.get("/api/documents", async (_req, res) => {
    try {
      res.json({ documents: await corpus.list() });
    } catch (error) { fail(res, error); }
  });
  app.post("/api/documents", express.raw({ type: "*/*", limit: "25mb" }), async (req, res) => {
    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: "Send the file bytes with Content-Type: application/octet-stream." });
      return;
    }
    try {
      const source = await corpus.save(String(req.query.name || ""), req.body);
      // Index the new file right away unless a run is already in flight, which the caller can see.
      res.status(201).json({ source, syncing: index.start() });
    } catch (error) { fail(res, error); }
  });
  app.delete("/api/documents", async (req, res) => {
    try {
      await corpus.remove(String(req.query.source || ""));
      res.json({ syncing: index.start() });
    } catch (error) { fail(res, error); }
  });
  app.post("/api/index/sync", (_req, res) => {
    if (!index.start()) {
      res.status(409).json({ error: "Indexing is already running." });
      return;
    }
    res.status(202).json(index.status());
  });
  app.get("/api/index/status", (_req, res) => { res.json(index.status()); });
  app.use("/api", (_req, res) => { res.status(404).json({ error: "Unknown API endpoint." }); });
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error.type === "entity.too.large" ? 413 : 400;
    res.status(status).json({ error: status === 413 ? "Request is too large." : "Invalid JSON request." });
  };
  app.use(handleError);
  return app;
}
