import { pitchToName, midiToPitch } from "../theory/pitch";
import { createDefaultMusicGeneratorRegistry } from "./generators";
import { curriculumMappingsForDomain, gradeMappingsForDomain } from "./curriculum";
import { createDefaultDistractorRegistry, type DistractorRegistry } from "./distractors";
import type {
  GeneratedLearningQuestion,
  LearningDomain,
  ParameterDefinition,
  QuestionFamilyDefinition
} from "./adaptiveTypes";
import type { LearningItem, MusicQuestionGenerator } from "./types";
import type { MusicGeneratorRegistry } from "./registries";

interface FamilyBlueprint {
  definition: QuestionFamilyDefinition;
  build(seed: string, difficulty: number, parameters: Record<string, unknown>): GeneratedBlueprint;
}

interface GeneratedBlueprint {
  correct: string | number;
  candidates: Array<string | number>;
  prompt: string;
  generatorParameters: Record<string, unknown>;
  optionLabels?: Record<string, string>;
  interaction?: "choice" | "music-keyboard";
  audioOnly?: boolean;
  symbolId?: string;
  explanation: string;
  hint: string;
}

export class QuestionFamilyRegistry {
  private readonly families = new Map<string, FamilyBlueprint>();

  register(family: FamilyBlueprint): void {
    if (this.families.has(family.definition.id)) {
      throw new Error(`Question family "${family.definition.id}" is already registered.`);
    }
    this.families.set(family.definition.id, family);
  }

  resolve(id: string): QuestionFamilyDefinition {
    const family = this.families.get(id);
    if (!family) throw new Error(`Unknown question family "${id}".`);
    return family.definition;
  }

  blueprint(id: string): FamilyBlueprint {
    const family = this.families.get(id);
    if (!family) throw new Error(`Unknown question family "${id}".`);
    return family;
  }

  list(): QuestionFamilyDefinition[] {
    return [...this.families.values()].map((family) => family.definition);
  }

  ids(): string[] {
    return [...this.families.keys()].sort();
  }
}

export class QuestionFamilyEngine {
  constructor(
    readonly families = createDefaultQuestionFamilyRegistry(),
    readonly generators: MusicGeneratorRegistry = createDefaultMusicGeneratorRegistry(),
    readonly distractors: DistractorRegistry = createDefaultDistractorRegistry()
  ) {}

  generate(
    familyId: string,
    seed: string,
    difficulty = 0.5,
    parameters: Record<string, unknown> = {}
  ): GeneratedLearningQuestion {
    const family = this.families.blueprint(familyId);
    const definition = family.definition;
    const blueprint = family.build(seed, clamp(difficulty), parameters);
    const generator = this.generators.resolve(definition.generatorId);
    const score = generator.generate(seed, blueprint.generatorParameters);
    const instanceId = `instance-${slug(familyId)}-${stableHash(seed).toString(16)}`;
    const variantId = definition.variantIds[stableHash(`${seed}:variant`) % definition.variantIds.length];
    const conceptId = definition.conceptIds[stableHash(`${seed}:concept`) % definition.conceptIds.length];
    const canonicalId = canonicalQuestionId(familyId, conceptId, variantId, seed, blueprint.generatorParameters);
    const item = buildItem(
      definition,
      blueprint,
      score,
      instanceId,
      variantId,
      conceptId,
      seed,
      this.distractors
    );
    return {
      familyId,
      domain: definition.domain,
      seed,
      source: "generated",
      conceptId,
      variantId,
      instanceId,
      canonicalId,
      curriculum: definition.curriculum,
      gradeMappings: definition.gradeMappings,
      generatorParameters: blueprint.generatorParameters,
      item
    };
  }
}

export function createDefaultQuestionFamilyRegistry(): QuestionFamilyRegistry {
  const registry = new QuestionFamilyRegistry();
  familyBlueprints().forEach((family) => registry.register(family));
  return registry;
}

