export interface SourceDocument {
  pageContent: string;
  source: string;
}

export interface ChatResponse {
  answer: string;
  context: SourceDocument[];
}
