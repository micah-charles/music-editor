import type { Duration, FoxChildMusicScore, MusicEvent, NoteNotation, Pitch } from "../ast/types";
import { DURATION_BEATS, durationToBeats, durationToMusicXmlType } from "../rhythm/duration";
import { keyToFifths } from "../theory/key";
import { transposePitch } from "../theory/pitch";
import { parseChordName } from "../chords/chordDetection";

const DIVISIONS = 24;

export function astToMusicXml(score: FoxChildMusicScore): string {
  const partList = score.parts.map((part, index) => {
    return [
      `    <score-part id="${xml(part.id)}">`,
      `      <part-name>${xml(part.name || `Part ${index + 1}`)}</part-name>`,
      `      <part-abbreviation>${xml(part.name || `Part ${index + 1}`)}</part-abbreviation>`,
      `      <score-instrument id="${xml(part.id)}-instrument">`,
      `        <instrument-name>${xml(part.instrument.name)}</instrument-name>`,
      "      </score-instrument>",
      `      <midi-instrument id="${xml(part.id)}-instrument">`,
      `        <midi-channel>${Math.min(16, Math.max(1, (part.channel ?? index) + 1))}</midi-channel>`,
      `        <midi-program>${Math.min(128, Math.max(1, part.instrument.midiProgram ?? 1))}</midi-program>`,
      "      </midi-instrument>",
      "    </score-part>"
    ].join("\n");
  }).join("\n");

  const parts = score.parts.map((part, partIndex) => {
    const eventStaffs = part.measures.flatMap((measure) => measure.events.map((event) => event.staff ?? 1));
    const declaredStaffs = Object.keys(part.clefs ?? {}).map(Number).filter(Number.isFinite);
    const staffCount = Math.max(1, part.staffCount ?? 1, ...eventStaffs, ...declaredStaffs);
    const clefs = Array.from({ length: staffCount }, (_, index) => {
      const staff = index + 1;
      const clef = part.clefs?.[staff] ?? (staff === 1 ? part.clef : "bass");
      return [
        `        <clef number="${staff}">`,
        `          <sign>${clefSign(clef)}</sign>`,
        `          <line>${clefLine(clef)}</line>`,
        "        </clef>"
      ].join("\n");
    }).join("\n");
    const measures = part.measures.map((measure, measureIndex) => {
      const keyChange = (score.global.keyEvents ?? []).find((event) => (
        event.position.measure === measure.number && event.position.beat === 0
      ));
      const attributes = measureIndex === 0
        ? [
          "      <attributes>",
          `        <divisions>${DIVISIONS}</divisions>`,
          "        <key>",
          `          <fifths>${part.transposition?.writtenKeyFifths ?? score.global.key.fifths ?? keyToFifths(score.global.key.tonic, score.global.key.mode)}</fifths>`,
          `          <mode>${score.global.key.mode}</mode>`,
          "        </key>",
          "        <time>",
          `          <beats>${score.global.timeSignature.beats}</beats>`,
          `          <beat-type>${score.global.timeSignature.beatType}</beat-type>`,
          "        </time>",
          ...(staffCount > 1 ? [`        <staves>${staffCount}</staves>`] : []),
          ...(part.transposition ? [
            "        <transpose>",
            ...(part.transposition.diatonic === undefined ? [] : [`          <diatonic>${part.transposition.diatonic}</diatonic>`]),
            `          <chromatic>${part.transposition.chromatic}</chromatic>`,
            ...(part.transposition.octaveChange === undefined ? [] : [`          <octave-change>${part.transposition.octaveChange}</octave-change>`]),
            "        </transpose>"
          ] : []),
          clefs,
          "      </attributes>",
          ...(partIndex === 0 ? [
            "      <direction placement=\"above\">",
            ...(score.global.tempo.label ? [
              "        <direction-type>",
              `          <words>${xml(score.global.tempo.label)}</words>`,
              "        </direction-type>"
            ] : []),
            "        <direction-type>",
            "          <metronome>",
            "            <beat-unit>quarter</beat-unit>",
            `            <per-minute>${score.global.tempo.bpm}</per-minute>`,
            "          </metronome>",
            "        </direction-type>",
            `        <sound tempo="${score.global.tempo.bpm}"/>`,
            "      </direction>"
          ] : [])
        ].join("\n")
        : keyChange
          ? [
            "      <attributes>",
            "        <key>",
            `          <fifths>${keyChange.fifths ?? keyToFifths(keyChange.tonic, keyChange.mode)}</fifths>`,
            `          <mode>${keyChange.mode}</mode>`,
            "        </key>",
            "      </attributes>"
          ].join("\n")
          : "";

      const eventXml = measureEventsToXml(measure.events, part.transposition?.chromatic);
      const tempoChanges = (score.global.tempoEvents ?? [])
        .filter((tempo) => partIndex === 0 && tempo.position.measure === measure.number && !(measureIndex === 0 && tempo.position.beat === 0 && tempo.bpm === score.global.tempo.bpm))
        .map((tempo) => tempoDirectionXml(tempo.bpm, tempo.position.beat, tempo.label))
        .join("\n");
      return [
        `    <measure number="${measure.number}"${measure.implicit ? " implicit=\"yes\"" : ""}>`,
        attributes,
        measure.repeat?.start ? "      <barline location=\"left\"><repeat direction=\"forward\"/></barline>" : "",
        tempoChanges,
        eventXml,
        measure.repeat?.end || measure.repeat?.endings?.length ? repeatBarlineXml(measure.repeat) : "",
        measure.extensions?.finalBarline
          ? "      <barline location=\"right\"><bar-style>light-heavy</bar-style></barline>"
          : "",
        "    </measure>"
      ].filter(Boolean).join("\n");
    }).join("\n");

    return [
      `  <part id="${xml(part.id)}">`,
      measures,
      "  </part>"
    ].join("\n");
  }).join("\n");

  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<score-partwise version=\"4.0\">",
    "  <work>",
    `    <work-title>${xml(score.metadata.title)}</work-title>`,
    "  </work>",
    `  <movement-title>${xml(score.metadata.movementTitle ?? score.metadata.title)}</movement-title>`,
    ...creditXml(score),
    "  <identification>",
    score.metadata.composer ? `    <creator type="composer">${xml(score.metadata.composer)}</creator>` : "",
    score.metadata.arranger ? `    <creator type="arranger">${xml(score.metadata.arranger)}</creator>` : "",
    score.metadata.lyricist ? `    <creator type="lyricist">${xml(score.metadata.lyricist)}</creator>` : "",
    "    <miscellaneous>",
    `      <miscellaneous-field name="foxchild-tempo-source">${score.global.tempo.source ?? "user"}</miscellaneous-field>`,
    "    </miscellaneous>",
    "    <encoding>",
    "      <software>FoxChild Music Score Lab</software>",
    `      <encoding-date>${new Date().toISOString().slice(0, 10)}</encoding-date>`,
    "    </encoding>",
    "  </identification>",
    "  <part-list>",
    partList,
    "  </part-list>",
    parts,
    "</score-partwise>"
  ].filter(Boolean).join("\n");
}