function familyBlueprints(): FamilyBlueprint[] {
  return [
    family("note-reading@2", "Note reading", "note-reading", "note-reading@1", "near-neighbour@1",
      { midi: integer(48, 84), clef: enumeration("treble", "bass") },
      ["pitch-on-staff"], ["single-note", "ledger-note"],
      (seed, difficulty, parameters) => {
        const midi = boundedInteger(parameters.midi, pickNumber(seed, difficulty > 0.7 ? 48 : 60, difficulty > 0.7 ? 83 : 72), 48, 84);
        const name = pitchToName(midiToPitch(midi));
        const selectedClef = enumValue(parameters.clef, ["treble", "bass"], midi < 60 ? "bass" : "treble");
        return {
          correct: name,
          candidates: nearbyPitches(midi),
          prompt: "Play the written note on the piano keyboard.",
          generatorParameters: { midi, clef: selectedClef },
          interaction: "music-keyboard",
          explanation: `The written pitch is ${name}.`,
          hint: "Read the clef, then count lines and spaces from a landmark note."
        };
      }),
    family("accidentals@1", "Accidentals", "note-reading", "note-reading@1", "near-neighbour@1",
      { midi: integer(48, 84), clef: enumeration("treble", "bass") },
      ["accidentals"], ["chromatic-pitch", "enharmonic-pitch"],
      (seed, difficulty, parameters) => {
        const midi = boundedInteger(parameters.midi, pickNumber(seed, difficulty > 0.6 ? 49 : 61, difficulty > 0.6 ? 83 : 72), 48, 84);
        const name = pitchToName(midiToPitch(midi));
        const selectedClef = enumValue(parameters.clef, ["treble", "bass"], midi < 60 ? "bass" : "treble");
        return {
          correct: name,
          candidates: nearbyPitches(midi),
          prompt: "Play the written accidental pitch on the piano keyboard.",
          generatorParameters: { midi, clef: selectedClef },
          interaction: "music-keyboard",
          explanation: `The written accidental pitch is ${name}.`,
          hint: "Read the accidental before naming the note, then find the matching piano key."
        };
      }),
    family("transposition@1", "Transposition", "note-reading", "transposition-display@1", "curriculum-peers@1",
      { semitones: enumeration(-12, -7, -5, 5, 7, 12) },
      ["written-transposition"], ["interval-transposition"],
      (seed, _difficulty, parameters) => {
        const intervals = [-12, -7, -5, 5, 7, 12];
        const semitones = enumNumber(parameters.semitones, intervals, 5);
        const labels: Record<string, string> = {
          "-12": "Down an octave", "-7": "Down a perfect fifth", "-5": "Down a perfect fourth",
          "5": "Up a perfect fourth", "7": "Up a perfect fifth", "12": "Up an octave"
        };
        return {
          correct: semitones,
          candidates: intervals,
          prompt: "Which interval transposes the second phrase from the first?",
          generatorParameters: { rootMidi: 60, semitones },
          optionLabels: labels,
          explanation: `The second phrase is transposed ${labels[String(semitones)].toLowerCase()}.`,
          hint: "Compare the first note of each phrase, then measure the interval between them."
        };
      }),
    family("instruments@1", "Instruments", "note-reading", "instrument-display@1", "curriculum-peers@1",
      { instrument: enumeration("piano", "flute", "clarinet", "trumpet", "horn") },
      ["instrument-identification"], ["transposing-instruments", "families-of-instruments"],
      (seed, _difficulty, parameters) => {
        const instruments = ["piano", "flute", "clarinet", "trumpet", "horn"];
        const instrument = enumValue(parameters.instrument, instruments, pick(seed, instruments));
        const transpositions: Record<string, number> = { piano: 0, flute: 0, clarinet: 2, trumpet: 2, horn: 7 };
        return {
          correct: instrument,
          candidates: instruments,
          prompt: "Which instrument is represented by this score part?",
          generatorParameters: { instrument, transposition: transpositions[instrument] },
          optionLabels: { clarinet: "Clarinet in B♭", trumpet: "Trumpet in B♭", horn: "Horn in F" },
          explanation: `${instrument} is the instrument represented; its written part uses the displayed transposition where applicable.`,
          hint: "Use the instrument label and check whether the written pitch sounds at concert pitch."
        };
      }),
    family("key-signatures@2", "Key signatures", "key-signatures", "key-signature-display@1", "common-confusions@1",
      { tonic: enumeration("C", "G", "D", "A", "F", "Bb", "Eb") },
      ["major-key-signature"], ["sharp-keys", "flat-keys"],
      (seed, _difficulty, parameters) => {
        const keys = ["C", "G", "D", "A", "F", "Bb", "Eb"];
        const tonic = enumValue(parameters.tonic, keys, pick(seed, keys));
        return {
          correct: tonic,
          candidates: keys,
          prompt: "Which major key signature is shown?",
          generatorParameters: { tonic, mode: "major" },
          explanation: `This is the key signature of ${tonic} major.`,
          hint: "For sharps, look at the final sharp; for flats, look at the penultimate flat."
        };
      }),
    family("music-symbols@2", "Music symbols", "music-symbols", "note-value-display@2", "curriculum-peers@1",
      { symbol: enumeration("staccato", "fermata", "crescendo", "natural", "tie") },
      ["notation-symbol"], ["articulation", "expression", "accidental"],
      (seed, _difficulty, parameters) => {
        const symbols = ["staccato", "fermata", "crescendo", "natural", "tie"];
        const symbol = enumValue(parameters.symbol, symbols, pick(seed, symbols));
        return {
          correct: symbol,
          candidates: symbols,
          prompt: "Which music symbol is shown?",
          generatorParameters: { pattern: ["quarter"], beats: 1 },
          symbolId: symbol,
          explanation: `The symbol shown is ${symbol}.`,
          hint: "Think about whether the mark changes duration, articulation, pitch, or expression."
        };
      }),
    family("ornaments@1", "Ornaments", "music-symbols", "note-value-display@2", "curriculum-peers@1",
      { symbol: enumeration("trill", "turn", "mordent", "grace-note") },
      ["ornamentation"], ["ornaments"],
      (seed, _difficulty, parameters) => {
        const ornaments = ["trill", "turn", "mordent", "grace-note"];
        const symbol = enumValue(parameters.symbol, ornaments, pick(seed, ornaments));
        return {
          correct: symbol,
          candidates: ornaments,
          prompt: "Which ornament is shown?",
          generatorParameters: { pattern: ["quarter"], beats: 1 },
          symbolId: symbol,
          optionLabels: { "grace-note": "Grace note" },
          explanation: "The symbol indicates a " + symbol.replaceAll("-", " ") + ".",
          hint: "Look at the shape and position of the small marking above or beside the note."
        };
      }),
    family("note-values@2", "Note values", "note-values", "note-value-display@2", "near-neighbour@1",
      { duration: enumeration("whole", "half", "quarter", "eighth") },
      ["note-duration"], ["simple-values", "short-values"],
      (seed, _difficulty, parameters) => {
        const durations = ["whole", "half", "quarter", "eighth"];
        const beats: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5 };
        const duration = enumValue(parameters.duration, durations, pick(seed, durations));
        return {
          correct: beats[duration],
          candidates: [0.5, 1, 2, 4],
          prompt: "How many crotchet beats is this note worth?",
          generatorParameters: { pattern: [duration], beats: Math.max(1, beats[duration]) },
          explanation: `A ${duration} note lasts ${beats[duration]} crotchet beat${beats[duration] === 1 ? "" : "s"}.`,
          hint: "Compare the note head, stem and flags with a crotchet."
        };
      }),
    family("time-signatures@2", "Time signatures", "time-signatures", "time-signature-display@2", "common-confusions@1",
      { meter: enumeration("2/4", "3/4", "4/4", "6/8", "9/8") },
      ["metre-identification"], ["simple-metre", "compound-metre"],
      (seed, _difficulty, parameters) => {
        const meters = ["2/4", "3/4", "4/4", "6/8", "9/8"];
        const meter = enumValue(parameters.meter, meters, pick(seed, meters));
        const [beats, beatType] = meter.split("/").map(Number);
        return {
          correct: meter,
          candidates: meters,
          prompt: "Which time signature is shown?",
          generatorParameters: { pattern: ["quarter"], beats, timeSignature: { beats, beatType } },
          explanation: `${meter} shows ${beats} written ${beatType === 8 ? "quaver" : "crotchet"} units per bar.`,
          hint: "Read the upper number first, then identify the beat unit from the lower number."
        };
      }),
    family("intervals@2", "Intervals", "intervals", "interval-display@1", "near-neighbour@1",
      { semitones: integer(1, 12), direction: enumeration("ascending", "descending") },
      ["interval-identification"], ["melodic-interval", "compound-direction"],
      (seed, difficulty, parameters) => {
        const names = ["minor 2nd", "major 2nd", "minor 3rd", "major 3rd", "perfect 4th", "tritone", "perfect 5th", "minor 6th", "major 6th", "minor 7th", "major 7th", "octave"];
        const semitones = boundedInteger(parameters.semitones, 1 + stableHash(seed) % (difficulty > 0.7 ? 12 : 7), 1, 12);
        const direction = enumValue(parameters.direction, ["ascending", "descending"], "ascending");
        return {
          correct: names[semitones - 1],
          candidates: names,
          prompt: "Which interval is shown?",
          generatorParameters: { rootMidi: 60, semitones, direction },
          explanation: `The distance is a ${names[semitones - 1]}.`,
          hint: "Count letter names for the interval number, then check the semitone quality."
        };
      }),
    family("interval-inversions@1", "Interval inversions", "intervals", "interval-display@1", "curriculum-peers@1",
      { semitones: integer(1, 12), direction: enumeration("ascending", "descending") },
      ["interval-inversion"], ["simple-inversion", "quality-inversion"],
      (seed, difficulty, parameters) => {
        const semitones = boundedInteger(parameters.semitones, 1 + stableHash(seed) % (difficulty > 0.7 ? 12 : 7), 1, 12);
        const direction = enumValue(parameters.direction, ["ascending", "descending"], "ascending");
        const inversion = intervalName(semitones === 12 ? 12 : 12 - semitones);
        return {
          correct: inversion,
          candidates: ["unison", "minor 2nd", "major 2nd", "minor 3rd", "major 3rd", "perfect 4th", "tritone", "perfect 5th", "minor 6th", "major 6th", "minor 7th", "major 7th"],
          prompt: "Which interval is the inversion of the interval shown?",
          generatorParameters: { rootMidi: 60, semitones, direction },
          explanation: `The interval inverts to a ${inversion}.`,
          hint: "Invert the interval number to nine, then swap major/minor or perfect qualities."
        };
      }),
    family("chords@2", "Chords", "chords", "chord-display@1", "common-confusions@1",
      { quality: enumeration("major", "minor", "diminished", "augmented", "dominant7") },
      ["chord-quality"], ["triads", "seventh-chords"],
      (seed, _difficulty, parameters) => {
        const qualities = ["major", "minor", "diminished", "augmented", "dominant7"];
        const quality = enumValue(parameters.quality, qualities, pick(seed, qualities));
        const labels = { dominant7: "dominant seventh" };
        return {
          correct: quality,
          candidates: qualities,
          prompt: "Which chord quality is shown?",
          generatorParameters: { rootMidi: 60, quality },
          optionLabels: labels,
          explanation: `The chord is ${labels[quality as keyof typeof labels] ?? quality}.`,
          hint: "Compare the third and fifth above the root."
        };
      }),
    family("chord-inversions@1", "Chord inversions", "chords", "chord-display@1", "curriculum-peers@1",
      { quality: enumeration("major", "minor"), inversion: enumeration("root", "first", "second") },
      ["chord-inversion"], ["triad-inversion"],
      (_seed, _difficulty, parameters) => {
        const quality = enumValue(parameters.quality, ["major", "minor"], "major");
        const inversion = enumValue(parameters.inversion, ["root", "first", "second"], "root");
        const base = quality === "major" ? [0, 4, 7] : [0, 3, 7];
        const voicings: Record<string, number[]> = {
          root: base,
          first: [base[1], base[2], base[0] + 12],
          second: [base[2], base[0] + 12, base[1] + 12]
        };
        return {
          correct: inversion,
          candidates: ["root", "first", "second"],
          prompt: "Which inversion is shown?",
          generatorParameters: { rootMidi: 60, intervals: voicings[inversion] },
          optionLabels: { root: "Root position", first: "First inversion", second: "Second inversion" },
          explanation: `The ${quality} triad is in ${inversion === "root" ? "root position" : `${inversion} inversion`}.`,
          hint: "Find the lowest note: root position has the root in the bass; inversions move the third or fifth down."
        };
      }),
    family("cadences@1", "Cadences", "chords", "cadence-display@1", "curriculum-peers@1",
      { cadence: enumeration("perfect", "plagal", "imperfect", "interrupted") },
      ["cadence-recognition"], ["cadence-types"],
      (seed, _difficulty, parameters) => {
        const cadences = ["perfect", "plagal", "imperfect", "interrupted"];
        const cadence = enumValue(parameters.cadence, cadences, pick(seed, cadences));
        return {
          correct: cadence,
          candidates: cadences,
          prompt: "Which cadence is heard and shown?",
          generatorParameters: { cadence },
          optionLabels: { perfect: "Perfect (V–I)", plagal: "Plagal (IV–I)", imperfect: "Imperfect (ends on V)", interrupted: "Interrupted (V–vi)" },
          audioOnly: true,
          explanation: `This is an ${cadence} cadence.`,
          hint: "Listen to the final chord and notice whether the music sounds complete, amen-like, open or interrupted."
        };
      }),
    family("scales@2", "Scales", "scales", "scale-display@2", "common-confusions@1",
      { mode: enumeration("major", "natural-minor", "harmonic-minor") },
      ["scale-type"], ["major-scale", "minor-scales"],
      (seed, _difficulty, parameters) => {
        const modes = ["major", "natural-minor", "harmonic-minor"];
        const mode = enumValue(parameters.mode, modes, pick(seed, modes));
        return {
          correct: mode,
          candidates: modes,
          prompt: "Which type of scale is written?",
          generatorParameters: { rootMidi: 60, mode },
          optionLabels: { "natural-minor": "natural minor", "harmonic-minor": "harmonic minor" },
          explanation: `The interval pattern identifies a ${mode.replaceAll("-", " ")} scale.`,
          hint: "Look especially at the third, sixth and seventh degrees."
        };
      }),
    family("scale-degrees@1", "Scale degrees", "scales", "scale-display@2", "curriculum-peers@1",
      { degree: integer(1, 7), mode: enumeration("major", "natural-minor") },
      ["scale-degree"], ["degree-identification"],
      (seed, _difficulty, parameters) => {
        const degree = boundedInteger(parameters.degree, 1 + stableHash(seed) % 7, 1, 7);
        const mode = enumValue(parameters.mode, ["major", "natural-minor"], "major");
        const names = ["tonic", "supertonic", "mediant", "subdominant", "dominant", "submediant", "leading note/subtonic"];
        return {
          correct: names[degree - 1],
          candidates: names,
          prompt: "Which scale degree is highlighted?",
          generatorParameters: { rootMidi: 60, mode },
          explanation: "Scale degree " + degree + " is the " + names[degree - 1] + ".",
          hint: "Count from the tonic as degree one, then name the scale position."
        };
      }),
    family("rhythm@2", "Rhythm", "rhythm", "rhythm-fragment@1", "near-neighbour@1",
      { beats: integer(2, 8), allowedDurations: enumeration("quarter", "eighth", "half") },
      ["rhythm-total"], ["simple-pattern", "syncopated-pattern"],
      (seed, difficulty, parameters) => {
        const patterns = difficulty > 0.7
          ? [["eighth", "eighth", "quarter", "half"], ["quarter", "eighth", "eighth", "quarter"], ["half", "quarter", "quarter"]]
          : [["quarter", "quarter"], ["half", "quarter"], ["quarter", "quarter", "quarter"]];
        const requestedBeats = parameters.beats === undefined ? undefined : boundedInteger(parameters.beats, 4, 2, 8);
        const pattern = requestedBeats ? Array.from({ length: requestedBeats }, () => "quarter") : pick(seed, patterns);
        const value: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5 };
        const total = pattern.reduce((sum, duration) => sum + value[duration], 0);
        return {
          correct: total,
          candidates: [1, 2, 3, 4, 5, 6],
          prompt: "How many crotchet beats does this rhythm last?",
          generatorParameters: { pattern, beats: total },
          explanation: `The rhythm lasts ${total} crotchet beats in total.`,
          hint: "Add each note value from left to right."
        };
      }),
    family("tuplets@1", "Tuplets", "rhythm", "rhythm-fragment@1", "curriculum-peers@1",
      { actualNotes: enumeration(3, 5, 7), normalNotes: enumeration(2, 4) },
      ["tuplet-grouping"], ["triplets", "irregular-tuplets"],
      (seed, _difficulty, parameters) => {
        const actualNotes = enumNumber(parameters.actualNotes, [3, 5, 7], 3);
        const normalNotes = enumNumber(parameters.normalNotes, [2, 4], 2);
        return {
          correct: actualNotes,
          candidates: [3, 5, 7, 9],
          prompt: "How many notes are contained in this tuplet group?",
          generatorParameters: {
            pattern: Array.from({ length: actualNotes }, () => "quarter"),
            beats: normalNotes,
            tuplet: { actualNotes, normalNotes, normalType: "quarter" }
          },
          explanation: `This group contains ${actualNotes} notes in the time normally occupied by ${normalNotes}.`,
          hint: "Count the notes under the tuplet bracket, then compare the group with its normal beat span."
        };
      }),
    family("tempo@2", "Tempo", "tempo", "tempo-example@2", "curriculum-peers@1",
      { bpm: integer(50, 180), term: enumeration("largo", "andante", "moderato", "allegro", "presto") },
      ["tempo-term"], ["slow-tempo", "fast-tempo"],
      (seed, _difficulty, parameters) => {
        const entries = [
          { term: "largo", bpm: 50 }, { term: "andante", bpm: 78 },
          { term: "moderato", bpm: 104 }, { term: "allegro", bpm: 132 },
          { term: "presto", bpm: 180 }
        ];
        const selectedTerm = enumValue(parameters.term, entries.map((item) => item.term), pick(seed, entries).term);
        const baseEntry = entries.find((item) => item.term === selectedTerm) ?? entries[0];
        const entry = { ...baseEntry, bpm: boundedInteger(parameters.bpm, baseEntry.bpm, 50, 180) };
        return {
          correct: entry.term,
          candidates: entries.map((item) => item.term),
          prompt: "Which tempo term best matches this example?",
          generatorParameters: { bpm: entry.bpm },
          audioOnly: true,
          explanation: `${entry.term} best matches a tempo around ${entry.bpm} bpm.`,
          hint: "Listen for whether the pulse feels very slow, walking, moderate, fast or very fast."
        };
      }),
    family("ear-training@2", "Ear training", "ear-training", "interval-display@1", "near-neighbour@1",
      { semitones: integer(1, 12) },
      ["aural-interval"], ["step-and-skip", "wide-interval"],
      (seed, difficulty, parameters) => {
        const names = ["minor 2nd", "major 2nd", "minor 3rd", "major 3rd", "perfect 4th", "tritone", "perfect 5th", "minor 6th", "major 6th", "minor 7th", "major 7th", "octave"];
        const semitones = boundedInteger(parameters.semitones, 1 + stableHash(seed) % (difficulty > 0.7 ? 12 : 7), 1, 12);
        return {
          correct: names[semitones - 1],
          candidates: names,
          prompt: "Which interval do you hear?",
          generatorParameters: { rootMidi: 60, semitones, direction: "ascending", bpm: 72 },
          audioOnly: true,
          explanation: `The two notes form a ${names[semitones - 1]}.`,
          hint: "Compare the sound with a familiar song opening or sing the notes back."
        };
      }),
    family("sight-reading@2", "Sight reading", "sight-reading", "sight-reading-melody@1", "near-neighbour@1",
      { measures: integer(1, 4), maximumLeapSemitones: integer(2, 7) },
      ["sight-reading-preview"], ["stepwise-melody", "leaping-melody"],
      (seed, difficulty, parameters) => {
        const firstMidi = 60 + stableHash(`${seed}:first`) % 8;
        const name = pitchToName(midiToPitch(firstMidi));
        const measures = boundedInteger(parameters.measures, difficulty > 0.7 ? 2 : 1, 1, 4);
        const maximumLeapSemitones = boundedInteger(parameters.maximumLeapSemitones, difficulty > 0.7 ? 6 : 3, 2, 7);
        return {
          correct: name,
          candidates: nearbyPitches(firstMidi),
          prompt: "What is the opening pitch of this sight-reading phrase?",
          generatorParameters: {
            measures,
            firstMidi,
            pitchRange: { minimumMidi: firstMidi, maximumMidi: firstMidi + 7 },
            maximumLeapSemitones,
            allowedDurations: ["quarter", "eighth", "half"]
          },
          explanation: `The phrase begins on ${name}.`,
          hint: "Find the first note and read its staff position before scanning ahead."
        };
      }),
    family("melody-dictation@2", "Melody dictation", "melody-dictation", "melody-dictation@2", "common-confusions@1",
      { contour: enumeration("ascending", "descending", "mixed"), length: integer(3, 8) },
      ["melodic-contour"], ["short-contour", "extended-contour"],
      (seed, difficulty, parameters) => {
        const contours = ["ascending", "descending", "mixed"];
        const contour = enumValue(parameters.contour, contours, pick(seed, contours));
        const length = boundedInteger(parameters.length, difficulty > 0.7 ? 6 : 4, 3, 8);
        return {
          correct: contour,
          candidates: contours,
          prompt: "Which contour best describes the melody you hear?",
          generatorParameters: { contour, length, rootMidi: 60, bpm: 72 },
          audioOnly: true,
          explanation: `The melody has a ${contour} contour.`,
          hint: "Track whether each new note moves mostly up, mostly down, or changes direction."
        };
      }),
    family("phrase-structure@1", "Phrase structure", "melody-dictation", "phrase-structure-display@1", "curriculum-peers@1",
      { relation: enumeration("repeat", "sequence", "contrast") },
      ["phrase-structure"], ["repeat-sequence", "phrase-contrast"],
      (seed, _difficulty, parameters) => {
        const relations = ["repeat", "sequence", "contrast"];
        const relation = enumValue(parameters.relation, relations, pick(seed, relations));
        return {
          correct: relation,
          candidates: relations,
          prompt: "How are the two phrases related?",
          generatorParameters: { relation, rootMidi: 60 },
          optionLabels: { repeat: "Repeated", sequence: "Sequential", contrast: "Contrasting" },
          explanation: `The second phrase is ${relation === "repeat" ? "a repeat" : `a ${relation}`}.`,
          hint: "Compare the contour and interval pattern of the second phrase with the first."
        };
      }),
    family("melody-completion@1", "Melodic completion", "melody-dictation", "melody-completion-display@1", "near-neighbour@1",
      { completionMidi: integer(60, 72), mode: enumeration("major", "minor") },
      ["melodic-completion"], ["cadential-ending", "tonal-continuation"],
      (seed, _difficulty, parameters) => {
        const endings = [60, 62, 64, 67];
        const completionMidi = enumNumber(parameters.completionMidi, endings, pick(seed, endings));
        const mode = enumValue(parameters.mode, ["major", "minor"], "major");
        const labels = endings.map((midi) => pitchToName(midiToPitch(midi)));
        const correct = pitchToName(midiToPitch(completionMidi));
        return {
          correct,
          candidates: labels,
          prompt: "Which final note best completes this melody?",
          generatorParameters: { rootMidi: 60, completionMidi, mode },
          explanation: `${correct} provides the most stable tonal ending for this ${mode} phrase.`,
          hint: "Sing the phrase internally and choose the pitch that gives the strongest sense of resolution."
        };
      }),
    family("error-detection@2", "Error detection", "error-detection", "error-detection@2", "near-neighbour@1",
      { errorIndex: integer(0, 3), errorSemitones: enumeration(1, -1) },
      ["notation-error-position"], ["pitch-error", "scale-error"],
      (seed, _difficulty, parameters) => {
        const index = boundedInteger(parameters.errorIndex, stableHash(seed) % 4, 0, 3);
        const errorSemitones = enumNumber(parameters.errorSemitones, [1, -1], 1);
        return {
          correct: index + 1,
          candidates: [1, 2, 3, 4],
          prompt: "Which numbered note contains the pitch error?",
          generatorParameters: { rootMidi: 60, errorIndex: index, errorSemitones },
          explanation: `Note ${index + 1} falls outside the expected pattern.`,
          hint: "Compare each note with the stepwise C-major pattern."
        };
      })
  ];
}

