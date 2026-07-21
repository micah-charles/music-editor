export interface OmrConversionResult {
  ok: boolean;
  jobId: string;
  originalFilename: string;
  outputFilename?: string;
  musicXml?: string;
  warnings: string[];
  logs: string;
  elapsedMs: number;
  error?: string;
  aiCorrection?: AiOmrCorrectionResult;
}

export type AiOmrCorrectionOperation =
  | "set-key-signature"
  | "set-tempo"
  | "set-metadata"
  | "flag-measure-rhythm"
  | "flag-notation"
  | "no-change";

export interface AiOmrCorrectionProposal {
  id: string;
  category: "critical-semantic" | "playback" | "notation" | "expression" | "metadata";
  operation: AiOmrCorrectionOperation;
  measure?: number;
  confidence: number;
  summary: string;
  evidence: string;
  patch?: {
    fifths?: number;
    mode?: "major" | "minor";
    bpm?: number;
    metadataField?: "title" | "subtitle" | "composer" | "arranger";
    value?: string;
  };
  requiresHumanReview: true;
}

export interface AiOmrCorrectionResult {
  status: "completed" | "disabled" | "unavailable" | "failed";
  model?: string;
  proposals: AiOmrCorrectionProposal[];
  summary?: string;
  error?: string;
}
