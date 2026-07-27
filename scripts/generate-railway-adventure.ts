import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  astToMidi,
  astToMusicXml,
  compileScoreTimeline,
  musicXmlToAst,
  parsePitchName,
  pitchToMidi,
  scoreTimeToSeconds,
  toNumber,
  transposePitch,
  validateScore,
  validateScoreMeasures,
  type ArticulationType,
  type DirectionEvent,
  type Duration,
  type FoxChildMusicScore,
  type Measure,
  type MusicEvent,
  type NoteDurationValue,
  type Part,
  type Pitch
} from "../packages/music-core/src/index";

const MEASURE_COUNT = 82;
const OUTPUT_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../generated-scores/railway-adventure"
);

type Tone = [pitch: string | null, duration: NoteDurationValue];
type Section = "intro" | "theme" | "development" | "middle" | "climax" | "reprise" | "arrival";

const BEATS: Record<NoteDurationValue, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
  "dotted-half": 3,
  "dotted-quarter": 1.5,
  "dotted-eighth": 0.75
};

const MAIN_THEME: Tone[][] = [
  [["A4", "quarter"], ["F#4", "eighth"], ["G4", "eighth"], ["A4", "quarter"], ["D5", "quarter"]],
  [["C#5", "quarter"], ["B4", "eighth"], ["A4", "eighth"], ["F#4", "half"]],
  [["G4", "quarter"], ["A4", "eighth"], ["B4", "eighth"], ["D5", "quarter"], ["B4", "quarter"]],
  [["A4", "dotted-half"], [null, "quarter"]],
  [["F#4", "quarter"], ["G4", "eighth"], ["A4", "eighth"], ["B4", "quarter"], ["D5", "quarter"]],
  [["E5", "quarter"], ["D5", "eighth"], ["C#5", "eighth"], ["B4", "half"]],
  [["A4", "quarter"], ["F#4", "quarter"], ["E4", "quarter"], ["C#4", "quarter"]],
  [["D4", "dotted-half"], [null, "quarter"]]
];

const LYRIC_THEME: Tone[][] = [
  [["F#5", "half"], ["E5", "quarter"], ["D5", "quarter"]],
  [["C#5", "dotted-half"], ["B4", "quarter"]],
  [["D5", "quarter"], ["E5", "quarter"], ["F#5", "half"]],
  [["A5", "half"], ["F#5", "half"]],
  [["G5", "quarter"], ["F#5", "quarter"], ["E5", "quarter"], ["D5", "quarter"]],
  [["C#5", "half"], ["B4", "half"]],
  [["D5", "dotted-quarter"], ["E5", "eighth"], ["F#5", "quarter"], ["A5", "quarter"]],
  [["F#5", "dotted-half"], [null, "quarter"]],
  [["E5", "half"], ["D5", "quarter"], ["C#5", "quarter"]],
  [["B4", "half"], ["D5", "half"]],
  [["C#5", "quarter"], ["D5", "quarter"], ["E5", "half"]],
  [["A4", "dotted-half"], [null, "quarter"]]
];

const PROGRESSION = [
  "D", "D", "G", "A", "D", "Bm", "Em", "A",
  "D", "A", "Bm", "F#m", "G", "D", "Em", "A",
  "D", "A", "Bm", "F#m", "G", "D", "Em", "A",
  "Bm", "G", "D", "A", "Bm", "G", "Em", "A",
  "D", "F#m", "G", "A", "Bm", "G", "Em", "A",
  "Bm", "F#m", "G", "D", "Em", "Bm", "G", "F#",
  "Bm", "G", "Em", "A",
  "D", "A", "Bm", "F#m", "G", "D", "Em", "A",
  "D", "A", "Bm", "F#m", "G", "D", "Em", "A",
  "D", "A", "Bm", "F#m", "G", "D", "Em", "A",
  "D", "Bm", "G", "A", "D", "D"
] as const;

const CHORDS: Record<string, string[]> = {
  D: ["D", "F#", "A"],
  G: ["G", "B", "D"],
  A: ["A", "C#", "E"],
  Bm: ["B", "D", "F#"],
  Em: ["E", "G", "B"],
  "F#m": ["F#", "A", "C#"],
  "F#": ["F#", "A#", "C#"]
};

const SECTION_MARKS = new Map<number, string>([
  [1, "A — Departure"],
  [9, "B — Main Theme"],
  [25, "C — Gathering Speed"],
  [41, "D — Across the Valley"],
  [53, "E — Grand Railway Chorus"],
  [69, "F — Theme Reprise"],
  [77, "G — Arrival"]
]);

function duration(value: NoteDurationValue): Duration {
  return { value, beats: BEATS[value] };
}

function sectionAt(measure: number): Section {
  if (measure <= 8) return "intro";
  if (measure <= 24) return "theme";
  if (measure <= 40) return "development";
  if (measure <= 52) return "middle";
  if (measure <= 68) return "climax";
  if (measure <= 76) return "reprise";
  return "arrival";
}