function family(
  id: string,
  title: string,
  domain: LearningDomain,
  generatorId: MusicQuestionGenerator["id"],
  distractorStrategyId: string,
  parameterSpace: Record<string, ParameterDefinition>,
  conceptIds: string[],
  variantIds: string[],
  build: FamilyBlueprint["build"]
): FamilyBlueprint {
  const qualifiedConceptIds = conceptIds.map((conceptId) => `${domain}.${conceptId}`);
  return {
    definition: {
      id,
      version: 1,
      title,
      domain,
      conceptIds: qualifiedConceptIds,
      variantIds,
      interactionKinds: domain === "note-reading" ? ["music-keyboard"] : ["choice"],
      parameterSpace,
      generatorId,
      distractorStrategyId,
      curriculum: qualifiedConceptIds.flatMap((conceptId) => curriculumMappingsForDomain(domain, conceptId)),
      gradeMappings: gradeMappingsForDomain(domain)
    },
    build
  };
}

function buildItem(
  definition: QuestionFamilyDefinition,
  blueprint: GeneratedBlueprint,
  score: ReturnType<MusicQuestionGenerator["generate"]>,
  instanceId: string,
  variantId: string,
  conceptId: string,
  seed: string,
  distractors: DistractorRegistry
): LearningItem {
  const responseId = `response-${instanceId}`;
  const interaction = blueprint.interaction ?? "choice";
  const stimuli: LearningItem["stimulus"] = [];
  if (blueprint.symbolId) {
    stimuli.push({
      id: `symbol-${instanceId}`,
      kind: "music-symbol",
      content: { symbolId: blueprint.symbolId },
      accessibility: { description: { "en-GB": "An unidentified music symbol." } }
    });
  }
  stimuli.push({
    id: `score-${instanceId}`,
    kind: "notation",
    visibility: blueprint.audioOnly || blueprint.symbolId ? "hidden" : "visible",
    source: { mode: "inline-ast", score },
    playback: { enabled: blueprint.audioOnly === true },
    accessibility: { description: { "en-GB": blueprint.prompt } }
  });
  if (blueprint.audioOnly) {
    stimuli.push({
      id: `audio-${instanceId}`,
      kind: "audio",
      source: { mode: "render-score", notationStimulusId: `score-${instanceId}` },
      playback: { enabled: true, maxReplays: 4 }
    });
  }

  if (interaction === "music-keyboard") {
    return {
      id: instanceId,
      type: "keyboard-input",
      version: 1,
      metadata: adaptiveMetadata(definition, conceptId, variantId, instanceId, seed),
      stimulus: stimuli,
      prompt: { content: { "en-GB": blueprint.prompt }, format: "plain-text" },
      interaction: {
        kind: "music-keyboard",
        responseId,
        cardinality: "single",
        range: { minimumMidi: 48, maximumMidi: 84 }
      },
      response: {
        id: responseId,
        baseType: "pitch",
        cardinality: "single",
        correct: { value: blueprint.correct }
      },
      assessment: {
        strategy: "pitch-match@1",
        maximumScore: 1,
        passingScore: 1,
        parameters: { octaveRequired: true, allowEnharmonicEquivalent: true },
        attemptPolicy: { maximumAttempts: 3, scorePolicy: "best" }
      },
      ...helpContent(blueprint, instanceId)
    };
  }

  const otherValues = distractors.resolve(definition.distractorStrategyId).generate({
    correct: blueprint.correct,
    candidates: blueprint.candidates,
    count: 3,
    seed
  });
  const values = deterministicOrder([blueprint.correct, ...otherValues], `${seed}:options`);
  const options = values.map((value) => ({
    id: optionId(value),
    content: { "en-GB": blueprint.optionLabels?.[String(value)] ?? String(value) }
  }));
  return {
    id: instanceId,
    type: "selected-response",
    version: 1,
    metadata: adaptiveMetadata(definition, conceptId, variantId, instanceId, seed),
    stimulus: stimuli,
    prompt: { content: { "en-GB": blueprint.prompt }, format: "plain-text" },
    interaction: {
      kind: "choice",
      responseId,
      cardinality: "single",
      display: "buttons",
      shuffleOptions: false,
      options
    },
    response: {
      id: responseId,
      baseType: "identifier",
      cardinality: "single",
      correct: { value: optionId(blueprint.correct) }
    },
    assessment: {
      strategy: "exact-identifier@1",
      maximumScore: 1,
      passingScore: 1,
      attemptPolicy: { maximumAttempts: 3, scorePolicy: "best" }
    },
    ...helpContent(blueprint, instanceId)
  };
}

