import { useEffect, useMemo, useRef, useState } from "react";
import {
  countNotes,
  durationLabelForBeats,
  measureIssueText,
  type FoxChildMusicScore,
  type MeasureValidationResult
} from "@foxchild/music-core";
import type { PlaybackNoteEvent } from "../music/playback/PlaybackEngine";
import { AutoScrollController } from "../music/notation/AutoScrollController";
import { buildOsmdPositionIndex } from "../music/notation/buildOsmdPositionIndex";
import { ScoreCursorController } from "../music/notation/ScoreCursorController";
import type { OsmdCursorLike } from "../music/notation/OsmdPositionIndex";
import { usePlaybackSession } from "../music/playback/session/usePlaybackSession";

interface ScoreViewerProps {
  score: FoxChildMusicScore;
  musicXml: string;
  measureIssues: MeasureValidationResult[];
  activePlaybackEvents?: PlaybackNoteEvent[];
  showValidationDetails?: boolean;
  canRevert: boolean;
  onAddMissingRest: (issue: MeasureValidationResult) => void;
  onStretchLastNote: (issue: MeasureValidationResult) => void;
  onRevertChange: () => void;
}

const LARGE_SCORE_MEASURE_THRESHOLD = 80;
const LARGE_SCORE_NOTE_THRESHOLD = 1000;

