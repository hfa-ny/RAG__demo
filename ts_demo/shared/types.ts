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