function clefSign(clef: string): "G" | "F" | "C" {
  if (clef === "bass") return "F";
  if (clef === "alto" || clef === "tenor") return "C";
  return "G";
}

function clefLine(clef: string): number {
  if (clef === "bass") return 4;
  if (clef === "alto") return 3;
  if (clef === "tenor") return 4;
  return 2;
}

function measureEventsToXml(events: MusicEvent[], transpositionChromatic?: number): string {
  const lanes = new Map<string, MusicEvent[]>();
  const directions = events.filter((event) => event.type === "annotation" || event.type === "direction");
  events.filter((event) => event.type !== "annotation" && event.type !== "direction").forEach((event) => {
    const key = `${event.staff ?? 1}:${event.voice ?? 1}`;
    lanes.set(key, [...(lanes.get(key) ?? []), event]);
  });

  const output: string[] = directions.flatMap((event) => eventToXml(event, transpositionChromatic));
  [...lanes.values()].forEach((lane, laneIndex) => {
    let cursorBeat = 0;
    const ordered = [...lane].sort((left, right) => (left.position?.beat ?? 0) - (right.position?.beat ?? 0));
    ordered.forEach((event) => {
      const targetBeat = event.position?.beat ?? cursorBeat;
      if (targetBeat > cursorBeat + 0.000001) {
        output.push(forwardXml(targetBeat - cursorBeat, event.voice ?? 1, event.staff ?? 1));
        cursorBeat = targetBeat;
      }
      output.push(...eventToXml(event, transpositionChromatic));
      if (event.type !== "annotation" && event.type !== "direction") {
        cursorBeat = Math.max(cursorBeat, targetBeat + durationToBeats(event.duration));
      }
    });
    if (laneIndex < lanes.size - 1 && cursorBeat > 0) {
      output.push(`      <backup><duration>${Math.max(1, Math.round(cursorBeat * DIVISIONS))}</duration></backup>`);
    }
  });
  return output.join("\n");
}

