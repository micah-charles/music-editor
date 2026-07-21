import { compileScoreTimeline, type FoxChildMusicScore, type Step } from "../packages/music-core/src/index";

const measureCount = 2_500;
const iterations = 20;
const steps: Step[] = ["C", "D", "E", "F"];
const measures = Array.from({ length: measureCount }, (_, measureIndex) => ({
  number: measureIndex + 1,
  events: steps.map((step, eventIndex) => ({
    id: `n-${measureIndex}-${eventIndex}`,
    type: "note" as const,
    pitch: { step, octave: 4, alter: 0 },
    duration: { value: "quarter" as const, beats: 1 }
  }))
}));
const score: FoxChildMusicScore = {
  schemaVersion: "2.0",
  type: "FoxChildMusicScore",
  id: "timeline-benchmark",
  metadata: { title: "Timeline benchmark" },
  global: {
    key: { tonic: "C", mode: "major" },
    timeSignature: { beats: 4, beatType: 4 },
    tempo: { bpm: 120 }
  },
  parts: [{
    id: "part-1",
    name: "Piano",
    instrument: { name: "Piano", midiProgram: 1 },
    clef: "treble",
    measures
  }]
};

for (let index = 0; index < 3; index += 1) {
  compileScoreTimeline(score);
}

const samples: number[] = [];
for (let index = 0; index < iterations; index += 1) {
  const startedAt = performance.now();
  const timeline = compileScoreTimeline(score);
  samples.push(performance.now() - startedAt);
  if (timeline.events.length !== measureCount * steps.length) {
    throw new Error(`Unexpected event count: ${timeline.events.length}`);
  }
}

samples.sort((left, right) => left - right);
console.log(JSON.stringify({
  measures: measureCount,
  events: measureCount * steps.length,
  iterations,
  medianMs: round(samples[Math.floor(iterations / 2)]),
  p95Ms: round(samples[Math.ceil(iterations * 0.95) - 1]),
  minMs: round(samples[0]),
  maxMs: round(samples[samples.length - 1])
}, null, 2));

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
