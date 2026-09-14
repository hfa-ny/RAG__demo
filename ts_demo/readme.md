# TypeScript demo

Node/Express backend, TypeScript browser UI, LangChain text splitting and Ollama
integration, and a local Chroma server. The shared policies live in `../demo_docs/`.
`shared/` contains types used only by this app's frontend and backend.

The loader indexes extracted text from local `.txt`, `.md`, `.html`, `.htm`,
`.pdf`, `.docx`, `.csv`, `.xlsx`, and `.pptx` files. PDF support is text-first:
scanned or image-only PDFs require OCR, which is outside this demo.

## Setup

Install Node.js 22.12+ (Node 24 recommended), Docker Desktop, and Ollama. Start
Docker Desktop and Ollama, and download `llama3.2` and `nomic-embed-text`.
From the repository root:

```bash
cd ts_demo
npm ci
docker compose up -d chroma
npm run dev
```

Open **http://localhost:8502**. Stop the Node server with **Ctrl+C** in your shell.
Python can run separately on port 8501.

Copy `.env.example` to `.env` inside this folder to configure the port, model
names, or local service URLs. The app loads that file relative to its own folder,
even when launched from elsewhere. Shell environment variables take precedence.
LangChain tracing is disabled. The app and Docker Chroma port bind to loopback by
default; set `HOST=0.0.0.0` only when the app runs inside a container.

If you already run Chroma, skip Docker and set `CHROMA_URL` as needed. The Compose
project name stays `demo` so commands in this folder manage the existing Chroma
container created before the apps were separated.

## Build and verify

```bash
npm test
npm run build
npm start
```

`npm run typecheck` checks frontend and backend TypeScript. Tests cover document
loading/chunking across multiple supported formats, per-file loading and content
hashing, index reconciliation, request validation, upload and path-traversal
rejection, retrieval settings bounds, the similarity cutoff, source responses,
and unavailable services.

The index is persistent and named by `CHROMA_COLLECTION`, stored in the `chroma-data`
volume. The first question indexes the corpus; after that, each sync compares the
files on disk against what the index already holds and only embeds what changed.
Editing a policy and running a sync is enough — no restart required.

Stop Chroma while preserving the container with `docker compose stop chroma`.
`docker compose down` removes the container but keeps the `chroma-data` volume;
add `-v` to discard the index as well.
`/api/health` checks the web server only, not Ollama or Chroma.

## Managing the corpus and tuning retrieval

**Corpus and retrieval settings** above the chat box lists the indexed documents,
uploads and removes them, runs a sync, and adjusts retrieval. The same operations
are available directly:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/documents` | Indexed documents with chunk counts, plus files not yet indexed and sources whose file is gone |
| `POST /api/documents?name=<file>` | Upload one file as `application/octet-stream` (25 MB cap, supported extensions, plain file name only) |
| `DELETE /api/documents?source=<file>` | Remove a document from the folder and the index |
| `POST /api/index/sync` | Start a sync; `409` if one is already running |
| `GET /api/index/status` | Job state, progress, and the last sync summary |
| `GET`/`PUT /api/settings` | Read or change `topK` (1-20) and `minSimilarity` (0-1) |

Uploading or deleting starts a sync automatically unless one is already running,
in which case the panel shows the document as pending until the next sync.

`topK` and `minSimilarity` are applied per question and never re-index anything,
so they are safe to adjust while demonstrating. Chunk size, overlap, and the
embedding model are not adjustable here: changing any of them invalidates every
stored vector and would require re-embedding the whole corpus.

Passages scoring below `minSimilarity` are dropped before the prompt is built. If
that leaves nothing, the answer says the information is unavailable and the chat
model is never called, which is a firmer guarantee than asking it to decline.

Commands can also run from the repository root:

```bash
npm --prefix ts_demo run dev
# Or, after building:
node ts_demo/dist/server/index.js
```

## Docker

The root `compose.yaml` can run this app, Chroma, and the Python app while keeping
Ollama on the host. From the repository root:

```bash
docker compose up --build typescript chroma
```

Open **http://localhost:8502**. The container uses
`CHROMA_URL=http://chroma:8000`, `HOST=0.0.0.0`, and
`OLLAMA_BASE_URL=http://host.docker.internal:11434`. The shared `../demo_docs`
folder is mounted writable for this app so uploads can be saved; the Python app
still mounts it read-only. Running directly with Node remains fully supported.

See the [root README](../readme.md) for demo questions.
