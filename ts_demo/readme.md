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
loading/chunking across multiple supported formats, request validation, source
responses, and unavailable services.
The first question builds the index; restart after editing policies. Each process
uses its own collection and removes it on normal shutdown. A forced termination
can leave its collection behind.

Stop Chroma while preserving the container with `docker compose stop chroma`.
`docker compose down` removes this disposable demo database and its container.
`/api/health` checks the web server only, not Ollama or Chroma.

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
folder is mounted read-only. Running directly with Node remains fully supported.

See the [root README](../readme.md) for demo questions.