function adaptiveMetadata(
  definition: QuestionFamilyDefinition,
  conceptId: string,
  variantId: string,
  instanceId: string,
  seed: string
): Record<string, unknown> {
  return {
    adaptive: true,
    familyId: definition.id,
    domain: definition.domain,
    conceptId,
    variantId,
    instanceId,
    seed,
    skillIds: [conceptId],
    curriculum: definition.curriculum,
    gradeMappings: definition.gradeMappings
  };
}

function helpContent(blueprint: GeneratedBlueprint, instanceId: string) {
  return {
    feedback: {
      mode: "after-submit",
      correct: { message: { "en-GB": "Correct — your mastery has been updated." } },
      incorrect: { message: { "en-GB": "Not quite. Use the hint, then try once more." } },
      showCorrectAnswer: "after-final-attempt"
    },
    hints: [{ id: `hint-${instanceId}`, content: { "en-GB": blueprint.hint } }],
    explanation: { content: { "en-GB": blueprint.explanation } }
  };
}

function integer(minimum: number, maximum: number): ParameterDefinition {
  return { type: "integer", minimum, maximum };
}

function enumeration(...values: Array<string | number | boolean>): ParameterDefinition {
  return { type: "enum", values };
}

function pick<T>(seed: string, values: readonly T[]): T {
  return values[stableHash(seed) % values.length];
}

