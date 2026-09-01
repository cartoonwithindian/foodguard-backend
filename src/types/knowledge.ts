export type KnowledgeCategory =
  | "regulation"
  | "labelling"
  | "additives"
  | "contaminants"
  | "packaging"
  | "claims"
  | "grievance"
  | "foodguard"
  | "general";

export type KnowledgeDocumentRecord = {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  category: KnowledgeCategory;
  documentVersion: string;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeChunkRecord = {
  id: string;
  documentId: string;
  content: string;
  section: string;
  pageNumber?: number | null;
  metadata: Record<string, string>;
  embedding?: number[] | null;
  createdAt: string;
};

export type KnowledgeSearchHit = {
  chunk: KnowledgeChunkRecord;
  score: number;
};

export type KnowledgeSeedSection = {
  section: string;
  content: string;
  pageNumber?: number;
};

export type KnowledgeSeedInput = {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  category: KnowledgeCategory;
  documentVersion: string;
  sections: KnowledgeSeedSection[];
};