import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir } from "./safeFiles.js";

export interface AudiverisRunResult {
  outputFile: string;
  logs: string;
  warnings: string[];
}

const PROCESSING_SWITCH_PREFIX = "org.audiveris.omr.sheet.ProcessingSwitches.";
const DEFAULT_PROCESSING_SWITCHES = new Map<string, string>([
  ["fingerings", "true"]
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
  const { code, logs } = await runCommand(audiverisBin, args, path.dirname(audiverisBin));

  if (code !== 0) {
    throw new Error(`Audiveris failed with exit code ${code}.\n${logs}`);
  }

  const outputFile = await findMusicXmlFile(outputDir);
  if (!outputFile) {
    throw new Error(`Audiveris finished but no MusicXML/MXL/XML output was found in ${outputDir}.\n${logs}`);
  }

  warnings.push("Audiveris OMR output is a draft transcription. Human review is required.");
  warnings.push(...analyzeAudiverisLogs(logs));
  if (Date.now() - startedAt > 120_000) {
    warnings.push("OMR conversion took more than 120 seconds.");
  }
  return { outputFile, logs, warnings };
}

export function buildAudiverisArgs(
  preparedInput: string,
  outputDir: string,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  return [
    "-batch",
    "-transcribe",
    "-export",
    ...buildProcessingSwitchArgs(env),
    ...parseExtraArgs(env.AUDIVERIS_EXTRA_ARGS),
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

  return warnings;
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
