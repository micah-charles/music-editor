import type { ChordProgressionEntry } from "./chordLibraryTypes";

export const demoChordLibraryIndex: ChordProgressionEntry[] = [
  {
    id: "free-midi-c-major-i-v-vi-iv-pop",
    title: "I V vi IV - Hopeful Romantic",
    sourcePath: "free-midi-chords/C Major/4 Chord progressions/Major/pop/I V vi IV.mid",
    key: "C",
    mode: "major",
    style: "pop",
    progression: "I V vi IV",
    tags: ["Hopeful", "Romantic"],
    license: "MIT"
  },
  {
    id: "free-midi-c-major-ii-v-i-pop",
    title: "ii V I - Triumphant",
    sourcePath: "free-midi-chords/C Major/4 Chord progressions/Major/pop/ii V I.mid",
    key: "C",
    mode: "major",
    style: "pop",
    progression: "ii V I",
    tags: ["Triumphant"],
    license: "MIT"
  },
  {
    id: "free-midi-a-minor-i-vi-iii-vii-pop",
    title: "i VI III VII - Nostalgic Romantic",
    sourcePath: "free-midi-chords/A Minor/4 Chord progressions/Minor/pop/i VI III VII.mid",
    key: "A",
    mode: "minor",
    style: "pop",
    progression: "i VI III VII",
    tags: ["Nostalgic", "Romantic"],
    license: "MIT"
  }
];

export function getDemoChordLibraryIndex(): ChordProgressionEntry[] {
  return demoChordLibraryIndex;
}
