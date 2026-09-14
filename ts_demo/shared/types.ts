export interface SourceDocument {
  pageContent: string;
  source: string;
  format?: string;
  section?: string;
}

export interface ChatResponse {
  answer: string;
  context: SourceDocument[];
}

export interface DocumentSummary {
  source: string;
  format: string;
  chunks: number;
  indexed: boolean;
  /** Still in the index but no longer on disk; the next sync removes it. */
  missing: boolean;
}

export interface SyncSummary {
  added: string[];
  changed: string[];
  removed: string[];
  unchanged: string[];
  chunksAdded: number;
  chunksRemoved: number;
}

export interface IndexStatus {
  state: "idle" | "running" | "failed";
  completed: number;
  total: number;
  summary?: SyncSummary;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}
