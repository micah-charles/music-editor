import { readFileSync } from "node:fs";
import {
  astToPlaybackEvents,
  countNotes,
  musicXmlToAst,
  validateScore,
  validateScoreMeasures
} from "../../packages/music-core/src/index";

const musicXmlPath = process.argv[2] ?? "/Users/charlestan/Downloads/mozart_k381_page21_scan_musicxml_bundle/mozart_k381_page21_scan_draft.musicxml";
const score = musicXmlToAst(readFileSync(musicXmlPath, "utf8"));
const validation = validateScore(score);
const measureIssues = validateScoreMeasures(score);
const playbackEvents = astToPlaybackEvents(score).filter((event) => !event.isRest);
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
    clef: part.clef,
    channel: part.channel,
    instrument: part.instrument,
    measures: part.measures.length,
    events: part.measures.reduce((sum, measure) => sum + measure.events.length, 0)
  })),
  notes: countNotes(score.parts.flatMap((part) => part.measures)),
  playbackEvents: playbackEvents.length,
  firstPlaybackEvents: playbackEvents.slice(0, 12).map((event) => ({
    partId: event.partId,
    pitch: event.pitch,
    startBeat: event.startBeat,
    durationBeats: event.durationBeats,
    midiProgram: event.midiProgram,
    midiBank: event.midiBank
  })),
  validationValid: validation.valid,
  validationErrors: validation.errors.length,
  validationWarnings: validation.warnings.length,
  measureIssues: measureIssues.length,
  statuses,
  firstErrors: validation.errors.slice(0, 20),
  firstWarnings: validation.warnings.slice(0, 20)
}, null, 2));