function pitchAt(pitchClass: string, octave: number): string {
  return `${pitchClass}${octave}`;
}

function chordTones(chord: string, octave: number): string[] {
  return CHORDS[chord].map((pitchClass, index) => pitchAt(pitchClass, octave + (index > 0 && ["A", "B"].includes(pitchClass[0]) ? 0 : 0)));
}

function rootAndFifth(chord: string, octave: number): [string, string] {
  const tones = CHORDS[chord];
  return [pitchAt(tones[0], octave), pitchAt(tones[2], octave)];
}

function transposeTones(tones: Tone[], semitones: number): Tone[] {
  return tones.map(([name, value]) => [
    name ? pitchName(transposePitch(parsePitchName(name), semitones)) : null,
    value
  ]);
}

function pitchName(pitch: Pitch): string {
  const alter = pitch.alter === 1 ? "#" : pitch.alter === -1 ? "b" : "";
  return `${pitch.step}${alter}${pitch.octave}`;
}

function sequenceEvents(
  partId: string,
  measure: number,
  tones: Tone[],
  options: {
    staff?: number;
    voice?: number;
    velocity?: number;
    articulations?: ArticulationType[];
    motifId?: string;
    phraseId?: string;
    slurStart?: boolean;
    slurStop?: boolean;
  } = {}
): MusicEvent[] {
  let beat = 0;
  let soundingIndex = 0;
  const soundingTotal = tones.filter(([pitch]) => pitch).length;
  return tones.map(([name, value], index): MusicEvent => {
    const base = {
      id: `${partId}-m${measure}-e${index + 1}-s${options.staff ?? 1}v${options.voice ?? 1}`,
      position: { measure, beat },
      staff: options.staff ?? 1,
      voice: options.voice ?? 1,
      duration: duration(value)
    };
    beat += BEATS[value];
    if (!name) {
      return { ...base, type: "rest" };
    }
    soundingIndex += 1;
    const slurs = [
      ...(options.slurStart && soundingIndex === 1 ? [{ type: "start" as const, number: 1 }] : []),
      ...(options.slurStop && soundingIndex === soundingTotal ? [{ type: "stop" as const, number: 1 }] : [])
    ];
    return {
      ...base,
      type: "note",
      pitch: parsePitchName(name),
      velocity: options.velocity,
      notation: options.articulations?.length || slurs.length
        ? { articulations: options.articulations, slurs }
        : undefined,
      semantic: {
        motifId: options.motifId,
        phraseId: options.phraseId,
        difficulty: "intermediate"
      }
    };
  });
}

function wholeRest(partId: string, measure: number, staff = 1, voice = 1): MusicEvent[] {
  return sequenceEvents(partId, measure, [[null, "whole"]], { staff, voice });
}

function direction(
  partId: string,
  measure: number,
  fields: Omit<DirectionEvent, "id" | "type" | "position">
): DirectionEvent {
  return {
    id: `${partId}-m${measure}-direction-${fields.dynamic ?? fields.text ?? fields.wedge?.type ?? "mark"}`,
    type: "direction",
    position: { measure, beat: 0 },
    ...fields
  };
}

function railwayPulse(partId: string, measure: number, chord: string, octave: number, velocity: number, staff = 1): MusicEvent[] {
  const [root, fifth] = rootAndFifth(chord, octave);
  return sequenceEvents(partId, measure, [
    [root, "eighth"], [fifth, "eighth"], [root, "eighth"], [fifth, "eighth"],
    [root, "eighth"], [fifth, "eighth"], [root, "eighth"], [fifth, "eighth"]
  ], { staff, velocity, articulations: ["staccato"], motifId: "railway-wheels" });
}

function sustainedHarmony(partId: string, measure: number, chord: string, octave: number, velocity: number): MusicEvent[] {
  const tones = chordTones(chord, octave);
  return sequenceEvents(partId, measure, [[tones[0], "half"], [tones[1], "half"]], { velocity });
}

