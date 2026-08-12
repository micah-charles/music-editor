import { useCallback, useEffect, useMemo, useState } from "react";
import {
  astToPlaybackEvents,
  compileScoreTimeline,
  type FoxChildMusicScore
} from "@foxchild/music-core";
import { BasicSynthEngine } from "../music/playback/BasicSynthEngine";
import type { PlaybackEngine, PlaybackNoteEvent } from "../music/playback/PlaybackEngine";
import { usePlaybackSession } from "../music/playback/session/usePlaybackSession";

interface LearningPlaybackControlsProps {
  score: FoxChildMusicScore;
  maxReplays?: number;
  label?: string;
}

export function LearningPlaybackControls({
  score,
  maxReplays = 4,
  label = "Question audio"
}: LearningPlaybackControlsProps) {
  const { controller, snapshot } = usePlaybackSession();
  const [replays, setReplays] = useState(0);
  const timeline = useMemo(() => compileScoreTimeline(score), [score]);
  const events = useMemo<PlaybackNoteEvent[]>(() =>
    astToPlaybackEvents(score)
      .filter((event) => !event.isRest && event.pitch && typeof event.midi === "number")
      .map((event) => ({
        id: event.id,
        pitch: event.pitch as string,
        midi: event.midi as number,
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
      })),
  [score]);
  const createEngine = useCallback((): PlaybackEngine => new BasicSynthEngine(), []);

  useEffect(() => {
    controller.configure({
      timeline,
      events,
      bpm: score.global.tempo.bpm,
      createEngine
    });
    setReplays(0);
    return () => controller.stop();
  }, [controller, createEngine, events, score.global.tempo.bpm, timeline]);

  async function togglePlayback() {
    if (snapshot.status === "playing" || snapshot.status === "loading") {
      controller.pause();
      return;
    }
    if (snapshot.status === "paused") {
      await controller.resume();
      return;
    }
    if (replays >= maxReplays) return;
    setReplays((current) => current + 1);
    await controller.play();
  }

  return (
    <div className="learning-player" aria-label={label}>
      <button
        type="button"
        className="learning-player-primary"
        aria-label={snapshot.status === "playing" ? "Pause question audio" : "Play question audio"}
        disabled={replays >= maxReplays && snapshot.status !== "playing" && snapshot.status !== "paused"}
        onClick={() => void togglePlayback()}
      >
        {snapshot.status === "playing" || snapshot.status === "loading" ? "Ⅱ" : "▶"}
      </button>
      <button type="button" aria-label="Replay question audio" disabled={replays >= maxReplays} onClick={() => {
        controller.stop();
        setReplays((current) => current + 1);
        void controller.play();
      }}>↻</button>
      <div>
        <strong>{label}</strong>
        <span>{score.global.tempo.bpm} bpm · {Math.max(0, maxReplays - replays)} replay{maxReplays - replays === 1 ? "" : "s"} left</span>
      </div>
      <div className="learning-player-progress" aria-hidden="true">
        <span style={{ width: `${snapshot.durationSeconds > 0 ? snapshot.currentSeconds / snapshot.durationSeconds * 100 : 0}%` }} />
      </div>
    </div>
  );
}
