import fs from "node:fs/promises";
import path from "node:path";

const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".tif", ".tiff", ".pdf"]);

export function assertAllowedInput(filename: string): void {
  const ext = path.extname(filename).toLowerCase();
  if (!allowedExtensions.has(ext)) {
    throw new Error(`Unsupported OMR input file type: ${ext || "(none)"}. Use PNG, JPG, TIFF, or PDF.`);
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export function getWorkspaceRoot(): string {
  return process.env.OMR_WORK_DIR || path.resolve(process.cwd(), ".omr-work");
}

export function sanitizeFilename(filename: string): string {
  const cleaned = filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+/, "");
  return cleaned || "score-image.png";
}
