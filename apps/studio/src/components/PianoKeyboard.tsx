import { midiToPitch, parsePitchName, pitchToMidi, pitchToName } from "@foxchild/music-core";
import type { CSSProperties, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react";

export type PianoKeyboardProps = {
  range?: { from: string; to: string };
  activePitches: string[];
  playingPitches?: string[];
  pressedPitches?: string[];
  invalidPitches?: string[];
  selectedPitches?: string[];
  onKeyDown?: (pitch: string) => void;
  onKeyUp?: (pitch: string) => void;
  onInsertNote?: (pitch: string) => void;
  onInsertChord?: (pitches: string[]) => void;
  onKeyPress?: (pitch: string, modifiers: { shiftKey: boolean }) => void;
};

type PianoKey = {
  pitch: string;
  midi: number;
  isBlack: boolean;
  whiteIndex: number;
};

const blackPitchClasses = new Set([1, 3, 6, 8, 10]);

export function PianoKeyboard({
  range = { from: "C3", to: "C6" },
  activePitches,
  playingPitches = [],
  pressedPitches = [],
  invalidPitches = [],
  selectedPitches = [],
  onKeyDown,
  onKeyUp,
  onInsertNote,
  onInsertChord,
  onKeyPress
}: PianoKeyboardProps) {
  const keys = buildKeys(range.from, range.to);
  const whiteKeys = keys.filter((key) => !key.isBlack);
  const blackKeys = keys.filter((key) => key.isBlack);
  const activeSet = new Set([...activePitches, ...playingPitches, ...pressedPitches]);
  const playingSet = new Set(playingPitches);
  const pressedSet = new Set(pressedPitches);
  const invalidSet = new Set(invalidPitches);
  const selectedSet = new Set(selectedPitches);

  function pressKey(pitch: string, shiftKey: boolean) {
    onKeyDown?.(pitch);
    if (onKeyPress) {
      onKeyPress(pitch, { shiftKey });
    } else if (shiftKey && selectedPitches.length > 0) {
      onInsertChord?.([...new Set([...selectedPitches, pitch])]);
    } else {
      onInsertNote?.(pitch);
    }
  }

  function mouseDown(pitch: string, event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    pressKey(pitch, event.shiftKey);
  }

  function touchStart(pitch: string, event: ReactTouchEvent<HTMLButtonElement>) {
    event.preventDefault();
    pressKey(pitch, false);
  }

  function keyClass(key: PianoKey) {
    return [
      "piano-key",
      key.isBlack ? "black" : "white",
      activeSet.has(key.pitch) ? "active" : "",
      playingSet.has(key.pitch) ? "playing" : "",
      pressedSet.has(key.pitch) ? "pressed" : "",
      selectedSet.has(key.pitch) ? "selected" : "",
      invalidSet.has(key.pitch) ? "invalid" : ""
    ].filter(Boolean).join(" ");
  }

  return (
    <div className="piano-keyboard" style={{ "--white-key-count": whiteKeys.length } as CSSProperties}>
      <div className="piano-white-keys">
        {whiteKeys.map((key) => (
          <button
            key={key.pitch}
            type="button"
            className={keyClass(key)}
            aria-label={`Piano key ${key.pitch}`}
            tabIndex={-1}
            onMouseDown={(event) => mouseDown(key.pitch, event)}
            onMouseUp={() => onKeyUp?.(key.pitch)}
            onMouseLeave={() => onKeyUp?.(key.pitch)}
            onTouchStart={(event) => touchStart(key.pitch, event)}
            onTouchEnd={() => onKeyUp?.(key.pitch)}
          >
            <span>{key.pitch}</span>
          </button>
        ))}
      </div>
      <div className="piano-black-keys">
        {blackKeys.map((key) => (
          <button
            key={key.pitch}
            type="button"
            className={keyClass(key)}
            style={{ left: `${(key.whiteIndex / whiteKeys.length) * 100}%` }}
            tabIndex={-1}
            onMouseDown={(event) => mouseDown(key.pitch, event)}
            onMouseUp={() => onKeyUp?.(key.pitch)}
            onMouseLeave={() => onKeyUp?.(key.pitch)}
            onTouchStart={(event) => touchStart(key.pitch, event)}
            onTouchEnd={() => onKeyUp?.(key.pitch)}
          >
            <span>{key.pitch}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function buildKeys(from: string, to: string): PianoKey[] {
  const fromMidi = pitchToMidi(parsePitchName(from));
  const toMidi = pitchToMidi(parsePitchName(to));
  const low = Math.min(fromMidi, toMidi);
  const high = Math.max(fromMidi, toMidi);
  const keys: PianoKey[] = [];
  let whiteIndex = 0;

  for (let midi = low; midi <= high; midi += 1) {
    const pitch = pitchToName(midiToPitch(midi));
    const isBlack = blackPitchClasses.has(((midi % 12) + 12) % 12);
    if (isBlack) {
      keys.push({ pitch, midi, isBlack, whiteIndex });
    } else {
      keys.push({ pitch, midi, isBlack, whiteIndex });
      whiteIndex += 1;
    }
  }

  return keys;
}