function eventToXml(event: MusicEvent, transpositionChromatic?: number): string[] {
  if (event.type === "annotation") {
    return [
      "      <direction placement=\"above\">",
      "        <direction-type>",
      `          <words>${xml(event.text)}</words>`,
      "        </direction-type>",
      event.position?.beat ? `        <offset>${Math.round(event.position.beat * DIVISIONS)}</offset>` : "",
      event.staff ? `        <staff>${event.staff}</staff>` : "",
      "      </direction>"
    ].filter(Boolean);
  }

  if (event.type === "direction") {
    const directionTypes = [
      event.dynamic ? `          <dynamics><${event.dynamic}/></dynamics>` : "",
      event.text ? `          <words>${xml(event.text)}</words>` : "",
      event.wedge ? `          <wedge type="${event.wedge.type}"${event.wedge.number ? ` number="${event.wedge.number}"` : ""}/>` : ""
    ].filter(Boolean);
    return [
      `      <direction placement="${event.placement ?? "below"}">`,
      "        <direction-type>",
      ...directionTypes,
      "        </direction-type>",
      event.position?.beat ? `        <offset>${Math.round(event.position.beat * DIVISIONS)}</offset>` : "",
      event.voice ? `        <voice>${event.voice}</voice>` : "",
      event.staff ? `        <staff>${event.staff}</staff>` : "",
      "      </direction>"
    ].filter(Boolean);
  }

  if (event.type === "rest") {
    return [noteXml({ rest: true, duration: event.duration, voice: event.voice, staff: event.staff })];
  }

  if (event.type === "note") {
    return [noteXml({
      pitch: writtenPitch(event.pitch, transpositionChromatic),
      duration: event.duration,
      lyric: event.lyric,
      voice: event.voice,
      staff: event.staff,
      tie: event.tie,
      notation: event.notation
    })];
  }

  return [
    ...(event.semantic?.chordName ? [harmonyXml(event.semantic.chordName)] : []),
    ...event.pitches.map((pitch, index) => noteXml({
      pitch: writtenPitch(pitch, transpositionChromatic),
      duration: event.duration,
      chord: index > 0,
      lyric: index === 0 ? event.lyric : undefined,
      voice: event.voice,
      staff: event.staff,
      notation: index === 0 ? event.notation : undefined
    }))
  ];
}

function writtenPitch(pitch: Pitch, transpositionChromatic?: number): Pitch {
  return transpositionChromatic ? transposePitch(pitch, -transpositionChromatic) : pitch;
}