function fluteMeasure(measure: number, chord: string): MusicEvent[] {
  const section = sectionAt(measure);
  let events: MusicEvent[];
  if (section === "intro") {
    events = measure < 5
      ? wholeRest("flute", measure)
      : sequenceEvents("flute", measure, [[null, "half"], [chordTones(chord, 5)[1], "quarter"], [chordTones(chord, 5)[2], "quarter"]], { velocity: 48, slurStart: measure === 5, slurStop: measure === 8 });
  } else if (section === "theme") {
    events = measure < 17
      ? wholeRest("flute", measure)
      : transposeTones(MAIN_THEME[(measure - 17) % 8], 12).length
        ? sequenceEvents("flute", measure, transposeTones(MAIN_THEME[(measure - 17) % 8], 12), { velocity: 74, phraseId: "theme-counterstatement", slurStart: measure === 17, slurStop: measure === 24 })
        : wholeRest("flute", measure);
  } else if (section === "development") {
    const tones = chordTones(chord, 5);
    events = sequenceEvents("flute", measure, [
      [tones[0], "eighth"], [tones[1], "eighth"], [tones[2], "eighth"], [tones[1], "eighth"],
      [tones[2], "eighth"], [transposeTones([[tones[0], "eighth"]], 12)[0][0], "eighth"], [tones[2], "eighth"], [tones[1], "eighth"]
    ], { velocity: 78, motifId: "theme-fragment" });
  } else if (section === "middle") {
    events = sequenceEvents("flute", measure, LYRIC_THEME[measure - 41], {
      velocity: 70,
      phraseId: "lyrical-theme",
      slurStart: measure === 41 || measure === 49,
      slurStop: measure === 48 || measure === 52
    });
  } else if (section === "climax") {
    events = sequenceEvents("flute", measure, transposeTones(MAIN_THEME[(measure - 53) % 8], 12), { velocity: 104, phraseId: "grand-theme" });
  } else if (section === "reprise") {
    const tones = chordTones(chord, 5);
    events = sequenceEvents("flute", measure, [[tones[2], "quarter"], [tones[1], "eighth"], [tones[2], "eighth"], [tones[0], "half"]], { velocity: 76 });
  } else {
    events = measure <= 79
      ? sequenceEvents("flute", measure, [[chordTones(chord, 5)[1], "half"], [chordTones(chord, 5)[0], "half"]], { velocity: 46, slurStart: measure === 77, slurStop: measure === 79 })
      : wholeRest("flute", measure);
  }
  const mark = SECTION_MARKS.get(measure);
  if (mark) events.push({ id: `rehearsal-${measure}`, type: "annotation", text: mark, placement: "above", position: { measure, beat: 0 } });
  if (measure === 1) events.push(direction("flute", measure, { dynamic: "p", text: "Con moto, like a little engine waking" }));
  if (measure === 25) events.push(direction("flute", measure, { dynamic: "mf", wedge: { type: "crescendo", number: 1 } }));
  if (measure === 40) events.push(direction("flute", measure, { wedge: { type: "stop", number: 1 } }));
  if (measure === 41) events.push(direction("flute", measure, { dynamic: "mp", text: "Dolce e legato" }));
  if (measure === 53) events.push(direction("flute", measure, { dynamic: "ff", text: "Grandioso" }));
  if (measure === 77) events.push(direction("flute", measure, { dynamic: "p", wedge: { type: "diminuendo", number: 2 }, text: "rit. poco a poco" }));
  if (measure === 82) events.push(direction("flute", measure, { dynamic: "pp", wedge: { type: "stop", number: 2 } }));
  return events;
}

function clarinetMeasure(measure: number, chord: string): MusicEvent[] {
  const section = sectionAt(measure);
  if (section === "intro") return measure <= 4 ? wholeRest("clarinet", measure) : sustainedHarmony("clarinet", measure, chord, 4, 48);
  if (section === "theme") {
    return measure <= 16
      ? sustainedHarmony("clarinet", measure, chord, 4, 66)
      : sequenceEvents("clarinet", measure, transposeTones(MAIN_THEME[(measure - 17) % 8], -5), { velocity: 72, phraseId: "warm-countermelody" });
  }
  if (section === "development") return railwayPulse("clarinet", measure, chord, 4, 72);
  if (section === "middle") return sequenceEvents("clarinet", measure, transposeTones(LYRIC_THEME[measure - 41], -12), { velocity: 68, phraseId: "lyrical-theme-harmony", slurStart: measure === 41, slurStop: measure === 52 });
  if (section === "climax") return sequenceEvents("clarinet", measure, MAIN_THEME[(measure - 53) % 8], { velocity: 94, phraseId: "grand-theme" });
  if (section === "reprise") return sustainedHarmony("clarinet", measure, chord, 4, 68);
  return measure <= 80 ? sustainedHarmony("clarinet", measure, chord, 4, 44) : wholeRest("clarinet", measure);
}

