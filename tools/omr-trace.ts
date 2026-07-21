import { readFileSync } from "node:fs";
import { astToMusicXml, musicXmlToAst, pitchToName, type FoxChildMusicScore, type MusicEvent } from "../packages/music-core/src/index";

const args = process.argv.slice(2);
const input = option("--input");
const measureLimit = Math.max(1, Number(option("--measures") || 6));

if (!input) {
  throw new Error("Usage: npm run omr:trace -- --input <musicxml> --measures 1-6");
}

const xml = readFileSync(input, "utf8");
const imported = musicXmlToAst(xml);
const exportedXml = astToMusicXml(imported);
const reimported = musicXmlToAst(exportedXml);

console.log(`OMR fidelity trace: ${input}`);
console.log(`Measures: 1-${measureLimit}`);
console.log("");
printRawSummary("Raw MusicXML", xml);
printAstSummary("Imported AST", imported);
printRawSummary("Exported MusicXML", exportedXml);
printAstSummary("Reimported AST", reimported);

function option(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (name === "--measures" && value?.includes("-")) return value.split("-").at(-1);
  return value;
}

function printRawSummary(label: string, source: string): void {
  const limited = firstMeasures(source, measureLimit);
  console.log(label);
  console.log(`  metadata: ${tag(source, "work-title") || tag(source, "movement-title") || "(missing)"}`);
  console.log(`  key fifths: ${tag(limited, "fifths") || "(missing)"}`);
  console.log(`  tempo: ${tag(limited, "per-minute") || attribute(limited, "sound", "tempo") || "(missing)"}`);
  console.log(`  voices: ${uniqueTags(limited, "voice").join(", ") || "(none)"}`);
  console.log(`  staves: ${uniqueTags(limited, "staff").join(", ") || "(none)"}`);
  console.log(`  notes: ${count(limited, "note")}  rests: ${count(limited, "rest")}`);
  console.log(`  dynamics: ${dynamicNames(limited).join(", ") || "0"}`);
  console.log(`  slurs: ${count(limited, "slur")}  ties: ${count(limited, "tie")}  beams: ${count(limited, "beam")}  staccatos: ${count(limited, "staccato")}`);
  console.log("");
}

function printAstSummary(label: string, score: FoxChildMusicScore): void {
  const measures = score.parts.flatMap((part) => part.measures.filter((measure) => measure.number <= measureLimit));
  const events = measures.flatMap((measure) => measure.events);
  const notes = events.flatMap((event) => pitches(event));
  const rests = events.filter((event) => event.type === "rest");
  const dynamics = events.flatMap((event) => event.type === "direction" && event.dynamic ? [event.dynamic] : []);
  const voices = [...new Set(events.map((event) => `${event.staff ?? 1}:${event.voice ?? 1}`))].sort();
  console.log(label);
  console.log(`  metadata: title=${score.metadata.title}; subtitle=${score.metadata.subtitle ?? "(missing)"}; arranger=${score.metadata.arranger ?? "(missing)"}`);
  console.log(`  key: fifths=${score.global.key.fifths ?? "derived"}; ${score.global.key.tonic} ${score.global.key.mode}`);
  console.log(`  tempo: ${score.global.tempo.bpm} (${score.global.tempo.source ?? "unknown source"})`);
  console.log(`  parts/staves/voices: ${score.parts.length} / ${score.parts.map((part) => part.staffCount ?? 1).join(",")} / ${voices.join(", ")}`);
  console.log(`  pitches: ${notes.length} [${notes.slice(0, 16).join(", ")}${notes.length > 16 ? ", ..." : ""}]`);
  console.log(`  rests: ${rests.length}; durations=${rests.map((rest) => rest.type === "rest" ? `${rest.duration.value}:${rest.duration.beats}` : "").join(", ") || "(none)"}`);
  console.log(`  dynamics: ${dynamics.join(", ") || "0"}`);
  console.log(`  slurs: ${notationCount(events, "slurs")}  ties: ${events.filter((event) => event.type === "note" && event.tie).length}  beams: ${notationCount(events, "beams")}  staccatos: ${events.filter(hasStaccato).length}`);
  console.log(`  warnings/repairs: ${(score.sourceMetadata?.warnings ?? []).join(" | ") || "(none)"}`);
  console.log("");
}

function pitches(event: MusicEvent): string[] {
  if (event.type === "note") return [pitchToName(event.pitch)];
  if (event.type === "chord") return event.pitches.map(pitchToName);
  return [];
}

function notationCount(events: MusicEvent[], key: "slurs" | "beams"): number {
  return events.reduce((total, event) => total + (event.type === "note" || event.type === "chord" ? event.notation?.[key]?.length ?? 0 : 0), 0);
}

function hasStaccato(event: MusicEvent): boolean {
  return (event.type === "note" || event.type === "chord") && Boolean(event.notation?.articulations?.includes("staccato"));
}

function firstMeasures(source: string, maximum: number): string {
  return [...source.matchAll(/<measure\b[\s\S]*?<\/measure>/gi)].slice(0, maximum).map((match) => match[0]).join("\n");
}

function tag(source: string, name: string): string | undefined {
  return source.match(new RegExp(`<${name}\\b[^>]*>([^<]*)<\\/${name}>`, "i"))?.[1]?.trim();
}

function uniqueTags(source: string, name: string): string[] {
  return [...new Set([...source.matchAll(new RegExp(`<${name}\\b[^>]*>([^<]*)<\\/${name}>`, "gi"))].map((match) => match[1].trim()))].sort();
}

function attribute(source: string, tagName: string, name: string): string | undefined {
  return source.match(new RegExp(`<${tagName}\\b[^>]*\\b${name}="([^"]+)"`, "i"))?.[1];
}

function count(source: string, name: string): number {
  return [...source.matchAll(new RegExp(`<${name}(?:\\s|/|>)`, "gi"))].length;
}

function dynamicNames(source: string): string[] {
  return [...source.matchAll(/<dynamics\b[^>]*>\s*<([a-z]+)\b/gi)].map((match) => match[1]);
}