function harmonyXml(chordName: string): string {
  const parsed = parseChordName(chordName);
  return [
    "      <harmony>",
    "        <root>",
    `          <root-step>${xml(parsed.root.charAt(0))}</root-step>`,
    rootAlterXml(parsed.root),
    "        </root>",
    `        <kind>${xml(musicXmlKind(parsed.quality))}</kind>`,
    "      </harmony>"
  ].filter(Boolean).join("\n");
}

function noteXml(options: {
  pitch?: Pitch;
  rest?: boolean;
  duration: Duration;
  chord?: boolean;
  lyric?: string;
  voice?: number;
  staff?: number;
  tie?: Extract<MusicEvent, { type: "note" }>["tie"];
  notation?: NoteNotation;
}): string {
  const isGrace = Boolean(options.notation?.grace);
  const durationBeats = durationToBeats(options.duration as never);
  const xmlType = durationToMusicXmlType(options.duration as never);
  const hasConsistentType = isGrace || Math.abs(notatedDurationBeats(options.duration) - durationBeats) <= 0.000001;
  const dots = hasConsistentType ? Array.from({ length: xmlType.dots }, () => "        <dot/>").join("\n") : "";
  const timeModification = hasConsistentType ? timeModificationXml(options.duration) : "";
  const beams = (options.notation?.beams ?? []).map((beam) => `        <beam number="${beam.number}">${beam.value}</beam>`).join("\n");
  const pitch = options.rest || !options.pitch
    ? "        <rest/>"
    : [
      "        <pitch>",
      `          <step>${options.pitch.step}</step>`,
      (options.pitch.alter ?? 0) !== 0 ? `          <alter>${options.pitch.alter}</alter>` : "",
      `          <octave>${options.pitch.octave}</octave>`,
      "        </pitch>"
    ].filter(Boolean).join("\n");
  const lyric = options.lyric
    ? [
      "        <lyric>",
      `          <text>${xml(options.lyric)}</text>`,
      "        </lyric>"
    ].join("\n")
    : "";
  const tieElements = [
    options.tie?.stop ? "        <tie type=\"stop\"/>" : "",
    options.tie?.start ? "        <tie type=\"start\"/>" : ""
  ].filter(Boolean).join("\n");
  const notationChildren = [
    options.tie?.stop ? "          <tied type=\"stop\"/>" : "",
    options.tie?.start ? "          <tied type=\"start\"/>" : "",
    ...(options.notation?.slurs ?? []).map((slur) => `          <slur type="${slur.type}"${slur.number ? ` number="${slur.number}"` : ""}${slur.placement ? ` placement="${slur.placement}"` : ""}/>`),
    options.notation?.articulations?.length
      ? ["          <articulations>", ...options.notation.articulations.map((articulation) => `            <${articulation}/>`), "          </articulations>"].join("\n")
      : ""
  ].filter(Boolean);
  const tiedNotations = notationChildren.length
    ? [
      "        <notations>",
      ...notationChildren,
      "        </notations>"
    ].filter(Boolean).join("\n")
    : "";

  return [
    "      <note>",
    options.chord ? "        <chord/>" : "",
    isGrace ? `        <grace${options.notation?.grace?.slash ? " slash=\"yes\"" : ""}/>` : "",
    pitch,
    isGrace ? "" : `        <duration>${Math.max(1, Math.round(durationBeats * DIVISIONS))}</duration>`,
    tieElements,
    `        <voice>${options.voice ?? 1}</voice>`,
    hasConsistentType ? `        <type>${xmlType.type}</type>` : "",
    dots,
    timeModification,
    beams,
    `        <staff>${options.staff ?? 1}</staff>`,
    tiedNotations,
    lyric,
    "      </note>"
  ].filter(Boolean).join("\n");
}

