import path from "node:path";
import { fileURLToPath } from "node:url";

// Source lives in server/; compiled modules live in dist/server/.
export const appRoot = fileURLToPath(new URL(import.meta.url.endsWith(".js") ? "../../" : "../", import.meta.url));
export const docsDirectory = path.resolve(appRoot, "../demo_docs");
