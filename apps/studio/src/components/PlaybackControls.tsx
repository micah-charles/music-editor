import {
  astToPlaybackEvents,
  compareRational,
  compileScoreTimeline,
  midiToPitch,
  pitchToName,
  type FoxChildMusicScore
} from "@foxchild/music-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BasicSynthEngine } from "../music/playback/BasicSynthEngine";
import type { PlaybackEngine, PlaybackEngineMode, PlaybackNoteEvent } from "../music/playback/PlaybackEngine";
import { SamplePlaybackEngine } from "../music/playback/SamplePlaybackEngine";
import { SoundFontPlaybackEngine } from "../music/playback/SoundFontPlaybackEngine";
import { usePlaybackSession } from "../music/playback/session/usePlaybackSession";
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
  trackVolumes?: Readonly<Record<string, number>>;
  label?: string;
  onPresetCatalogChange?: (presets: SoundFontPresetOption[]) => void;
  onTempoChange?: (bpm: number) => void;
}

const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
const transposeOptions = [-12, -7, -5, 0, 5, 7, 12];
const engineLabels: Record<PlaybackEngineMode, string> = {
  "basic-synth": "Basic Synth",
  "sampled-piano": "Sampled Piano",
  soundfont: "Direct SF2"
};

export function PlaybackControls({ score, trackVolumes = {}, label, onPresetCatalogChange, onTempoChange }: PlaybackControlsProps) {
  const { controller, snapshot } = usePlaybackSession();
  const [engineMode, setEngineMode] = useState<PlaybackEngineMode>("soundfont");
  const [soundFontUrl, setSoundFontUrl] = useState(defaultDirectSoundFontUrl);
  const [soundFontLabel, setSoundFontLabel] = useState("GeneralUser GS v1.471.sf2");
  const [transpose, setTranspose] = useState(0);
  const [warning, setWarning] = useState("");
  const soundFontObjectUrlRef = useRef<string>();
  const timeline = useMemo(() => compileScoreTimeline(score), [score]);
  const playbackSourceScore = useMemo<FoxChildMusicScore>(() => ({
    ...score,
    parts: score.parts.map((part) => ({
      ...part,
      muted: false,
      solo: false,
      volume: 1
    }))
  }), [score]);
  const playbackEvents = useMemo<PlaybackNoteEvent[]>(() => {
    return astToPlaybackEvents(playbackSourceScore)
      .filter((event) => !event.isRest && event.pitch && typeof event.midi === "number")
      .map((event) => {
        const midi = Math.min(127, Math.max(0, (event.midi ?? 60) + transpose));
        return {
          id: event.id,
          pitch: pitchToName(midiToPitch(midi)),
          midi,
          measureNumber: event.measureNumber,
          startBeat: event.startBeat,
          durationBeats: event.durationBeats,
          velocity: event.velocity,
          trackVolume: event.trackVolume,
          pan: event.pan,
          partId: event.partId,
          instrument: event.instrument,
          channel: event.channel,
          midiProgram: event.midiProgram,
          midiBank: event.midiBank
        };
      });
  }, [playbackSourceScore, transpose]);

  const createEngine = useCallback((): PlaybackEngine => {
    if (engineMode === "basic-synth") {
      return new BasicSynthEngine();
    }
    if (engineMode === "sampled-piano") {
      return new SamplePlaybackEngine({
        sampleMapUrl: instrumentSampleMaps.piano,
        instrument: "piano"
      });
    }
    return new SoundFontPlaybackEngine(defaultSoundFontConfig(soundFontUrl));
  }, [engineMode, soundFontUrl]);

  useEffect(() => {
    controller.configure({ timeline, events: playbackEvents, bpm: score.global.tempo.bpm, createEngine });
  }, [controller, createEngine, playbackEvents, score.global.tempo.bpm, timeline]);

  useEffect(() => {
    controller.setPartVolumes(trackVolumes);
  }, [controller, trackVolumes]);

  useEffect(() => {
    let cancelled = false;
    if (engineMode !== "soundfont") {
      onPresetCatalogChange?.(generalMidiPresetOptions);
      setWarning("");
      return () => {
        cancelled = true;
      };
    }

    setWarning(`Direct SF2 mode loads a real .sf2 SoundFont. Current source: ${soundFontLabel}.`);
    loadSoundFontPresetOptions(soundFontUrl)
      .then((presets) => {
        if (!cancelled) {
          onPresetCatalogChange?.(presets);
          setWarning(`Direct SF2 is using ${soundFontLabel}. Loaded ${presets.length} track presets.`);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          onPresetCatalogChange?.(generalMidiPresetOptions);
          setWarning(`${errorMessage(error)} Using the General MIDI track preset list.`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [engineMode, onPresetCatalogChange, soundFontLabel, soundFontUrl]);

  useEffect(() => () => {
    if (soundFontObjectUrlRef.current) {
      URL.revokeObjectURL(soundFontObjectUrlRef.current);
    }
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        void togglePlayback();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        void controller.seekToSeconds(snapshot.currentSeconds - 5);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        void controller.seekToSeconds(snapshot.currentSeconds + 5);
      } else if (event.key === "Home") {
        event.preventDefault();
        void controller.seekToSeconds(0);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

  const currentPlaybackMeasureIndex = findCurrentMeasureIndex(timeline.playbackMeasureMap, snapshot.currentScoreTime);
  const currentPlaybackMeasure = timeline.playbackMeasureMap[currentPlaybackMeasureIndex];
  const currentMeasure = timeline.measureMap.find((measure) => measure.measureNumber === currentPlaybackMeasure?.measureNumber);
  const beatInMeasure = currentMeasure
    ? Math.max(1, Math.floor((snapshot.currentSourceTime.numerator / snapshot.currentSourceTime.denominator) - (currentMeasure.start.numerator / currentMeasure.start.denominator)) + 1)
    : 1;

  async function togglePlayback() {
    if (snapshot.status === "playing" || snapshot.status === "loading") {
      controller.pause();
    } else if (snapshot.status === "paused") {
      await controller.resume();
    } else {
      await controller.play();
    }
  }

  function toggleLoop(enabled: boolean) {
    if (!enabled || !currentPlaybackMeasure) {
      controller.setLoop(undefined);
      return;
    }
    controller.setLoop({
      start: currentPlaybackMeasure.start,
      end: timeline.playbackMeasureMap[currentPlaybackMeasureIndex + 1]?.start ?? timeline.playbackDuration
    });
  }

  function selectSoundFontFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) {
      return;
    }
    if (soundFontObjectUrlRef.current) {
      URL.revokeObjectURL(soundFontObjectUrlRef.current);
    }
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
    setSoundFontUrl(value);
    setSoundFontLabel(value.split("/").filter(Boolean).pop() || value || "SoundFont URL");
  }

  return (
    <footer className="playback-bar" aria-label="Playback transport">
      <div className="playback-summary">
        <strong>Playback</strong>
        <span>{label ? `${label} · ` : ""}{score.global.tempo.bpm} bpm · {snapshot.speed}× · {engineLabels[engineMode]}</span>
      </div>

      <div className="transport-buttons">
        <button type="button" onClick={() => void controller.seekToSeconds(0)} aria-label="Jump to start" title="Jump to start (Home)">|◀</button>
        <button type="button" onClick={() => void controller.seekToScoreTime(timeline.playbackMeasureMap[Math.max(0, currentPlaybackMeasureIndex - 1)]?.start ?? timeline.playbackMeasureMap[0].start)} aria-label="Previous measure" title="Previous measure">◀</button>
        <button type="button" className="primary" onClick={() => void togglePlayback()} aria-label={snapshot.status === "playing" ? "Pause" : "Play"} title="Play or pause (Space)">
          {snapshot.status === "playing" || snapshot.status === "loading" ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={() => controller.stop()} aria-label="Stop">Stop</button>
        <button type="button" onClick={() => void controller.seekToScoreTime(timeline.playbackMeasureMap[currentPlaybackMeasureIndex + 1]?.start ?? currentPlaybackMeasure.start)} disabled={!timeline.playbackMeasureMap[currentPlaybackMeasureIndex + 1]} aria-label="Next measure" title="Next measure">▶</button>
      </div>

      <div className="timeline-control">
        <span className="playback-time">{formatTime(snapshot.currentSeconds)}</span>
        <input
          aria-label="Playback position"
          type="range"
          min={0}
          max={Math.max(0.01, snapshot.durationSeconds)}
          step={0.01}
          value={Math.min(snapshot.currentSeconds, snapshot.durationSeconds)}
          onChange={(event) => void controller.seekToSeconds(Number(event.target.value))}
        />
        <span className="playback-time">{formatTime(snapshot.durationSeconds)}</span>
        <span className="measure-position">M{currentMeasure?.measureNumber ?? 1} · B{beatInMeasure}</span>
      </div>

      <label className="tempo-control">
        <span>BPM</span>
        <input aria-label="Playback tempo" type="number" min={20} max={280} value={score.global.tempo.bpm} onChange={(event) => onTempoChange?.(clamp(Number(event.target.value) || 90, 20, 280))} />
      </label>

      <label className="engine-control">
        <span>Engine</span>
        <select aria-label="Playback engine" value={engineMode} onChange={(event) => setEngineMode(event.target.value as PlaybackEngineMode)}>
          <option value="basic-synth">Basic Synth</option>
          <option value="sampled-piano">Sampled Piano</option>
          <option value="soundfont">Direct SF2</option>
        </select>
      </label>

      <label className="volume-control">
        <span>Volume</span>
        <input aria-label="Playback volume" type="range" min={0} max={100} value={Math.round(snapshot.volume * 100)} onChange={(event) => controller.setVolume(Number(event.target.value) / 100)} />
      </label>
      <label className="speed-control">
        <span>Speed</span>
        <select aria-label="Playback speed" value={snapshot.speed} onChange={(event) => controller.setSpeed(Number(event.target.value))}>
          {speeds.map((value) => <option key={value} value={value}>{value}×</option>)}
        </select>
      </label>
      <label className="transpose-control">
        <span>Transpose</span>
        <select aria-label="Playback transpose" value={transpose} onChange={(event) => setTranspose(Number(event.target.value))}>
          {transposeOptions.map((value) => <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}
        </select>
      </label>
      <label className="loop-control inline-toggle">
        <input type="checkbox" checked={Boolean(snapshot.loop)} onChange={(event) => toggleLoop(event.target.checked)} />
        <span>Loop measure</span>
      </label>

      <span className={`playback-state ${snapshot.status}`}>{snapshot.status}</span>
      {engineMode === "soundfont" || snapshot.error || warning ? (
        <details className={`playback-options ${snapshot.error ? "has-error" : ""}`} {...(snapshot.error ? { open: true } : {})}>
          <summary aria-label="More playback settings" title="SoundFont and playback details">•••</summary>
          <div className="playback-options-popover">
            {engineMode === "soundfont" ? (
              <div className="sf2-controls">
                <label className="sf2-url-control">
                  <span>SF2 URL</span>
                  <input value={soundFontUrl.startsWith("blob:") ? "" : soundFontUrl} placeholder={soundFontUrl.startsWith("blob:") ? soundFontLabel : defaultDirectSoundFontUrl} onChange={(event) => updateSoundFontUrl(event.target.value)} />
                </label>
                <label className="sf2-file-control">
                  <span>Local SF2</span>
                  <input type="file" accept=".sf2" onChange={(event) => selectSoundFontFile(event.target.files)} />
                </label>
              </div>
            ) : null}
            {snapshot.error || warning ? <p className="playback-warning" role="status">{snapshot.error || warning}</p> : null}
          </div>
        </details>
      ) : null}
    </footer>
  );
}

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function findCurrentMeasureIndex(
  measures: ReturnType<typeof compileScoreTimeline>["measureMap"],
  scoreTime: ReturnType<typeof compileScoreTimeline>["duration"]
): number {
  let index = 0;
  for (let candidate = 0; candidate < measures.length; candidate += 1) {
    if (compareRational(measures[candidate].start, scoreTime) <= 0) {
      index = candidate;
    } else {
      break;
    }
  }
  return index;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}