function notatedDurationBeats(duration: Duration): number {
  const base = DURATION_BEATS[duration.value];
  return duration.tuplet ? base * duration.tuplet.normalNotes / duration.tuplet.actualNotes : base;
}

function creditXml(score: FoxChildMusicScore): string[] {
  const credits = [...(score.metadata.credits ?? [])];
  if (score.metadata.subtitle && !credits.some((credit) => credit.type === "subtitle" && credit.text === score.metadata.subtitle)) {
    credits.unshift({ type: "subtitle", text: score.metadata.subtitle });
  }
  return credits.flatMap((credit) => [
    `  <credit${credit.page ? ` page="${credit.page}"` : ""}>`,
    credit.type ? `    <credit-type>${xml(credit.type)}</credit-type>` : "",
    `    <credit-words>${xml(credit.text)}</credit-words>`,
    "  </credit>"
  ]).filter(Boolean);
}

function forwardXml(beats: number, voice: number, staff: number): string {
  return [
    "      <forward>",
    `        <duration>${Math.max(1, Math.round(beats * DIVISIONS))}</duration>`,
    `        <voice>${voice}</voice>`,
    `        <staff>${staff}</staff>`,
    "      </forward>"
  ].join("\n");
}

function tempoDirectionXml(bpm: number, beat: number, label?: string): string {
  return [
    "      <direction placement=\"above\">",
    ...(label ? [
      "        <direction-type>",
      `          <words>${xml(label)}</words>`,
      "        </direction-type>"
    ] : []),
    "        <direction-type>",
    "          <metronome>",
    "            <beat-unit>quarter</beat-unit>",
    `            <per-minute>${bpm}</per-minute>`,
    "          </metronome>",
    "        </direction-type>",
    beat > 0 ? `        <offset>${Math.round(beat * DIVISIONS)}</offset>` : "",
    `        <sound tempo="${bpm}"/>`,
    "      </direction>"
  ].filter(Boolean).join("\n");
}

function repeatBarlineXml(repeat: NonNullable<FoxChildMusicScore["parts"][number]["measures"][number]["repeat"]>): string {
  return [
    "      <barline location=\"right\">",
    repeat.endings?.length ? `        <ending number="${repeat.endings.join(",")}" type="stop"/>` : "",
    repeat.end ? `        <repeat direction="backward"${repeat.times ? ` times="${repeat.times}"` : ""}/>` : "",
    "      </barline>"
  ].filter(Boolean).join("\n");
}

function timeModificationXml(duration: Duration): string {
  if (!duration.tuplet) {
    return "";
  }
  return [
    "        <time-modification>",
    `          <actual-notes>${duration.tuplet.actualNotes}</actual-notes>`,
    `          <normal-notes>${duration.tuplet.normalNotes}</normal-notes>`,
    duration.tuplet.normalType ? `          <normal-type>${musicXmlTypeName(duration.tuplet.normalType)}</normal-type>` : "",
    "        </time-modification>"
  ].filter(Boolean).join("\n");
}

function musicXmlTypeName(value: string): string {
  if (value === "sixteenth") return "16th";
  if (value.startsWith("dotted-")) return value.replace("dotted-", "");
  return value;
}

function xml(value: string | number | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rootAlterXml(root: string): string {
  if (root.includes("#")) {
    return "          <root-alter>1</root-alter>";
  }
  if (root.includes("b")) {
    return "          <root-alter>-1</root-alter>";
  }
  return "";
}

function musicXmlKind(quality: string): string {
  if (quality.includes("maj7")) return "major-seventh";
  if (quality.includes("m7")) return "minor-seventh";
  if (quality.includes("7")) return "dominant";
  if (quality.includes("dim")) return "diminished";
  if (quality.includes("aug")) return "augmented";
  if (quality.includes("sus4")) return "suspended-fourth";
  if (quality.includes("sus2")) return "suspended-second";
  if (quality === "m" || quality.startsWith("min")) return "minor";
  return "major";
}