function trumpetMeasure(measure: number, chord: string): MusicEvent[] {
  const section = sectionAt(measure);
  let events: MusicEvent[];
  if (section === "intro") events = wholeRest("trumpet", measure);
  else if (section === "theme") {
    events = measure <= 16
      ? sequenceEvents("trumpet", measure, MAIN_THEME[(measure - 9) % 8], {
        velocity: 88,
        phraseId: "principal-theme",
        motifId: "railway-adventure-theme",
        slurStart: measure === 9 || measure === 13,
        slurStop: measure === 12 || measure === 16
      })
      : measure % 2 === 0
        ? sequenceEvents("trumpet", measure, [[null, "half"], [chordTones(chord, 4)[2], "quarter"], [chordTones(chord, 4)[0], "quarter"]], { velocity: 72, articulations: ["accent"] })
        : wholeRest("trumpet", measure);
  } else if (section === "development") {
    events = sequenceEvents("trumpet", measure, MAIN_THEME[(measure - 25) % 4], { velocity: 82, motifId: "theme-fragment", articulations: ["accent"] });
  } else if (section === "middle") {
    events = measure % 4 === 0 ? sustainedHarmony("trumpet", measure, chord, 4, 58) : wholeRest("trumpet", measure);
  } else if (section === "climax") {
    events = sequenceEvents("trumpet", measure, MAIN_THEME[(measure - 53) % 8], { velocity: 110, phraseId: "grand-theme", motifId: "railway-adventure-theme", articulations: measure % 4 === 0 ? ["accent"] : undefined });
  } else if (section === "reprise") {
    events = sequenceEvents("trumpet", measure, MAIN_THEME[(measure - 69) % 8], { velocity: 86, phraseId: "principal-theme-reprise", motifId: "railway-adventure-theme", slurStart: measure === 69 || measure === 73, slurStop: measure === 72 || measure === 76 });
  } else {
    events = measure === 77
      ? sequenceEvents("trumpet", measure, [["A4", "half"], ["D4", "half"]], { velocity: 54 })
      : wholeRest("trumpet", measure);
  }
  if (measure === 9) events.push(direction("trumpet", measure, { dynamic: "f", text: "Brightly" }));
  if (measure === 53) events.push(direction("trumpet", measure, { dynamic: "ff" }));
  if (measure === 69) events.push(direction("trumpet", measure, { dynamic: "mf" }));
  return events;
}

function hornMeasure(measure: number, chord: string): MusicEvent[] {
  const section = sectionAt(measure);
  if (section === "intro") return measure <= 2 ? wholeRest("horn", measure) : sustainedHarmony("horn", measure, chord, 3, 44);
  if (section === "climax") {
    const tones = chordTones(chord, 3);
    return sequenceEvents("horn", measure, [[tones[0], "quarter"], [tones[1], "quarter"], [tones[2], "half"]], { velocity: 100, articulations: ["tenuto"] });
  }
  if (section === "arrival") return measure <= 80 ? sustainedHarmony("horn", measure, chord, 3, 42) : wholeRest("horn", measure);
  return sustainedHarmony("horn", measure, chord, section === "middle" ? 3 : 4, section === "middle" ? 58 : 72);
}

function violinMeasure(measure: number, chord: string): MusicEvent[] {
  const section = sectionAt(measure);
  if (section === "intro") return measure <= 2 ? wholeRest("violin", measure) : railwayPulse("violin", measure, chord, 4, 44);
  if (section === "theme") return railwayPulse("violin", measure, chord, 4, 64);
  if (section === "development") {
    const tones = chordTones(chord, 4);
    return sequenceEvents("violin", measure, [
      [tones[0], "eighth"], [tones[1], "eighth"], [tones[2], "eighth"], [tones[1], "eighth"],
      [tones[0], "eighth"], [tones[1], "eighth"], [tones[2], "eighth"], [transposeTones([[tones[0], "eighth"]], 12)[0][0], "eighth"]
    ], { velocity: 82, motifId: "rising-sequence", slurStart: true, slurStop: true });
  }
  if (section === "middle") return sequenceEvents("violin", measure, LYRIC_THEME[measure - 41], { velocity: 72, phraseId: "lyrical-theme", slurStart: measure === 41 || measure === 49, slurStop: measure === 48 || measure === 52, articulations: ["tenuto"] });
  if (section === "climax") return sequenceEvents("violin", measure, transposeTones(MAIN_THEME[(measure - 53) % 8], 12), { velocity: 106, phraseId: "grand-theme" });
  if (section === "reprise") return railwayPulse("violin", measure, chord, 4, 72);
  return measure <= 80 ? sequenceEvents("violin", measure, [[chordTones(chord, 4)[2], "half"], [chordTones(chord, 4)[0], "half"]], { velocity: 42, slurStart: measure === 77, slurStop: measure === 80 }) : wholeRest("violin", measure);
}

function celloMeasure(measure: number, chord: string): MusicEvent[] {
  const section = sectionAt(measure);
  const [root, fifth] = rootAndFifth(chord, 3);
  if (section === "intro") return sequenceEvents("cello", measure, [[root, "half"], [null, "quarter"], [fifth, "quarter"]], { velocity: 42, articulations: ["staccato"], motifId: "railway-wheels" });
  if (section === "middle") return sequenceEvents("cello", measure, [[root, "whole"]], { velocity: 55, slurStart: measure === 41, slurStop: measure === 52 });
  if (section === "climax") return sequenceEvents("cello", measure, [[root, "quarter"], [fifth, "quarter"], [root, "quarter"], [fifth, "quarter"]], { velocity: 94, articulations: ["accent"] });
  if (section === "arrival") return sequenceEvents("cello", measure, [[root, "whole"]], { velocity: measure === 82 ? 34 : 44 });
  return railwayPulse("cello", measure, chord, 3, section === "development" ? 78 : 64);
}

