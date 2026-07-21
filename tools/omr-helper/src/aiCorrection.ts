import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { AiOmrCorrectionProposal, AiOmrCorrectionResult } from "./types.js";

const MAX_XML_CHARS = 90_000;
const DEFAULT_TIMEOUT_MS = 180_000;

export interface AiCorrectionInput {
  requested: boolean;
  sourcePath: string;
  filename: string;
  musicXml: string;
  warnings: string[];
  jobDir: string;
}

export interface CodexRunRequest {
  args: string[];
  cwd: string;
  prompt: string;
  outputPath: string;
  timeoutMs: number;
}

export type CodexRunner = (request: CodexRunRequest) => Promise<void>;

export async function requestAiOmrCorrection(
  input: AiCorrectionInput,
  runCodex: CodexRunner = runLocalCodex
): Promise<AiOmrCorrectionResult> {
  if (!input.requested) {
    return { status: "disabled", proposals: [], summary: "Local Codex review was not requested." };
  }
  if (isAiCorrectionDisabled()) {
    return { status: "disabled", proposals: [], summary: "Local Codex review is disabled by configuration." };
  }

  const model = process.env.CODEX_OMR_MODEL?.trim() || "Codex configured default";
  const evidencePath = path.join(input.jobDir, "omr-evidence.musicxml");
  const schemaPath = path.join(input.jobDir, "omr-correction.schema.json");
  const outputPath = path.join(input.jobDir, "omr-correction.json");
  const warningMeasures = extractWarningMeasures(input.warnings);
  const xmlEvidence = selectMusicXmlEvidence(input.musicXml, new Set([1, 2, 3, 4, 5, 6, ...warningMeasures]));

  try {
    await fs.writeFile(evidencePath, xmlEvidence, "utf8");
    await fs.writeFile(schemaPath, JSON.stringify(correctionSchema, null, 2), "utf8");
    const args = buildCodexArgs(input, schemaPath, outputPath);
    await runCodex({
      args,
      cwd: input.jobDir,
      prompt: buildCodexPrompt(input, evidencePath, warningMeasures),
      outputPath,
      timeoutMs: positiveNumber(process.env.CODEX_OMR_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)
    });
    const parsed = parseCorrectionOutput(await fs.readFile(outputPath, "utf8"));
    return {
      status: "completed",
      model,
      proposals: parsed.proposals,
      summary: parsed.summary
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: isMissingCodexError(message) ? "unavailable" : "failed",
      model,
      proposals: [],
      error: friendlyCodexError(message)
    };
  }
}

export function buildCodexArgs(input: AiCorrectionInput, schemaPath: string, outputPath: string): string[] {
  const args = [
    "exec",
    "--sandbox", "read-only",
    "--ephemeral",
    "--skip-git-repo-check",
    "--color", "never",
    "--output-schema", schemaPath,
    "--output-last-message", outputPath
  ];
  const model = process.env.CODEX_OMR_MODEL?.trim();
  if (model) args.push("--model", model);
  if (isSupportedImage(input.sourcePath)) args.push("--image", input.sourcePath);
  args.push("-");
  return args;
}

export function buildCodexPrompt(input: AiCorrectionInput, evidencePath: string, warningMeasures: number[]): string {
  const sourceInstruction = isSupportedImage(input.sourcePath)
    ? "The original score image is attached to this request."
    : `The original source is available read-only at ${input.sourcePath}. Inspect it when the available tools support this format.`;
  return [
    "Review optical music recognition output against its original score source.",
    sourceInstruction,
    `The selected MusicXML evidence is at ${evidencePath}.`,
    "Do not edit files, run network requests, or change the score. Return only schema-valid advisory JSON.",
    "Every proposal requires human review. Report only discrepancies supported by visible source evidence and the MusicXML.",
    "Never invent a pitch, duration, tuplet, key, tempo, title, dynamic, articulation, slur, or beam.",
    "Use no-change when the recognised value is supported. For uncertain rhythm or notation, use a flag operation instead of fabricating a patch.",
    "For key signatures, count accidentals at the beginning of each staff. For tempo, read the printed metronome mark.",
    `Prioritised measures: ${warningMeasures.join(", ") || "1-6"}.`,
    "Audiveris warnings:",
    input.warnings.length ? input.warnings.map((warning) => `- ${warning}`).join("\n") : "- none"
  ].join("\n\n");
}

export function parseCorrectionOutput(text: string): { summary: string; proposals: AiOmrCorrectionProposal[] } {
  const parsed = JSON.parse(text) as { summary?: unknown; proposals?: unknown };
  if (typeof parsed.summary !== "string" || !Array.isArray(parsed.proposals)) {
    throw new Error("Local Codex correction response did not match the expected schema.");
  }
  return {
    summary: parsed.summary,
    proposals: parsed.proposals.map((proposal, index) => normalizeProposal(proposal, index))
  };
}

