export type SoundFontPresetOption = {
  bank: number;
  program: number;
  name: string;
  label: string;
  source: "soundfont" | "general-midi";
};

const GM_PRESET_NAMES = [
  "Acoustic Grand Piano",
  "Bright Acoustic Piano",
  "Electric Grand Piano",
  "Honky-tonk Piano",
  "Electric Piano 1",
  "Electric Piano 2",
  "Harpsichord",
  "Clavinet",
  "Celesta",
  "Glockenspiel",
  "Music Box",
  "Vibraphone",
  "Marimba",
  "Xylophone",
  "Tubular Bells",
  "Dulcimer",
  "Drawbar Organ",
  "Percussive Organ",
  "Rock Organ",
  "Church Organ",
  "Reed Organ",
  "Accordion",
  "Harmonica",
  "Tango Accordion",
  "Acoustic Guitar (nylon)",
  "Acoustic Guitar (steel)",
  "Electric Guitar (jazz)",
  "Electric Guitar (clean)",
  "Electric Guitar (muted)",
  "Overdriven Guitar",
  "Distortion Guitar",
  "Guitar Harmonics",
  "Acoustic Bass",
  "Electric Bass (finger)",
  "Electric Bass (pick)",
  "Fretless Bass",
  "Slap Bass 1",
  "Slap Bass 2",
  "Synth Bass 1",
  "Synth Bass 2",
  "Violin",
  "Viola",
  "Cello",
  "Contrabass",
  "Tremolo Strings",
  "Pizzicato Strings",
  "Orchestral Harp",
  "Timpani",
  "String Ensemble 1",
  "String Ensemble 2",
  "Synth Strings 1",
  "Synth Strings 2",
  "Choir Aahs",
  "Voice Oohs",
  "Synth Voice",
  "Orchestra Hit",
  "Trumpet",
  "Trombone",
  "Tuba",
  "Muted Trumpet",
  "French Horn",
  "Brass Section",
  "Synth Brass 1",
  "Synth Brass 2",
  "Soprano Sax",
  "Alto Sax",
  "Tenor Sax",
  "Baritone Sax",
  "Oboe",
  "English Horn",
  "Bassoon",
  "Clarinet",
  "Piccolo",
  "Flute",
  "Recorder",
  "Pan Flute",
  "Blown Bottle",
  "Shakuhachi",
  "Whistle",
  "Ocarina",
  "Lead 1 (square)",
  "Lead 2 (sawtooth)",
  "Lead 3 (calliope)",
  "Lead 4 (chiff)",
  "Lead 5 (charang)",
  "Lead 6 (voice)",
  "Lead 7 (fifths)",
  "Lead 8 (bass + lead)",
  "Pad 1 (new age)",
  "Pad 2 (warm)",
  "Pad 3 (polysynth)",
  "Pad 4 (choir)",
  "Pad 5 (bowed)",
  "Pad 6 (metallic)",
  "Pad 7 (halo)",
  "Pad 8 (sweep)",
  "FX 1 (rain)",
  "FX 2 (soundtrack)",
  "FX 3 (crystal)",
  "FX 4 (atmosphere)",
  "FX 5 (brightness)",
  "FX 6 (goblins)",
  "FX 7 (echoes)",
  "FX 8 (sci-fi)",
  "Sitar",
  "Banjo",
  "Shamisen",
  "Koto",
  "Kalimba",
  "Bagpipe",
  "Fiddle",
  "Shanai",
  "Tinkle Bell",
  "Agogo",
  "Steel Drums",
  "Woodblock",
  "Taiko Drum",
  "Melodic Tom",
  "Synth Drum",
  "Reverse Cymbal",
  "Guitar Fret Noise",
  "Breath Noise",
  "Seashore",
  "Bird Tweet",
  "Telephone Ring",
  "Helicopter",
  "Applause",
  "Gunshot"
];

export const generalMidiPresetOptions: SoundFontPresetOption[] = GM_PRESET_NAMES.map((name, program) => ({
  bank: 0,
  program,
  name,
  label: formatPresetLabel({ bank: 0, program, name }),
  source: "general-midi"
}));

export async function loadSoundFontPresetOptions(soundFontUrl: string): Promise<SoundFontPresetOption[]> {
  const response = await fetch(soundFontUrl);
  if (!response.ok) {
    throw new Error(`Could not load SoundFont preset list from ${soundFontUrl} (${response.status}).`);
  }
  return parseSoundFontPresetOptions(await response.arrayBuffer());
}

export function parseSoundFontPresetOptions(buffer: ArrayBuffer): SoundFontPresetOption[] {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength < 12 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "sfbk") {
    throw new Error("Selected file is not a valid .sf2 SoundFont.");
  }

  const phdr = findChunk(bytes, 12, bytes.byteLength, "phdr");
  if (!phdr) {
    throw new Error("SoundFont preset header (phdr) was not found.");
  }

  const presets: SoundFontPresetOption[] = [];
  for (let offset = phdr.start; offset + 38 <= phdr.end; offset += 38) {
    const name = readPresetName(bytes, offset, 20);
    if (!name || name === "EOP") {
      continue;
    }
    const program = readU16(bytes, offset + 20);
    const bank = readU16(bytes, offset + 22);
    presets.push({
      bank,
      program,
      name,
      label: formatPresetLabel({ bank, program, name }),
      source: "soundfont"
    });
  }

  const unique = new Map<string, SoundFontPresetOption>();
  presets.forEach((preset) => unique.set(`${preset.bank}:${preset.program}:${preset.name}`, preset));
  const options = [...unique.values()].sort((a, b) => a.bank - b.bank || a.program - b.program || a.name.localeCompare(b.name));
  if (options.length === 0) {
    throw new Error("No playable presets were found in the selected SoundFont.");
  }
  return options;
}

export function presetOptionKey(preset: Pick<SoundFontPresetOption, "bank" | "program">): string {
  return `${preset.bank}:${preset.program}`;
}

function formatPresetLabel(preset: Pick<SoundFontPresetOption, "bank" | "program" | "name">): string {
  return `${preset.bank}:${preset.program.toString().padStart(3, "0")} ${preset.name}`;
}

function findChunk(bytes: Uint8Array, start: number, end: number, chunkId: string): { start: number; end: number } | undefined {
  let offset = start;
  while (offset + 8 <= end) {
    const id = ascii(bytes, offset, offset + 4);
    const size = readU32(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = Math.min(dataStart + size, end);

    if (id === chunkId) {
      return { start: dataStart, end: dataEnd };
    }

    if (id === "LIST" && dataStart + 4 <= dataEnd) {
      const nested = findChunk(bytes, dataStart + 4, dataEnd, chunkId);
      if (nested) {
        return nested;
      }
    }

    offset = dataEnd + (size % 2);
  }
  return undefined;
}

function readPresetName(bytes: Uint8Array, start: number, length: number): string {
  const end = start + length;
  let value = "";
  for (let offset = start; offset < end && bytes[offset] !== 0; offset += 1) {
    value += String.fromCharCode(bytes[offset]);
  }
  return value.trim();
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}
