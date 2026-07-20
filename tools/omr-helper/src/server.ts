import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { nanoid } from "nanoid";
import { runAudiveris } from "./audiverisRunner.js";
import { readMusicXmlAsText } from "./musicxmlNormalizer.js";
import { assertAllowedInput, ensureDir, getWorkspaceRoot, sanitizeFilename } from "./safeFiles.js";
import type { OmrConversionResult } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env.local") });
dotenv.config();

const port = Number(process.env.OMR_HELPER_PORT || 8787);
const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.use(cors({
  origin: [
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
    "http://127.0.0.1:5176",
    "http://127.0.0.1:5177",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5176",
    "http://localhost:5177"
  ]
}));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    audiverisConfigured: Boolean(process.env.AUDIVERIS_BIN),
    audiverisBin: process.env.AUDIVERIS_BIN || null,
    mockConfigured: Boolean(process.env.OMR_HELPER_MOCK_MUSICXML),
    port
  });
});

app.post("/convert", upload.single("score"), async (req, res) => {
  const startedAt = Date.now();
  const warnings: string[] = [];
  const jobId = nanoid(10);
  try {
    if (!req.file) {
      res.status(400).json({ ok: false, jobId, error: "Missing score file.", warnings, logs: "", elapsedMs: Date.now() - startedAt });
      return;
    }

    assertAllowedInput(req.file.originalname);
    const root = getWorkspaceRoot();
    const jobDir = path.join(root, jobId);
    const inputDir = path.join(jobDir, "input");
    const outputDir = path.join(jobDir, "output");
    await ensureDir(inputDir);
    await ensureDir(outputDir);

    const inputFile = path.join(inputDir, sanitizeFilename(req.file.originalname));
    await fs.writeFile(inputFile, req.file.buffer);

    const converted = process.env.OMR_HELPER_MOCK_MUSICXML
      ? await readMockMusicXml(process.env.OMR_HELPER_MOCK_MUSICXML)
      : await readAudiverisMusicXml(inputFile, outputDir);

    warnings.push(...converted.warnings);
    const payload: OmrConversionResult = {
      ok: true,
      jobId,
      originalFilename: req.file.originalname,
      outputFilename: converted.outputFilename,
      musicXml: converted.musicXml,
      warnings,
      logs: converted.logs.slice(-12000),
      elapsedMs: Date.now() - startedAt
    };
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      ok: false,
      jobId,
      originalFilename: req.file?.originalname || "unknown",
      error: message,
      warnings,
      logs: "",
      elapsedMs: Date.now() - startedAt
    } satisfies OmrConversionResult);
  }
});

app.listen(port, "127.0.0.1", () => {
  console.log(`FoxChild OMR helper listening on http://127.0.0.1:${port}`);
});

async function readAudiverisMusicXml(inputFile: string, outputDir: string): Promise<{ outputFilename: string; musicXml: string; warnings: string[]; logs: string }> {
  const audiveris = await runAudiveris(inputFile, outputDir);
  const musicXml = await readMusicXmlAsText(audiveris.outputFile);
  return {
    outputFilename: path.basename(audiveris.outputFile),
    musicXml: musicXml.xml,
    warnings: [...audiveris.warnings, ...musicXml.warnings],
    logs: audiveris.logs
  };
}

async function readMockMusicXml(mockPath: string): Promise<{ outputFilename: string; musicXml: string; warnings: string[]; logs: string }> {
  const musicXml = await readMusicXmlAsText(mockPath);
  return {
    outputFilename: path.basename(mockPath),
    musicXml: musicXml.xml,
    warnings: [
      "OMR helper mock mode is active. This verifies the UI path, not optical recognition.",
      ...musicXml.warnings
    ],
    logs: `Mock MusicXML returned from ${mockPath}`
  };
}
