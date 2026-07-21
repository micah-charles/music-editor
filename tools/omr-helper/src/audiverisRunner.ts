import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir } from "./safeFiles.js";

export interface AudiverisRunResult {
  outputFile: string;
  logs: string;
  warnings: string[];
}

interface AudiverisArgOptions {
  finalProcessingSwitches?: Record<string, string>;
}

const PROCESSING_SWITCH_PREFIX = "org.audiveris.omr.sheet.ProcessingSwitches.";
const OCR_LANGUAGE_CONSTANT = "org.audiveris.omr.text.Language.defaultSpecification";
const DEFAULT_PROCESSING_SWITCHES = new Map<string, string>([
  ["fingerings", "true"],
  ["smallHeads", "true"]
]);

export async function runAudiveris(inputFile: string, outputDir: string): Promise<AudiverisRunResult> {
  const audiverisBin = process.env.AUDIVERIS_BIN;
  if (!audiverisBin) {
    throw new Error("AUDIVERIS_BIN is not set. Add it to .env.local or the shell environment.");
  }

  await ensureDir(outputDir);
  const warnings: string[] = [];
  const preparedInput = await prepareInputForAudiveris(inputFile, outputDir, warnings);
  const args = buildAudiverisArgs(preparedInput, outputDir, process.env);
  const startedAt = Date.now();
  const initial = await runCommand(audiverisBin, args, path.dirname(audiverisBin));
  let completed = initial;
  let resultDir = outputDir;

  if (initial.code !== 0 && shouldRetryWithoutSmallHeads(initial.logs, args)) {
    const retryDir = path.join(outputDir, "retry-no-small-heads");
    await ensureDir(retryDir);
    const retryArgs = buildAudiverisArgs(preparedInput, retryDir, process.env, {
      finalProcessingSwitches: { smallHeads: "false" }
    });
    const retry = await runCommand(audiverisBin, retryArgs, path.dirname(audiverisBin));
    completed = {
      code: retry.code,
      logs: [
        "===== Initial Audiveris attempt (small-head recognition enabled) =====",
        initial.logs,
        "===== Automatic Audiveris retry (small-head recognition disabled) =====",
        retry.logs
      ].join("\n")
    };
    resultDir = retryDir;
    if (retry.code === 0) {
      warnings.push(
        "Audiveris crashed at STEMS while processing small noteheads. The helper automatically retried with small-head recognition disabled and recovered the complete score. Cue-sized notes may be missing; review them against the scan."
      );
    }
  }

  if (completed.code !== 0) {
    throw new Error(`Audiveris failed with exit code ${completed.code}.\n${boundedFailureLogs(completed.logs)}`);
  }

  const outputFile = await findMusicXmlFile(resultDir);
  if (!outputFile) {
    throw new Error(`Audiveris finished but no MusicXML/MXL/XML output was found in ${resultDir}.\n${boundedFailureLogs(completed.logs)}`);
  }

  warnings.push("Audiveris OMR output is a draft transcription. Human review is required.");
  warnings.push(...analyzeAudiverisLogs(completed.logs));
  if (Date.now() - startedAt > 120_000) {
    warnings.push("OMR conversion took more than 120 seconds.");
  }
  return { outputFile, logs: completed.logs, warnings };
}

export function buildAudiverisArgs(
  preparedInput: string,
  outputDir: string,
  env: NodeJS.ProcessEnv = process.env,
  options: AudiverisArgOptions = {}
): string[] {
  return [
    "-batch",
    "-transcribe",
    "-export",
    "-constant",
    `${OCR_LANGUAGE_CONSTANT}=${env.AUDIVERIS_OCR_LANGUAGES?.trim() || "eng+jpn"}`,
    ...buildProcessingSwitchArgs(env),
    ...parseExtraArgs(env.AUDIVERIS_EXTRA_ARGS),
    ...Object.entries(options.finalProcessingSwitches ?? {}).flatMap(([name, value]) => [
      "-constant",
      `${PROCESSING_SWITCH_PREFIX}${name}=${value}`
    ]),
    "-output",
    outputDir,
    "--",
    preparedInput
  ];
}

export function buildProcessingSwitchArgs(env: NodeJS.ProcessEnv = process.env): string[] {
  const switches = defaultSwitchesEnabled(env) ? new Map(DEFAULT_PROCESSING_SWITCHES) : new Map<string, string>();
  const configured = env.AUDIVERIS_PROCESSING_SWITCHES?.trim();

  if (configured) {
    configured.split(/[,\s]+/).forEach((entry) => {
      if (!entry) {
        return;
      }
      const [rawName, rawValue = "true"] = entry.split("=");
      const name = rawName.trim();
      const value = rawValue.trim();
      if (!name || !value) {
        return;
      }
      switches.set(name.startsWith(PROCESSING_SWITCH_PREFIX) ? name.slice(PROCESSING_SWITCH_PREFIX.length) : name, value);
    });
  }

  return [...switches.entries()].flatMap(([name, value]) => [
    "-constant",
    `${PROCESSING_SWITCH_PREFIX}${name}=${value}`
  ]);
}