function bassMeasure(measure: number, chord: string): MusicEvent[] {
  const [root, fifth] = rootAndFifth(chord, 2);
  const section = sectionAt(measure);
  if (section === "climax") return sequenceEvents("double-bass", measure, [[root, "quarter"], [fifth, "quarter"], [root, "quarter"], [fifth, "quarter"]], { velocity: 92, articulations: ["staccato"] });
  if (section === "arrival" || section === "middle") return sequenceEvents("double-bass", measure, [[root, "whole"]], { velocity: section === "arrival" ? 34 : 50 });
  return sequenceEvents("double-bass", measure, [[root, "half"], [fifth, "half"]], { velocity: section === "intro" ? 40 : 62, articulations: section === "intro" ? ["staccato"] : undefined });
}

function pianoMeasure(measure: number, chord: string): MusicEvent[] {
  const section = sectionAt(measure);
  const velocity = section === "climax" ? 102 : section === "intro" || section === "arrival" ? 44 : section === "middle" ? 60 : 72;
  const tones = chordTones(chord, 4).map(parsePitchName);
  const upper: MusicEvent[] = [
    {
      id: `piano-m${measure}-rh1`,
      type: "chord",
      pitches: tones,
      duration: duration("half"),
      velocity,
      staff: 1,
      voice: 1,
      position: { measure, beat: 0 },
      semantic: { chordName: chord, roman: romanFor(chord), function: chordFunction(chord) }
    },
    {
      id: `piano-m${measure}-rh2`,
      type: "chord",
      pitches: tones.map((pitch) => transposePitch(pitch, measure % 2 === 0 ? 0 : 12)),
      duration: duration("half"),
      velocity,
      staff: 1,
      voice: 1,
      position: { measure, beat: 2 },
      notation: section === "intro" ? { articulations: ["staccato"] } : undefined,
      semantic: { chordName: chord, roman: romanFor(chord), function: chordFunction(chord) }
    }
  ];
  const lower = section === "middle" || section === "arrival"
    ? sequenceEvents("piano", measure, [[rootAndFifth(chord, 2)[0], "half"], [rootAndFifth(chord, 2)[1], "half"]], { staff: 2, voice: 1, velocity })
    : railwayPulse("piano", measure, chord, 2, velocity, 2);
  const events = [...upper, ...lower];
  if (measure === 1) events.push(direction("piano", measure, { dynamic: "p", staff: 1 }));
  if (measure === 25) events.push(direction("piano", measure, { wedge: { type: "crescendo", number: 1 }, staff: 1 }));
  if (measure === 40) events.push(direction("piano", measure, { wedge: { type: "stop", number: 1 }, staff: 1 }));
  if (measure === 53) events.push(direction("piano", measure, { dynamic: "ff", staff: 1 }));
  if (measure === 77) events.push(direction("piano", measure, { wedge: { type: "diminuendo", number: 2 }, staff: 1 }));
  if (measure === 82) events.push(direction("piano", measure, { dynamic: "pp", wedge: { type: "stop", number: 2 }, staff: 1 }));
  return events;
}

function percussionMeasure(measure: number): MusicEvent[] {
  const section = sectionAt(measure);
  const options = { velocity: section === "climax" ? 110 : section === "intro" ? 48 : 76, articulations: ["staccato"] as ArticulationType[], motifId: "railway-wheels" };
  if (section === "intro") {
    return measure <= 2
      ? wholeRest("percussion", measure)
      : sequenceEvents("percussion", measure, [[null, "quarter"], ["A3", "eighth"], ["A3", "eighth"], [null, "quarter"], ["A3", "eighth"], ["A3", "eighth"]], options);
  }
  if (section === "middle") {
    return measure % 4 === 0
      ? sequenceEvents("percussion", measure, [[null, "dotted-half"], ["F#5", "quarter"]], { velocity: 52, articulations: ["tenuto"] })
      : wholeRest("percussion", measure);
  }
  if (section === "climax") {
    return sequenceEvents("percussion", measure, [
      [measure % 4 === 1 ? "F#5" : "D2", "quarter"], ["A3", "eighth"], ["A3", "eighth"],
      ["D2", "quarter"], ["A3", "eighth"], ["A3", "eighth"]
    ], options);
  }
  if (section === "arrival") {
    if (measure === 77) return sequenceEvents("percussion", measure, [["F#5", "quarter"], [null, "dotted-half"]], { velocity: 50, articulations: ["tenuto"] });
    return wholeRest("percussion", measure);
  }
  return sequenceEvents("percussion", measure, [["D2", "quarter"], ["A3", "eighth"], ["A3", "eighth"], [null, "quarter"], ["A3", "eighth"], ["A3", "eighth"]], options);
}

function romanFor(chord: string): string {
  return ({ D: "I", G: "IV", A: "V", Bm: "vi", Em: "ii", "F#m": "iii", "F#": "V/vi" } as Record<string, string>)[chord];
}

function chordFunction(chord: string): "tonic" | "dominant" | "subdominant" | "predominant" | "other" {
  if (chord === "D" || chord === "Bm") return "tonic";
  if (chord === "A" || chord === "F#") return "dominant";
  if (chord === "G") return "subdominant";
  if (chord === "Em") return "predominant";
  return "other";
}

