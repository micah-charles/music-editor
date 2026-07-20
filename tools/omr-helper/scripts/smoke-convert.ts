import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAudiveris } from "../src/audiverisRunner.js";
import { readMusicXmlAsText } from "../src/musicxmlNormalizer.js";
import { assertAllowedInput, ensureDir, getWorkspaceRoot } from "../src/safeFiles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../..", ".env.local") });
dotenv.config();

const inputFile = process.argv[2];
if (!inputFile) {
  console.error("Usage: npm run smoke -- /path/to/scan.png");
  process.exit(2);
}

assertAllowedInput(inputFile);
const outputDir = path.join(getWorkspaceRoot(), "smoke-output");
await ensureDir(outputDir);
await fs.rm(outputDir, { recursive: true, force: true });
await ensureDir(outputDir);

const result = await runAudiveris(inputFile, outputDir);
const musicXml = await readMusicXmlAsText(result.outputFile);
if (!musicXml.xml.includes("<score-partwise") && !musicXml.xml.includes("<score-timewise")) {
  throw new Error(`Smoke conversion produced non-MusicXML output: ${result.outputFile}`);
}

console.log(JSON.stringify({
  ok: true,
  inputFile,
  outputFile: result.outputFile,
  bytes: musicXml.xml.length,
  warnings: [...result.warnings, ...musicXml.warnings],
  logsTail: result.logs.slice(-1000)
}, null, 2));
