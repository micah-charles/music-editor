import { midiToPitch, pitchToName } from "@foxchild/music-core";

export const CHORD_CAPTURE_WINDOW_MS = 80;

export type MidiRecordMode = "off" | "insert-notes" | "insert-chords";

export type MidiInputDevice = {
  id: string;
  name: string;
  manufacturer?: string;
  state?: string;
  connection?: string;
};

export type MidiNoteMessage = {
  type: "note-on" | "note-off";
  midi: number;
  pitch: string;
  velocity: number;
};

type MidiMessageEventLike = {
  data: ArrayLike<number>;
};

type MidiInputLike = {
  id: string;
  name?: string;
  manufacturer?: string;
  state?: string;
  connection?: string;
  onmidimessage: ((event: MidiMessageEventLike) => void) | null;
};

type MidiInputMapLike = {
  forEach(callback: (input: MidiInputLike, key: string) => void): void;
  get(id: string): MidiInputLike | undefined;
};

export type MidiAccessLike = {
  inputs: MidiInputMapLike;
  onstatechange: (() => void) | null;
};

type NavigatorWithMidi = Navigator & {
  requestMIDIAccess?: () => Promise<MidiAccessLike>;
};

export async function requestMidiInputs(): Promise<{ access: MidiAccessLike; devices: MidiInputDevice[] }> {
  const requestMIDIAccess = (navigator as NavigatorWithMidi).requestMIDIAccess;
  if (!requestMIDIAccess) {
    throw new Error("This browser does not expose Web MIDI. Chrome or Edge over localhost/HTTPS is recommended.");
  }

  const access = await requestMIDIAccess.call(navigator);
  return { access, devices: listMidiInputDevices(access) };
}

export function listMidiInputDevices(access: MidiAccessLike): MidiInputDevice[] {
  const devices: MidiInputDevice[] = [];
  access.inputs.forEach((input) => {
    devices.push({
      id: input.id,
      name: input.name || "MIDI input",
      manufacturer: input.manufacturer,
      state: input.state,
      connection: input.connection
    });
  });
  return devices;
}

export function attachMidiInput(
  access: MidiAccessLike,
  inputId: string,
  onMessage: (message: MidiNoteMessage) => void
): () => void {
  const input = access.inputs.get(inputId);
  if (!input) {
    throw new Error("Selected MIDI input is no longer available.");
  }

  const previousHandler = input.onmidimessage;
  const nextHandler = (event: MidiMessageEventLike) => {
    const message = parseMidiMessage(event.data);
    if (message) {
      onMessage(message);
    }
  };
  input.onmidimessage = nextHandler;

  return () => {
    if (input.onmidimessage === nextHandler) {
      input.onmidimessage = previousHandler ?? null;
    }
  };
}

export function parseMidiMessage(data: ArrayLike<number>): MidiNoteMessage | null {
  if (data.length < 3) {
    return null;
  }

  const status = data[0] & 0xf0;
  const midi = data[1];
  const velocity = data[2];

  if (status === 0x90 && velocity > 0) {
    return {
      type: "note-on",
      midi,
      pitch: midiNumberToPitchName(midi),
      velocity
    };
  }

  if (status === 0x80 || (status === 0x90 && velocity === 0)) {
    return {
      type: "note-off",
      midi,
      pitch: midiNumberToPitchName(midi),
      velocity: 0
    };
  }

  return null;
}

export function midiNumberToPitchName(midi: number): string {
  return pitchToName(midiToPitch(midi));
}
