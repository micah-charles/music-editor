import { astToPlaybackEvents, type FoxChildMusicScore } from "@foxchild/music-core";
import { useEffect, useMemo, useRef, useState } from "react";
import { BasicSynthEngine } from "../music/playback/BasicSynthEngine";
import type { PlaybackEngine, PlaybackEngineMode, PlaybackNoteEvent } from "../music/playback/PlaybackEngine";
import { SamplePlaybackEngine } from "../music/playback/SamplePlaybackEngine";
import { SoundFontPlaybackEngine } from "../music/playback/SoundFontPlaybackEngine";
import {
  defaultDirectSoundFontUrl,
  defaultSoundFontConfig,
  instrumentSampleMaps
} from "../music/playback/soundfontConfig";
import {
  generalMidiPresetOptions,
  loadSoundFontPresetOptions,
  type SoundFontPresetOption
} from "../music/playback/soundfontPresets";

interface PlaybackControlsProps {
  score: FoxChildMusicScore;
  label?: string;
  onActivePitchesChange?: (pitches: string[]) => void;
  onActiveEventsChange?: (events: PlaybackNoteEvent[]) => void;
  onPresetCatalogChange?: (presets: SoundFontPresetOption[]) => void;
}

type PlaybackState = "stopped" | "playing" | "paused";

const speeds = [0.5, 0.75, 1, 1.25, 1.5];
const engineLabels: Record<PlaybackEngineMode, string> = {
  "basic-synth": "Basic Synth",
  "sampled-piano": "Sampled Piano",
  soundfont: "Direct SF2"
};