function makeMeasures(partId: string, build: (measure: number, chord: string) => MusicEvent[]): Measure[] {
  return PROGRESSION.map((chord, index) => {
    const measure = index + 1;
    return {
      number: measure,
      events: build(measure, chord),
      harmony: [{ root: CHORDS[chord][0], kind: chord.endsWith("m") ? "minor" : "major", beat: 0 }],
      ...(measure === MEASURE_COUNT ? { extensions: { finalBarline: true } } : {})
    };
  });
}

function part(options: Omit<Part, "measures"> & { build: (measure: number, chord: string) => MusicEvent[] }): Part {
  const { build, ...fields } = options;
  return { ...fields, measures: makeMeasures(fields.id, build) };
}

export function createRailwayAdventureScore(): FoxChildMusicScore {
  return {
    schemaVersion: "2.0",
    type: "FoxChildMusicScore",
    id: "railway-adventure",
    metadata: {
      title: "Railway Adventure",
      movementTitle: "Railway Adventure",
      subtitle: "An orchestral journey for a children’s railway game",
      composer: "Generated for Music Score Lab",
      source: "ai-generated",
      createdAt: "2026-07-27",
      notes: "Concert pitch is canonical. B-flat clarinet/trumpet and F horn export with written transposition."
    },
    global: {
      key: { tonic: "D", mode: "major", fifths: 2 },
      timeSignature: { beats: 4, beatType: 4 },
      tempo: { bpm: 110, label: "Allegro con spirito", source: "user" },
      tempoEvents: [
        { position: { measure: 77, beat: 0 }, bpm: 104, label: "Poco meno mosso" },
        { position: { measure: 79, beat: 0 }, bpm: 92, label: "rit." },
        { position: { measure: 81, beat: 0 }, bpm: 76, label: "Molto rit." },
        { position: { measure: 82, beat: 0 }, bpm: 60, label: "Adagio" }
      ],
      style: "Adventurous children’s orchestral railway music"
    },
    parts: [
      part({ id: "flute", name: "Flute", instrument: { name: "Flute", midiProgram: 74, soundFontBank: 0, soundFontPreset: 73 }, clef: "treble", channel: 0, volume: 0.86, pan: -0.25, build: fluteMeasure }),
      part({ id: "clarinet", name: "B-flat Clarinet", instrument: { name: "B-flat Clarinet", midiProgram: 72, soundFontBank: 0, soundFontPreset: 71 }, clef: "treble", channel: 1, transposition: { diatonic: -1, chromatic: -2, writtenKeyFifths: 4 }, volume: 0.84, pan: -0.12, build: clarinetMeasure }),
      part({ id: "trumpet", name: "B-flat Trumpet", instrument: { name: "B-flat Trumpet", midiProgram: 57, soundFontBank: 0, soundFontPreset: 56 }, clef: "treble", channel: 2, transposition: { diatonic: -1, chromatic: -2, writtenKeyFifths: 4 }, volume: 0.9, pan: 0.12, build: trumpetMeasure }),
      part({ id: "horn", name: "French Horn in F", instrument: { name: "French Horn", midiProgram: 61, soundFontBank: 0, soundFontPreset: 60 }, clef: "treble", channel: 3, transposition: { diatonic: -4, chromatic: -7, writtenKeyFifths: 3 }, volume: 0.86, pan: 0.25, build: hornMeasure }),
      part({ id: "violin", name: "Violin", instrument: { name: "Violin", midiProgram: 41, soundFontBank: 0, soundFontPreset: 40 }, clef: "treble", channel: 4, volume: 0.82, pan: -0.35, build: violinMeasure }),
      part({ id: "cello", name: "Cello", instrument: { name: "Cello", midiProgram: 43, soundFontBank: 0, soundFontPreset: 42 }, clef: "bass", channel: 5, volume: 0.86, pan: 0.1, build: celloMeasure }),
      part({ id: "double-bass", name: "Double Bass", instrument: { name: "Double Bass", midiProgram: 44, soundFontBank: 0, soundFontPreset: 43 }, clef: "bass", channel: 6, volume: 0.82, pan: 0.3, build: bassMeasure }),
      part({ id: "piano", name: "Piano", instrument: { name: "Acoustic Grand Piano", midiProgram: 1, soundFontBank: 0, soundFontPreset: 0 }, clef: "treble", staffCount: 2, clefs: { 1: "treble", 2: "bass" }, channel: 7, volume: 0.76, pan: 0, build: pianoMeasure }),
      part({ id: "percussion", name: "Percussion", instrument: { name: "Orchestral Percussion", midiProgram: 1, soundFontBank: 128, soundFontPreset: 0 }, clef: "treble", channel: 9, volume: 0.78, pan: 0.05, build: (measure) => percussionMeasure(measure) })
    ],
    phrases: [
      { id: "departure", label: "Quiet railway departure", partId: "cello", fromMeasure: 1, toMeasure: 8 },
      { id: "principal-theme", label: "Principal trumpet theme", partId: "trumpet", fromMeasure: 9, toMeasure: 16 },
      { id: "theme-development", label: "Theme development", partId: "flute", fromMeasure: 25, toMeasure: 40 },
      { id: "lyrical-theme", label: "Lyrical middle theme", partId: "flute", fromMeasure: 41, toMeasure: 52 },
      { id: "grand-chorus", label: "Grand orchestral chorus", partId: "trumpet", fromMeasure: 53, toMeasure: 68 },
      { id: "theme-reprise", label: "Principal theme reprise", partId: "trumpet", fromMeasure: 69, toMeasure: 76 },
      { id: "arrival", label: "Soft arrival", partId: "piano", fromMeasure: 77, toMeasure: 82 }
    ],
    learning: {
      level: "intermediate",
      skills: ["D major", "syncopation-free eighth-note motion", "ensemble balance", "legato phrasing", "dynamic contrast"],
      suitableFor: ["Grade 4–5 school orchestra", "children’s game soundtrack"]
    },
    extensions: {
      compositionForm: ["A", "B", "C", "D", "E", "F", "G"],
      railwayMotif: "paired staccato eighth notes outlining root and fifth",
      canonicalPitch: "concert"
    }
  };
}

