import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createApp } from "./app.js";
import { appRoot } from "./paths.js";

config({ path: path.join(appRoot, ".env"), quiet: true });

// Keep LangChain tracing disabled, even if it is enabled in the shell environment.
process.env.LANGCHAIN_TRACING_V2 = "false";
process.env.LANGCHAIN_TRACING = "false";
process.env.LANGSMITH_TRACING = "false";
const { createRag } = await import("./rag.js");
const rag = createRag();
const app = createApp((question) => rag.ask(question));
const production = import.meta.url.endsWith(".js");
let vite: import("vite").ViteDevServer | undefined;
if (production) {
  app.use(express.static(fileURLToPath(new URL("../client", import.meta.url))));
} else {
  const { createServer } = await import("vite");
  vite = await createServer({ root: appRoot, server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 8502);
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Secure Campus AI: http://localhost:${port}`);
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    const timer = setTimeout(() => process.exit(1), 10000);
    timer.unref();
    server.close();
    await vite?.close();
    await rag.close().catch(() => {});
    process.exit(0);
  });
}
