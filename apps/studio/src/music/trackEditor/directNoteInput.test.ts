import { describe, expect, it } from "vitest";
import { directNotesToEvents, parseDirectNoteInput } from "./directNoteInput";

describe("Track Editor direct note input", () => {
  it("parses notes, accidentals, chords and rests", () => {
    const result = parseDirectNoteInput("C4 q G#5 h Bb3 1/8 C4,E4,G4 q R h");
    expect(result.valid).toBe(true);
    expect(result.entries.map((entry) => entry.kind)).toEqual(["note", "note", "note", "chord", "rest"]);
    expect(result.entries[2].pitches[0]).toMatchObject({ step: "B", alter: -1, octave: 3 });
  });

  it("supports triplets, grace notes, bare pitches and thirty-second notes", () => {
    const result = parseDirectNoteInput("C triplet 1/8 grace D5 1/16 F#4 32");
    expect(result.valid).toBe(true);
    expect(result.entries[0].duration.tuplet).toMatchObject({ actualNotes: 3, normalNotes: 2 });
    expect(result.entries[1].grace).toBe(true);
    expect(result.entries[2].duration).toMatchObject({ value: "thirty-second", beats: 0.125 });
    expect(directNotesToEvents(result.entries, "input")[1]).toMatchObject({
      type: "note",
      notation: { grace: { slash: true } }
    });
  });

  it("returns an inline validation error without partial commit", () => {
    const result = parseDirectNoteInput("C4 q H9 h");
    expect(result.valid).toBe(false);
    expect(result.errorToken).toBe("H9");
    expect(result.error).toContain("not a valid pitch");
  });
});
