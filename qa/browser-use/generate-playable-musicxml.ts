import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { astToMusicXml, musicXmlToAst, validateScore } from "../../packages/music-core/src/index";

const sourcePath = process.argv[2] ?? "/Users/charlestan/Downloads/mozart_k381_page21_scan_musicxml_bundle/mozart_k381_page21_scan_draft.musicxml";
const outputPath = process.argv[3] ?? "/Volumes/ExtremePro/AIWorkspace/music-editor/qa/musicxml/mozart_k381_page21_scan_playable.musicxml";
const score = musicXmlToAst(readFileSync(sourcePath, "utf8"));
const validation = validateScore(score);

if (!validation.valid) {
  throw new Error(`Source did not import cleanly: ${validation.errors.join("; ")}`);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, astToMusicXml({
  ...score,
  metadata: {
    ...score.metadata,
    title: `${score.metadata.title} - Playable FoxChild Draft`,
    notes: [
      score.metadata.notes,
      "Generated from the provided page-21 scan draft and normalized through FoxChild Music Score Lab.",
      "This is a playable import draft, not a scholarly verified Mozart engraving."
    ].filter(Boolean).join(" ")
  }
}), "utf8");

console.log(outputPath);