export function ScoreViewer({
  score,
  musicXml,
  measureIssues,
  activePlaybackEvents = [],
  showValidationDetails = false,
  canRevert,
  onAddMissingRest,
  onStretchLastNote,
  onRevertChange
}: ScoreViewerProps) {
  const { snapshot: playbackSession } = usePlaybackSession();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const osmdRef = useRef<OsmdInstance | null>(null);
  const cursorControllerRef = useRef<ScoreCursorController | null>(null);
  const autoScrollRef = useRef(new AutoScrollController());
  const activePlaybackEventsRef = useRef<PlaybackNoteEvent[]>(activePlaybackEvents);
  const [error, setError] = useState("");
  const [isRendering, setIsRendering] = useState(false);
  const [showFullScore, setShowFullScore] = useState(false);
  const [followPlayback, setFollowPlayback] = useState(true);
  const noteCount = useMemo(() => score.parts.reduce((sum, part) => sum + countNotes(part.measures), 0), [score]);
  const measureCount = useMemo(() => score.parts.reduce((sum, part) => sum + part.measures.length, 0), [score]);
  const isLarge = measureCount > LARGE_SCORE_MEASURE_THRESHOLD || noteCount > LARGE_SCORE_NOTE_THRESHOLD;
  const hasUnderfilled = measureIssues.some((issue) => issue.status === "underfilled");
  const hasOverfilled = measureIssues.some((issue) => issue.status === "overfilled");
  const activePlaybackSummary = useMemo(() => summarizeActivePlayback(activePlaybackEvents), [activePlaybackEvents]);

  useEffect(() => {
    let cancelled = false;

    async function renderScore() {
      if (!containerRef.current) {
        return;
      }

      setIsRendering(true);
      setError("");
      osmdRef.current?.cursor?.hide?.();
      osmdRef.current = null;
      cursorControllerRef.current = null;
      containerRef.current.innerHTML = "";

      try {
        const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
        if (cancelled || !containerRef.current) {
          return;
        }
        const osmd = new OpenSheetMusicDisplay(containerRef.current, {
          backend: "svg",
          autoResize: true,
          cursorsOptions: [{ type: 0, color: "#f4c84a", alpha: 0.52, follow: false }],
          disableCursor: false,
          drawTitle: true,
          drawingParameters: "compacttight",
          followCursor: false
        });
        await osmd.load(musicXml);
        if (!cancelled) {
          await osmd.render();
          osmd.cursor?.hide?.();
          osmdRef.current = osmd as OsmdInstance;
          if (osmd.cursor) {
            const index = buildOsmdPositionIndex(osmd.cursor);
            cursorControllerRef.current = new ScoreCursorController(osmd.cursor, index);
            cursorControllerRef.current.moveTo(playbackSession.currentSourceTime, playbackSession.status === "playing" || playbackSession.status === "paused");
          }
        }
      } catch (renderError) {
        if (!cancelled) {
          setError((renderError as Error).message);
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    }

    void renderScore();

    return () => {
      cancelled = true;
    };
  }, [musicXml]);

  useEffect(() => {
    activePlaybackEventsRef.current = activePlaybackEvents;
  }, [activePlaybackEvents]);

  useEffect(() => {
    const visible = playbackSession.status === "playing" || playbackSession.status === "paused";
    cursorControllerRef.current?.moveTo(playbackSession.currentSourceTime, visible);
    if (visible && followPlayback && frameRef.current) {
      autoScrollRef.current.follow(frameRef.current);
    }
  }, [followPlayback, playbackSession.currentSourceTime, playbackSession.status]);

  return (
    <div className={`score-viewer ${showFullScore ? "full-score" : ""}`}>
      <div className="score-viewer-toolbar">
        <span>{noteCount} notes</span>
        {activePlaybackSummary ? (
          <span className="score-active-summary">{activePlaybackSummary}</span>
        ) : isLarge ? <span>Large score mode recommended</span> : <span>OSMD SVG renderer</span>}
        <div className="score-viewer-actions">
          {!followPlayback ? (
            <button type="button" onClick={() => {
              autoScrollRef.current.resume();
              setFollowPlayback(true);
            }}>Follow</button>
          ) : null}
          <button type="button" onClick={() => setShowFullScore((current) => !current)}>
            {showFullScore ? "Frame View" : "Show All Bars"}
          </button>
          <button type="button" onClick={() => window.print()}>Print</button>
        </div>
      </div>
      {isRendering ? <p className="render-state">Rendering notation…</p> : null}
      {error ? (
        <div className="render-error">
          <p>Notation renderer could not display this score.</p>
          <pre>{error}</pre>
        </div>
      ) : null}
      {showValidationDetails && measureIssues.length > 0 ? (
        <div className="measure-warning-panel">
          {measureIssues.map((issue) => (
            <article className={`measure-warning-card ${issue.status}`} key={`${issue.partId}-${issue.measure}`}>
              <div>
                <strong>{measureIssueText(issue)}</strong>
                {issue.status === "underfilled" ? (
                  <p>
                    Bar {issue.measure} is short by {article(durationLabelForBeats(issue.missingBeats ?? 0))} {durationLabelForBeats(issue.missingBeats ?? 0)} note.
                    A {score.global.timeSignature.beats}/{score.global.timeSignature.beatType} bar must contain exactly {issue.beatsExpected} beats.
                  </p>
                ) : null}
                {issue.status === "overfilled" ? (
                  <p>
                    Bar {issue.measure} has too many beats for {score.global.timeSignature.beats}/{score.global.timeSignature.beatType}.
                  </p>
                ) : null}
                <ul>
                  {issue.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}
                </ul>
              </div>
              <div className="measure-fix-actions">
                {issue.status === "underfilled" ? (
                  <>
                    <button type="button" onClick={() => onAddMissingRest(issue)}>
                      Add {durationLabelForBeats(issue.missingBeats ?? 0)} rest
                    </button>
                    <button type="button" onClick={() => onStretchLastNote(issue)}>Stretch last note</button>
                  </>
                ) : null}
                <button type="button" onClick={onRevertChange} disabled={!canRevert}>Revert change</button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {showValidationDetails && measureIssues.length > 0 ? (
        <div className="measure-status-strip" aria-label="Measure validation status">
          {measureIssues.map((issue) => (
            <span className={`measure-status-tile ${issue.status}`} key={`${issue.partId}-${issue.measure}-tile`}>
              Measure {issue.measure}: {issue.status}
            </span>
          ))}
        </div>
      ) : null}
      <div
        className={`score-paper-frame ${hasUnderfilled ? "has-underfilled-measure" : ""} ${hasOverfilled ? "has-overfilled-measure" : ""}`}
        ref={frameRef}
        onWheel={() => {
          autoScrollRef.current.suspend();
          setFollowPlayback(false);
        }}
        onTouchMove={() => {
          autoScrollRef.current.suspend();
          setFollowPlayback(false);
        }}
      >
        <div className="score-paper" ref={containerRef} />
      </div>
    </div>
  );
}

function article(label: string): "a" | "an" {
  return /^[aeiou]/i.test(label) ? "an" : "a";
}

type OsmdInstance = {
  cursor?: OsmdCursorLike;
};

function summarizeActivePlayback(activeEvents: PlaybackNoteEvent[]): string {
  if (activeEvents.length === 0) {
    return "";
  }

  const pitches = [...new Set(activeEvents.map((event) => event.pitch))].slice(0, 4).join(", ");
  const measureNumber = Math.min(...activeEvents.map((event) => event.measureNumber ?? 1));
  return `Playing ${pitches}${activeEvents.length > 4 ? "..." : ""} · measure ${measureNumber}`;
}