export function isAiCorrectionDisabled(): boolean {
  return ["1", "true", "yes"].includes(String(process.env.OMR_AI_CORRECTION_DISABLED ?? "").toLowerCase());
}

async function runLocalCodex(request: CodexRunRequest): Promise<void> {
  const executable = process.env.CODEX_BIN?.trim() || "codex";
  await new Promise<void>((resolve, reject) => {
    const { OPENAI_API_KEY: _unused, ...environment } = process.env;
    const child = spawn(executable, request.args, {
      cwd: request.cwd,
      env: environment,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error(`Local Codex review timed out after ${request.timeoutMs} ms.`));
    }, request.timeoutMs);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve();
    };

    child.stdout.on("data", (chunk) => { stdout = appendBounded(stdout, String(chunk)); });
    child.stderr.on("data", (chunk) => { stderr = appendBounded(stderr, String(chunk)); });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new Error(`Local Codex exited with code ${code}. ${stderr || stdout}`.trim()));
    });
    child.stdin.end(request.prompt);
  });
}

function normalizeProposal(value: unknown, index: number): AiOmrCorrectionProposal {
  const proposal = value as AiOmrCorrectionProposal & { measure?: number | null; patch?: Record<string, unknown> | null };
  const patch = proposal.patch && typeof proposal.patch === "object"
    ? Object.fromEntries(Object.entries(proposal.patch).filter(([, item]) => item !== null && item !== undefined)) as AiOmrCorrectionProposal["patch"]
    : undefined;
  return {
    ...proposal,
    id: proposal.id || `codex-omr-${index + 1}`,
    ...(proposal.measure === null ? { measure: undefined } : {}),
    ...(patch && Object.keys(patch).length ? { patch } : { patch: undefined }),
    confidence: Math.min(1, Math.max(0, Number(proposal.confidence) || 0)),
    requiresHumanReview: true
  };
}

function extractWarningMeasures(warnings: string[]): number[] {
  return [...new Set(warnings.flatMap((warning) => {
    const stackList = warning.match(/measure stack\(s\)\s+([\d, ]+)/i)?.[1];
    if (!stackList) return [];
    return stackList.split(/[, ]+/).map(Number).filter((value) => Number.isInteger(value) && value > 0);
  }))].sort((left, right) => left - right);
}

function selectMusicXmlEvidence(xml: string, measures: Set<number>): string {
  const firstPart = xml.indexOf("<part ");
  const header = firstPart < 0 ? xml : xml.slice(0, firstPart);
  const selected = [...xml.matchAll(/<measure\b[^>]*number="(\d+)"[^>]*>[\s\S]*?<\/measure>/gi)]
    .filter((match) => measures.has(Number(match[1])))
    .map((match) => match[0])
    .join("\n");
  return `${header}\n${selected}`.slice(0, MAX_XML_CHARS);
}

function isSupportedImage(filePath: string): boolean {
  return [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(path.extname(filePath).toLowerCase());
}

function isMissingCodexError(message: string): boolean {
  return /ENOENT|not found|command not found/i.test(message);
}

function friendlyCodexError(message: string): string {
  if (isMissingCodexError(message)) {
    return "The local Codex CLI was not found. Install Codex or set CODEX_BIN to its executable path.";
  }
  if (/not logged in|login required|unauthorized/i.test(message)) {
    return "The local Codex CLI is not logged in. Run codex login, then retry the OMR review.";
  }
  return message.slice(-2_000);
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function appendBounded(current: string, next: string): string {
  return `${current}${next}`.slice(-12_000);
}

export const correctionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "proposals"],
  properties: {
    summary: { type: "string" },
    proposals: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "category", "operation", "measure", "confidence", "summary", "evidence", "patch", "requiresHumanReview"],
        properties: {
          id: { type: "string" },
          category: { enum: ["critical-semantic", "playback", "notation", "expression", "metadata"] },
          operation: { enum: ["set-key-signature", "set-tempo", "set-metadata", "flag-measure-rhythm", "flag-notation", "no-change"] },
          measure: { type: ["integer", "null"], minimum: 1 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          summary: { type: "string" },
          evidence: { type: "string" },
          patch: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["fifths", "mode", "bpm", "metadataField", "value"],
            properties: {
              fifths: { type: ["integer", "null"], minimum: -7, maximum: 7 },
              mode: { enum: ["major", "minor", null] },
              bpm: { type: ["number", "null"], minimum: 20, maximum: 400 },
              metadataField: { enum: ["title", "subtitle", "composer", "arranger", null] },
              value: { type: ["string", "null"] }
            }
          },
          requiresHumanReview: { type: "boolean", const: true }
        }
      }
    }
  }
} as const;