export function PlaybackControls({ score, label, onActivePitchesChange, onActiveEventsChange, onPresetCatalogChange }: PlaybackControlsProps) {
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(0.8);
  const [engineMode, setEngineMode] = useState<PlaybackEngineMode>("basic-synth");
  const [soundFontUrl, setSoundFontUrl] = useState(defaultDirectSoundFontUrl);
  const [soundFontLabel, setSoundFontLabel] = useState("default.sf2");
  const [state, setState] = useState<PlaybackState>("stopped");
  const [warning, setWarning] = useState("");
  const engineRef = useRef<PlaybackEngine | null>(null);
  const finishTimerRef = useRef<number | undefined>();
  const soundFontObjectUrlRef = useRef<string | undefined>();
  const playbackEvents = useMemo<PlaybackNoteEvent[]>(() => {
    return astToPlaybackEvents(score)
      .filter((event) => !event.isRest && event.pitch && typeof event.midi === "number")
      .map((event) => ({
        id: event.id,
        pitch: event.pitch ?? "C4",
        midi: event.midi ?? 60,
        measureNumber: event.measureNumber,
        startBeat: event.startBeat,
        durationBeats: event.durationBeats,
        velocity: event.velocity,
        isRest: event.isRest,
        partId: event.partId,
        instrument: event.instrument,
        channel: event.channel,
        midiProgram: event.midiProgram,
        midiBank: event.midiBank
      }));
  }, [score]);
  const totalBeats = playbackEvents.reduce((max, event) => Math.max(max, event.startBeat + event.durationBeats), 0);

  useEffect(() => {
    stop();
    engineRef.current?.dispose?.();
    engineRef.current = null;
    setWarning(engineMode === "soundfont" ? `Direct SF2 mode loads a real .sf2 SoundFont. Current source: ${soundFontLabel}.` : "");
  }, [engineMode, soundFontUrl, soundFontLabel]);

  useEffect(() => {
    let cancelled = false;

    if (engineMode !== "soundfont") {
      onPresetCatalogChange?.(generalMidiPresetOptions);
      return () => {
        cancelled = true;
      };
    }

    loadSoundFontPresetOptions(soundFontUrl)
      .then((presets) => {
        if (cancelled) {
          return;
        }
        onPresetCatalogChange?.(presets);
        setWarning(`Direct SF2 playback is using ${soundFontLabel}. Loaded ${presets.length} presets for the Tracks instrument list.`);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        onPresetCatalogChange?.(generalMidiPresetOptions);
        setWarning(`${errorMessage(error)} Falling back to the General MIDI preset list in Tracks.`);
      });

    return () => {
      cancelled = true;
    };
  }, [engineMode, onPresetCatalogChange, soundFontLabel, soundFontUrl]);

  useEffect(() => {
    return () => {
      if (soundFontObjectUrlRef.current) {
        URL.revokeObjectURL(soundFontObjectUrlRef.current);
      }
    };
  }, []);

  async function play() {
    const secondsPerBeat = 60 / (score.global.tempo.bpm * speed);
    try {
      if (finishTimerRef.current) {
        window.clearTimeout(finishTimerRef.current);
      }
      const engine = getEngine();
      await engine.play(playbackEvents, {
        bpm: score.global.tempo.bpm,
        speed,
        volume,
        onActivePitchesChange,
        onActiveEventsChange
      });
      setWarning(engineMode === "soundfont" ? `Direct SF2 playback is using ${soundFontLabel}.` : "");
      setState("playing");
      finishTimerRef.current = window.setTimeout(() => setState("stopped"), Math.ceil((totalBeats * secondsPerBeat + 0.4) * 1000));
    } catch (error) {
      setState("stopped");
      onActivePitchesChange?.([]);
      onActiveEventsChange?.([]);
      setWarning(errorMessage(error));
    }
  }

  function pauseOrResume() {
    if (state === "playing") {
      engineRef.current?.pause?.();
      setState("paused");
    } else if (state === "paused") {
      if (engineRef.current?.resume) {
        engineRef.current.resume();
      } else {
        void play();
      }
      setState("playing");
    }
  }

  function stop(resetState = true) {
    if (finishTimerRef.current) {
      window.clearTimeout(finishTimerRef.current);
    }
    engineRef.current?.stop();
    onActivePitchesChange?.([]);
    onActiveEventsChange?.([]);
    if (resetState) {
      setState("stopped");
    }
  }

  function getEngine(): PlaybackEngine {
    if (!engineRef.current) {
      if (engineMode === "basic-synth") {
        engineRef.current = new BasicSynthEngine();
      } else if (engineMode === "sampled-piano") {
        engineRef.current = new SamplePlaybackEngine({
          sampleMapUrl: instrumentSampleMaps.piano,
          instrument: "piano"
        });
      } else {
        engineRef.current = new SoundFontPlaybackEngine(defaultSoundFontConfig(soundFontUrl));
      }
    }
    return engineRef.current;
  }

  function selectSoundFontFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    if (soundFontObjectUrlRef.current) {
      URL.revokeObjectURL(soundFontObjectUrlRef.current);
    }

    stop();
    engineRef.current?.dispose?.();
    engineRef.current = null;

    const objectUrl = URL.createObjectURL(file);
    soundFontObjectUrlRef.current = objectUrl;
    setSoundFontUrl(objectUrl);
    setSoundFontLabel(file.name);
    setWarning(`Selected local SoundFont: ${file.name}.`);
  }

  function updateSoundFontUrl(value: string) {
    if (soundFontObjectUrlRef.current) {
      URL.revokeObjectURL(soundFontObjectUrlRef.current);
      soundFontObjectUrlRef.current = undefined;
    }

    stop();
    engineRef.current?.dispose?.();
    engineRef.current = null;

    setSoundFontUrl(value);
    setSoundFontLabel(value.split("/").filter(Boolean).pop() || value || "SoundFont URL");
  }

  return (
    <footer className="playback-bar">
      <div>
        <strong>Playback</strong>
        <span>{label ? `${label} · ` : ""}{score.global.tempo.bpm} bpm · {speed}× · {engineLabels[engineMode]}</span>
      </div>
      <div className="transport-buttons">
        <button type="button" className="primary" onClick={() => void play()}>Play</button>
        <button type="button" onClick={pauseOrResume} disabled={state === "stopped"}>
          {state === "paused" ? "Resume" : "Pause"}
        </button>
        <button type="button" onClick={() => stop()}>Stop</button>
      </div>
      <label className="engine-control">
        <span>Sound Engine</span>
        <select value={engineMode} onChange={(event) => setEngineMode(event.target.value as PlaybackEngineMode)}>
          <option value="basic-synth">Basic Synth</option>
          <option value="sampled-piano">Sampled Piano</option>
          <option value="soundfont">Direct SF2</option>
        </select>
      </label>
      {engineMode === "soundfont" ? (
        <>
          <label className="sf2-url-control">
            <span>SF2 URL</span>
            <input
              value={soundFontUrl.startsWith("blob:") ? "" : soundFontUrl}
              placeholder={soundFontUrl.startsWith("blob:") ? soundFontLabel : defaultDirectSoundFontUrl}
              onChange={(event) => updateSoundFontUrl(event.target.value)}
            />
          </label>
          <label className="sf2-file-control">
            <span>Local SF2</span>
            <input type="file" accept=".sf2" onChange={(event) => selectSoundFontFile(event.target.files)} />
          </label>
        </>
      ) : null}
      <label className="volume-control">
        <span>Volume</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(event) => setVolume(Number(event.target.value) / 100)}
        />
      </label>
      <label className="speed-control">
        <span>Speed</span>
        <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
          {speeds.map((value) => <option key={value} value={value}>{value}×</option>)}
        </select>
      </label>
      <span className={`playback-state ${state}`}>{state}</span>
      {warning ? <p className="playback-warning">{warning}</p> : null}
    </footer>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error) {
    return error;
  }
  if (error && typeof error === "object") {
    const namedError = error as { message?: unknown; name?: unknown; type?: unknown };
    const details = [
      typeof namedError.name === "string" ? namedError.name : "",
      typeof namedError.message === "string" ? namedError.message : "",
      typeof namedError.type === "string" ? namedError.type : ""
    ].filter(Boolean);
    if (details.length > 0) {
      return details.join(": ");
    }
    try {
      const json = JSON.stringify(error);
      if (json && json !== "{}") {
        return json;
      }
    } catch {
      // Fall through to String(error).
    }
    return String(error);
  }
  return `Playback could not start${error === undefined ? ": unknown error." : `: ${String(error)}.`}`;
}
