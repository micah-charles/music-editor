import { readFileSync } from "node:fs";
import {
  countNotes,
  midiToAst,
  validateScore,
  validateScoreMeasures
} from "../../packages/music-core/src/index";

const midiPath = process.argv[2] ?? "/Users/charlestan/Downloads/Bulgarian_Pokemon.mid";
const score = midiToAst(readFileSync(midiPath), {
  title: midiPath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "Imported MIDI"
});
const validation = validateScore(score);
const measureIssues = validateScoreMeasures(score);
const statuses = measureIssues.reduce<Record<string, number>>((acc, issue) => {
  acc[issue.status] = (acc[issue.status] ?? 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({
  title: score.metadata.title,
  key: score.global.key,
  timeSignature: score.global.timeSignature,
  tempo: score.global.tempo.bpm,
  parts: score.parts.map((part) => ({
    id: part.id,
    name: part.name,
    channel: part.channel,
    clef: part.clef,
    measures: part.measures.length,
    events: part.measures.reduce((sum, measure) => sum + measure.events.length, 0)
  })),
  notes: countNotes(score.parts.flatMap((part) => part.measures)),
  validationValid: validation.valid,
  validationErrors: validation.errors.length,
  validationWarnings: validation.warnings.length,
  measureIssues: measureIssues.length,
  statuses,
  firstErrors: validation.errors.slice(0, 30),
  firstMeasureIssues: measureIssues.slice(0, 30)
}, null, 2));
