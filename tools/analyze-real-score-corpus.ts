import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  astToMusicXml,
  compileScoreTimeline,
  musicXmlToAst,
  validateScore,
  validateScoreMeasures
} from "../packages/music-core/src/index";
import { syntheticRealScoreFixtures, type RealScoreFixture } from "../qa/regression/realScoreFixtures";

const fixtures: RealScoreFixture[] = [
  ...syntheticRealScoreFixtures,
  fileFixture("audiveris-source-draft", "Audiveris source draft", "qa/musicxml/mozart_k381_page21_scan_draft.source.musicxml"),
  fileFixture("audiveris-playable-repair", "Audiveris playable repair", "qa/musicxml/mozart_k381_page21_scan_playable.musicxml"),
  fileFixture("audiveris-raw-output", "Audiveris raw helper output", "tools/omr-helper/.omr-work/hDOJTlk-n1/output/score.xml")
];

const results = fixtures.map((fixture) => {
  const importStart = performance.now();
  const score = musicXmlToAst(fixture.xml);
  const importMs = performance.now() - importStart;
  const compileStart = performance.now();
  const timeline = compileScoreTimeline(score);
  const compileMs = performance.now() - compileStart;
  const exportStart = performance.now();
  const reimported = musicXmlToAst(astToMusicXml(score));
  const roundTripMs = performance.now() - exportStart;
  const schema = validateScore(score);
  const measureResults = validateScoreMeasures(score);
  return {
    id: fixture.id,
    category: fixture.category,
    parts: score.parts.length,
    measures: Math.max(...score.parts.map((part) => part.measures.length)),
    events: timeline.events.length,
    repeats: timeline.repeatExpansion?.passes.length ?? 0,
    schemaErrors: schema.errors.length,
    schemaWarnings: schema.warnings.length,
    fidelityWarnings: score.sourceMetadata?.warnings ?? [],
    underfilled: measureResults.filter((measure) => measure.status === "underfilled").length,
    overfilled: measureResults.filter((measure) => measure.status === "overfilled").length,
    roundTripParts: reimported.parts.length,
    partLanes: partLanes(score),
    roundTripPartLanes: partLanes(reimported),
    importMs: round(importMs),
    compileMs: round(compileMs),
    roundTripMs: round(roundTripMs),
    timelineWarnings: timeline.warnings
  };
});

console.log(JSON.stringify(results, null, 2));

function fileFixture(id: string, category: string, path: string): RealScoreFixture {
  return { id, category, xml: readFileSync(path, "utf8") };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function partLanes(score: ReturnType<typeof musicXmlToAst>) {
  return score.parts.map((part) => {
    const events = part.measures.flatMap((measure) => measure.events);
    return {
      name: part.name,
      clef: part.clef,
      events: events.length,
      staffs: [...new Set(events.map((event) => event.staff ?? 1))],
      voices: [...new Set(events.map((event) => event.voice ?? 1))]
    };
  });
}