function pickNumber(seed: string, minimum: number, maximum: number): number {
  return minimum + stableHash(seed) % (maximum - minimum + 1);
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const candidate = Number(value);
  return Number.isFinite(candidate)
    ? Math.max(minimum, Math.min(maximum, Math.round(candidate)))
    : fallback;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function enumNumber(value: unknown, allowed: readonly number[], fallback: number): number {
  const candidate = Number(value);
  return allowed.includes(candidate) ? candidate : fallback;
}

function nearbyPitches(midi: number): string[] {
  return [-2, -1, 0, 1, 2].map((offset) => pitchToName(midiToPitch(midi + offset)));
}

function intervalName(semitones: number): string {
  return ["unison", "minor 2nd", "major 2nd", "minor 3rd", "major 3rd", "perfect 4th", "tritone", "perfect 5th", "minor 6th", "major 6th", "minor 7th", "major 7th", "octave"][Math.max(0, Math.min(12, semitones))];
}

function optionId(value: string | number): string {
  if (typeof value === "number" && value < 0) return `answer-negative-${slug(String(Math.abs(value)))}`;
  return `answer-${slug(String(value))}`;
}

function deterministicOrder<T>(values: T[], seed: string): T[] {
  return [...values].sort((left, right) =>
    stableHash(`${seed}:${String(left)}`) - stableHash(`${seed}:${String(right)}`)
  );
}

export function stableHash(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function canonicalQuestionId(
  familyId: string,
  conceptId: string,
  variantId: string,
  seed: string,
  generatorParameters: Record<string, unknown> = {}
): string {
  return [
    slug(familyId),
    slug(conceptId),
    slug(variantId),
    `params-${stableHash(stableSerialize(generatorParameters)).toString(16)}`,
    `seed-${stableHash(seed).toString(16)}`
  ].join(":");
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "value";
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
