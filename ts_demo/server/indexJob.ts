import { DocumentError } from "./documents.js";
import type { SyncSummary } from "./reconcile.js";
import type { IndexStatus } from "../shared/types.js";

const SERVICE_ERROR = "Indexing failed. Check that Ollama and Chroma are running and that the configured models are installed.";

export type Sync = (onProgress: (completed: number, total: number) => void) => Promise<SyncSummary>;

export function createIndexJob(sync: Sync) {
  let status: IndexStatus = { state: "idle", completed: 0, total: 0 };
  let running: Promise<void> | undefined;

  return {
    status: (): IndexStatus => status,
    // Returns false when a run is already in flight, so a second request cannot double-index.
    start(): boolean {
      if (running) return false;
      status = { state: "running", completed: 0, total: 0, startedAt: new Date().toISOString() };
      running = sync((completed, total) => { status = { ...status, completed, total }; })
        .then((summary) => {
          status = { ...status, state: "idle", summary, finishedAt: new Date().toISOString() };
        })
        .catch((error: unknown) => {
          // Only corpus problems name themselves; service failures stay generic.
          const message = error instanceof DocumentError ? error.message : SERVICE_ERROR;
          status = { ...status, state: "failed", error: message, finishedAt: new Date().toISOString() };
        })
        .finally(() => { running = undefined; });
      return true;
    },
    async settled(): Promise<void> {
      await running;
    },
  };
}

export type IndexJob = ReturnType<typeof createIndexJob>;