export function analyzeAudiverisLogs(logs: string): string[] {
  const warnings: string[] = [];
  const rhythmIssues = [...logs.matchAll(/S\d+\s+MeasureStack#(\d+)\s+no correct rhythm/g)]
    .map((match) => match[1]);
  const uniqueRhythmIssues = [...new Set(rhythmIssues)];

  if (uniqueRhythmIssues.length > 0) {
    warnings.push(
      `Audiveris reported ${uniqueRhythmIssues.length} rhythm issue(s) in measure stack(s) ${uniqueRhythmIssues.join(", ")}. Review these OMR bars against the scan.`
    );
  }

  if (/CUE_BEAMS is skipped because small heads switch is off/.test(logs)) {
    warnings.push("Audiveris skipped cue-beam detection because small-head recognition is disabled.");
  }

  if (/No installed OCR languages|collection of supported languages is empty|Missing support for ['\"]eng['\"] language/i.test(logs)) {
    warnings.push("Audiveris has no English OCR language installed. Title, composer, lyrics, tempo text, and other words may be missing.");
  }

  return warnings;
}

export function shouldRetryWithoutSmallHeads(logs: string, args: string[]): boolean {
  return effectiveProcessingSwitch(args, "smallHeads") === "true"
    && /StepMonitoring[^\n]*\|\s*STEMS\s*\r?\n[^\n]*Error processing stub/.test(logs);
}

function defaultSwitchesEnabled(env: NodeJS.ProcessEnv): boolean {
  return !["1", "true", "yes"].includes(String(env.AUDIVERIS_DISABLE_DEFAULT_SWITCHES ?? "").toLowerCase());
}

function parseExtraArgs(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  return value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((arg) => arg.replace(/^["']|["']$/g, "")) ?? [];
}

function effectiveProcessingSwitch(args: string[], name: string): string | undefined {
  const prefix = `${PROCESSING_SWITCH_PREFIX}${name}=`;
  let value: string | undefined;
  for (const arg of args) {
    if (arg.startsWith(prefix)) value = arg.slice(prefix.length);
  }
  return value;
}

function boundedFailureLogs(logs: string): string {
  if (logs.length <= 14_000) return logs;
  return `${logs.slice(0, 2_000)}\n... ${logs.length - 14_000} log characters omitted ...\n${logs.slice(-12_000)}`;
}

async function prepareInputForAudiveris(inputFile: string, outputDir: string, warnings: string[]): Promise<string> {
  const ext = path.extname(inputFile).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".tif", ".tiff"].includes(ext)) {
    return inputFile;
  }

  try {
    const { code, logs } = await runTool("/usr/bin/sips", ["-g", "pixelWidth", "-g", "pixelHeight", inputFile], path.dirname(inputFile));
    if (code !== 0) {
      warnings.push("Could not inspect image resolution with sips; using original scan.");
      return inputFile;
    }
    const width = Number(logs.match(/pixelWidth:\s*(\d+)/)?.[1] ?? 0);
    const height = Number(logs.match(/pixelHeight:\s*(\d+)/)?.[1] ?? 0);
    if (width >= 3000 && height >= 2200) {
      return inputFile;
    }

    const prepared = path.join(outputDir, `${path.basename(inputFile, ext)}-audiveris-300dpi.png`);
    const targetWidth = Math.max(4500, width * 2);
    const resize = await runTool("/usr/bin/sips", [
      "--resampleWidth",
      String(targetWidth),
      "--setProperty",
      "dpiWidth",
      "300",
      "--setProperty",
      "dpiHeight",
      "300",
      inputFile,
      "--out",
      prepared
    ], path.dirname(inputFile));
    if (resize.code !== 0) {
      warnings.push("Could not upscale low-resolution scan with sips; using original scan.");
      return inputFile;
    }
    warnings.push(`Input scan was ${width}x${height}px; helper upscaled it to ${targetWidth}px wide at 300 DPI for Audiveris.`);
    return prepared;
  } catch (error) {
    warnings.push(`Image preflight failed; using original scan. ${error instanceof Error ? error.message : String(error)}`);
    return inputFile;
  }
}

async function runCommand(command: string, args: string[], cwd: string): Promise<{ code: number | null; logs: string }> {
  const javaHome = process.env.AUDIVERIS_JAVA_HOME || process.env.JAVA_HOME || "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home";
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        JAVA_HOME: javaHome,
        PATH: `${path.join(javaHome, "bin")}:/opt/homebrew/opt/openjdk/bin:${process.env.PATH ?? ""}`
      }
    });
    let logs = "";
    child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
    child.stderr.on("data", (chunk) => { logs += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, logs }));
  });
}

async function runTool(command: string, args: string[], cwd: string): Promise<{ code: number | null; logs: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env });
    let logs = "";
    child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
    child.stderr.on("data", (chunk) => { logs += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, logs }));
  });
}

async function findMusicXmlFile(outputDir: string): Promise<string | null> {
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  const candidates: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(outputDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findMusicXmlFile(fullPath);
      if (nested) {
        candidates.push(nested);
      }
    } else if (isMusicXmlOutput(entry.name)) {
      candidates.push(fullPath);
    }
  }
  candidates.sort((a, b) => scoreOutputName(a) - scoreOutputName(b) || a.length - b.length);
  return candidates[0] || null;
}

function isMusicXmlOutput(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith(".musicxml") || lower.endsWith(".xml") || lower.endsWith(".mxl");
}

function scoreOutputName(filename: string): number {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".musicxml")) return 0;
  if (lower.endsWith(".xml")) return 1;
  if (lower.endsWith(".mxl")) return 2;
  return 3;
}
