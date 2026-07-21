export interface OmrClientResult {
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

const DEFAULT_OMR_HELPER_URL = "http://127.0.0.1:8787";

export async function convertScoreImageToMusicXml(file: File, options: { aiReview?: boolean } = {}): Promise<OmrClientResult> {
  const helperUrl = String(import.meta.env.VITE_OMR_HELPER_URL || DEFAULT_OMR_HELPER_URL).replace(/\/$/, "");
  const form = new FormData();
  form.append("score", file);
  form.append("aiReview", String(options.aiReview ?? false));

  try {
    const response = await fetch(`${helperUrl}/convert`, {
      method: "POST",
      body: form
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        jobId: payload?.jobId || "unknown",
        originalFilename: file.name,
        warnings: payload?.warnings || [],
        logs: payload?.logs || "",
        elapsedMs: payload?.elapsedMs || 0,
        error: payload?.error || `OMR helper failed with HTTP ${response.status}.`
      };
    }
    return payload as OmrClientResult;
  } catch (error) {
    return {
      ok: false,
      jobId: "unavailable",
      originalFilename: file.name,
      warnings: [],
      logs: "",
      elapsedMs: 0,
      error: `Local OMR helper is not running or cannot be reached at ${helperUrl}. Start it with npm run omr:helper. ${errorMessage(error)}`
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
