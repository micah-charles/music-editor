import type { Duration, FoxChildMusicScore, MusicEvent, Pitch } from "../ast/types";
import { durationToBeats, durationToMusicXmlType } from "../rhythm/duration";
import { keyToFifths } from "../theory/key";
import { parseChordName } from "../chords/chordDetection";

const DIVISIONS = 24;

export function astToMusicXml(score: FoxChildMusicScore): string {
  const partList = score.parts.map((part, index) => {
    return [
      `    <score-part id="${xml(part.id)}">`,
      `      <part-name>${xml(part.name || `Part ${index + 1}`)}</part-name>`,
      `      <score-instrument id="${xml(part.id)}-instrument">`,
      `        <instrument-name>${xml(part.instrument.name)}</instrument-name>`,
      "      </score-instrument>",
      "    </score-part>"
    ].join("\n");
  }).join("\n");

  const parts = score.parts.map((part) => {
    const measures = part.measures.map((measure, measureIndex) => {
      const attributes = measureIndex === 0
        ? [
          "      <attributes>",
          `        <divisions>${DIVISIONS}</divisions>`,
          "        <key>",
          `          <fifths>${keyToFifths(score.global.key.tonic, score.global.key.mode)}</fifths>`,
          `          <mode>${score.global.key.mode}</mode>`,
          "        </key>",
          "        <time>",
          `          <beats>${score.global.timeSignature.beats}</beats>`,
          `          <beat-type>${score.global.timeSignature.beatType}</beat-type>`,
          "        </time>",
          "        <clef>",
          `          <sign>${clefSign(part.clef)}</sign>`,
          `          <line>${clefLine(part.clef)}</line>`,
          "        </clef>",
          "      </attributes>",
          "      <direction placement=\"above\">",
          "        <direction-type>",
          "          <metronome>",
          "            <beat-unit>quarter</beat-unit>",
          `            <per-minute>${score.global.tempo.bpm}</per-minute>`,
          "          </metronome>",
          "        </direction-type>",
          `        <sound tempo="${score.global.tempo.bpm}"/>`,
          "      </direction>"
        ].join("\n")
        : "";

      const eventXml = measure.events.flatMap((event) => eventToXml(event)).join("\n");
      return [
        `    <measure number="${measure.number}">`,
        attributes,
        eventXml,
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
    `  <movement-title>${xml(score.metadata.title)}</movement-title>`,
    "  <identification>",
    score.metadata.composer ? `    <creator type="composer">${xml(score.metadata.composer)}</creator>` : "",
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

function eventToXml(event: MusicEvent): string[] {
  if (event.type === "annotation") {
    return [
      "      <direction placement=\"above\">",
      "        <direction-type>",
      `          <words>${xml(event.text)}</words>`,
      "        </direction-type>",
      "      </direction>"
    ];
  }

  if (event.type === "rest") {
    return [noteXml({ rest: true, duration: event.duration })];
  }

  if (event.type === "note") {
    return [noteXml({ pitch: event.pitch, duration: event.duration, lyric: event.lyric })];
  }

  return [
    ...(event.semantic?.chordName ? [harmonyXml(event.semantic.chordName)] : []),
    ...event.pitches.map((pitch, index) => noteXml({
      pitch,
      duration: event.duration,
      chord: index > 0,
      lyric: index === 0 ? event.lyric : undefined
    }))
  ];
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
}): string {
  const durationBeats = durationToBeats(options.duration as never);
  const xmlType = durationToMusicXmlType(options.duration as never);
  const dots = Array.from({ length: xmlType.dots }, () => "        <dot/>").join("\n");
  const timeModification = timeModificationXml(options.duration);
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

  return [
    "      <note>",
    options.chord ? "        <chord/>" : "",
    pitch,
    `        <duration>${Math.max(1, Math.round(durationBeats * DIVISIONS))}</duration>`,
    `        <type>${xmlType.type}</type>`,
    dots,
    timeModification,
    lyric,
    "      </note>"
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