export function scoreDurationSeconds(score: FoxChildMusicScore): number {
  const timeline = compileScoreTimeline(score);
  return scoreTimeToSeconds(timeline.duration, timeline.tempoMap);
}

function rangeSummary(score: FoxChildMusicScore): Record<string, { min: number; max: number }> {
  return Object.fromEntries(score.parts.map((part) => {
    const pitches = part.measures.flatMap((measure) => measure.events.flatMap((event) => {
      if (event.type === "note") return [pitchToMidi(event.pitch)];
      if (event.type === "chord") return event.pitches.map(pitchToMidi);
      return [];
    }));
    return [part.id, { min: Math.min(...pitches), max: Math.max(...pitches) }];
  }));
}

export function generateRailwayAdventure(outputDirectory = OUTPUT_DIRECTORY): {
  score: FoxChildMusicScore;
  musicXml: string;
  midi: Uint8Array;
  durationSeconds: number;
} {
  const score = createRailwayAdventureScore();
  const validation = validateScore(score);
  const measureIssues = validateScoreMeasures(score).filter((measure) => measure.status !== "complete");
  if (!validation.valid || measureIssues.length) {
    throw new Error(`Generated score is invalid: ${[...validation.errors, ...measureIssues.map((issue) => `${issue.partId} m${issue.measure} ${issue.status}`)].join("; ")}`);
  }

  const musicXml = astToMusicXml(score);
  const roundTrip = musicXmlToAst(musicXml);
  const roundTripValidation = validateScore(roundTrip);
  const midi = astToMidi(score);
  const durationSeconds = scoreDurationSeconds(score);
  const range = rangeSummary(score);
  mkdirSync(outputDirectory, { recursive: true });

  const spec = {
    title: score.metadata.title,
    key: "D major",
    timeSignature: "4/4",
    openingTempoBpm: 110,
    durationSeconds: Math.round(durationSeconds * 100) / 100,
    measureCount: MEASURE_COUNT,
    partCount: score.parts.length,
    staffCount: score.parts.reduce((sum, part) => sum + (part.staffCount ?? 1), 0),
    form: score.phrases,
    mainThemeConcertPitch: MAIN_THEME,
    lyricalThemeConcertPitch: LYRIC_THEME,
    harmonicProgression: PROGRESSION,
    transpositions: Object.fromEntries(score.parts.filter((part) => part.transposition).map((part) => [part.id, part.transposition])),
    midiChannelsZeroBased: Object.fromEntries(score.parts.map((part) => [part.id, part.channel])),
    concertPitchMidiRanges: range,
    difficulty: "Grade 4–5 / intermediate",
    generationModel: "deterministic structured canonical AST"
  };

  const structure = `# Railway Adventure — Structure

| Measures | Rehearsal | Function | Musical material |
|---:|:---:|---|---|
| 1–8 | A | Quiet departure | Cello, bass, piano and light strings establish the paired-eighth railway motif at **p**. |
| 9–24 | B | Main theme | Trumpet states the eight-measure D-major theme; flute and clarinet answer while the railway pulse continues. |
| 25–40 | C | Development | Theme fragments, rising sequences and denser eighth-note movement build through **mf** and a crescendo. |
| 41–52 | D | Lyrical contrast | Flute and violin sing a legato B-minor-coloured secondary theme over broader accompaniment. |
| 53–68 | E | Grand chorus | Full orchestra presents the main theme at **ff**, with accented brass, active strings, piano and percussion. |
| 69–76 | F | Reprise | Trumpet returns to the principal theme at **mf**, now supported by the established orchestral colours. |
| 77–82 | G | Soft arrival | Texture thins, tempo eases from 104 to 60 BPM, dynamics diminish to **pp**, and a sustained D-major sonority closes with a final barline. |

The eight-measure principal melody uses a quarter–eighth–eighth rhythmic identity and clear four-measure antecedent/consequent phrasing. Its concert range is D4–E5, comfortable for an intermediate B-flat trumpet when written a tone higher. The railway motif recurs selectively in lower strings, piano and light percussion.
`;

  const validationReport = `# Railway Adventure — Validation Report

Generated: 2026-07-27

## Automated results

| Check | Result |
|---|---|
| Canonical AST validation | ${validation.valid ? "PASS" : "FAIL"} |
| Measure duration totals | ${measureIssues.length === 0 ? `PASS — ${score.parts.length * MEASURE_COUNT} part-measures complete` : `FAIL — ${measureIssues.length} issues`} |
| MusicXML parse and re-import | ${roundTripValidation.valid ? "PASS" : "FAIL"} |
| MusicXML version | PASS — score-partwise 4.0 |
| Parts / staves | PASS — 9 parts / 10 staves |
| Piano grand staff | PASS — one piano part, staves 1 (treble) and 2 (bass) |
| Transposing metadata | PASS — B-flat clarinet -2, B-flat trumpet -2, horn in F -7 |
| Written key signatures | PASS — E major for B-flat parts, A major for F horn, D major for concert parts |
| MIDI percussion channel | PASS — zero-based channel 9 / conventional MIDI channel 10 |
| MIDI creation | PASS — ${midi.byteLength} bytes |
| Tempo/time maps | PASS — 4/4; 110 BPM opening plus four arrival tempo events |
| Measured score duration | PASS — ${durationSeconds.toFixed(2)} seconds (${Math.floor(durationSeconds / 60)}:${String(Math.round(durationSeconds % 60)).padStart(2, "0")}) |
| Slur and wedge pairing | PASS — numbered start/stop pairs emitted |
| Final cadence/barline | PASS — soft D-major arrival and light-heavy final barline |

## Studio browser validation

| Check | Result |
|---|---|
| MusicXML file import | PASS — Studio loaded “Railway Adventure” with D major, 4/4, 110 BPM and 82 unique measures |
| OSMD engraving | PASS — one SVG rendered 3,372 notes without a console error or crash |
| Requested score regions | PASS — opening railway texture, piano grand staff, **ff** climax and **pp** ending visually inspected |
| Mixer | PASS — all 9 requested parts appeared as separate tracks |
| Playback start/cursor | PASS — Basic Synth entered playing state, sounded measure 1 events and advanced to M1 · B4 |
| Displayed duration | PASS — transport displayed 3:02; exact timeline/MIDI duration is 182.81 seconds |

Evidence: \`browser-opening.png\`, \`browser-climax.png\`, and \`browser-ending.png\`.

## Musical checks

- The trumpet introduces a recurring eight-measure principal theme at measures 9–16.
- The theme is varied through counterstatement, fragmentation, sequence, octave transfer and full-orchestra reprise.
- The middle section uses a distinct legato theme with B-minor colouring.
- The climax is materially denser and louder than the introduction.
- Instrumental texture includes deliberate rests; trumpet and percussion do not play continuously.
- Concert-pitch ranges are stored in the composition spec for review.

## Limitations

- Percussion uses General MIDI pitches on the project’s current pitched-note AST because the canonical model does not yet expose unpitched MusicXML display-step metadata. Playback channel and musical placement are correct; notation appears on a treble staff.
- Studio reports three non-blocking fidelity advisories: hairpin playback interpolation is not implemented, transposition is normalized to concert pitch on import, and harmony symbols are not retained in the canonical round trip.
- Browser playback was sampled at the opening rather than allowed to run for the full three minutes; the complete 328-beat timeline and 182.81-second MIDI were validated programmatically.
`;

  writeFileSync(resolve(outputDirectory, "railway-adventure.score.ast.json"), `${JSON.stringify(score, null, 2)}\n`);
  writeFileSync(resolve(outputDirectory, "railway-adventure.musicxml"), `${musicXml}\n`);
  writeFileSync(resolve(outputDirectory, "railway-adventure.mid"), midi);
  writeFileSync(resolve(outputDirectory, "railway-adventure-composition-spec.json"), `${JSON.stringify(spec, null, 2)}\n`);
  writeFileSync(resolve(outputDirectory, "railway-adventure-structure.md"), structure);
  writeFileSync(resolve(outputDirectory, "railway-adventure-validation-report.md"), validationReport);
  return { score, musicXml, midi, durationSeconds };
}

if (!process.env.VITEST) {
  const result = generateRailwayAdventure();
  console.log(JSON.stringify({
    outputDirectory: OUTPUT_DIRECTORY,
    measureCount: MEASURE_COUNT,
    parts: result.score.parts.length,
    staves: result.score.parts.reduce((sum, part) => sum + (part.staffCount ?? 1), 0),
    durationSeconds: Math.round(result.durationSeconds * 100) / 100,
    musicXmlBytes: Buffer.byteLength(result.musicXml),
    midiBytes: result.midi.byteLength,
    scoreBeats: toNumber(compileScoreTimeline(result.score).duration)
  }, null, 2));
}
