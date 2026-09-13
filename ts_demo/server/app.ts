import express, { type ErrorRequestHandler } from "express";
import type { ChatResponse } from "../shared/types.js";

export function createApp(ask: (question: string) => Promise<ChatResponse>) {
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
  app.use("/api", (_req, res) => { res.status(404).json({ error: "Unknown API endpoint." }); });
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error.type === "entity.too.large" ? 413 : 400;
    res.status(status).json({ error: status === 413 ? "Request is too large." : "Invalid JSON request." });
  };
  app.use(handleError);
  return app;
}
