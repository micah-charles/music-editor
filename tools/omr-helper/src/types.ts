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
}
