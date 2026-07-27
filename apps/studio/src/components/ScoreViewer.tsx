import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildMeasureMap,
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
const MIN_SCORE_ZOOM = 0.35;
const MAX_SCORE_ZOOM = 1.25;
const SCORE_ZOOM_STEP = 0.1;

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
  const autoScrollRef = useRef(new AutoScrollController());
  const previousPlaybackStatusRef = useRef(playbackSession.status);
  const [error, setError] = useState("");
  const [isRendering, setIsRendering] = useState(false);
  const [cursorController, setCursorController] = useState<ScoreCursorController | null>(null);
  const [showFullScore, setShowFullScore] = useState(false);
  const [followPlayback, setFollowPlayback] = useState(true);
  const [scoreZoom, setScoreZoom] = useState(() => recommendedScoreZoom(score));
  const noteCount = useMemo(() => score.parts.reduce((sum, part) => sum + countNotes(part.measures), 0), [score]);
  const measureCount = useMemo(
    () => new Set(score.parts.flatMap((part) => part.measures.map((measure) => measure.number))).size,
    [score]
  );
  const isLarge = measureCount > LARGE_SCORE_MEASURE_THRESHOLD || noteCount > LARGE_SCORE_NOTE_THRESHOLD;
  const hasUnderfilled = measureIssues.some((issue) => issue.status === "underfilled");
  const hasOverfilled = measureIssues.some((issue) => issue.status === "overfilled");
  const activePlaybackSummary = useMemo(() => summarizeActivePlayback(activePlaybackEvents), [activePlaybackEvents]);
  const measureMap = useMemo(() => buildMeasureMap(score), [score]);
  const activeMeasureNumber = activePlaybackEvents.length > 0
    ? Math.min(...activePlaybackEvents.map((event) => event.measureNumber ?? 1))
    : undefined;

  useEffect(() => {
    let cancelled = false;
    let renderHost: HTMLDivElement | null = null;

    async function renderScore() {
      if (!containerRef.current) {
        return;
      }

      setIsRendering(true);
      setCursorController(null);
      setError("");
      osmdRef.current?.cursor?.hide?.();
      osmdRef.current = null;
      containerRef.current.innerHTML = "";
      const host = document.createElement("div");
      renderHost = host;
      host.className = "score-osmd-host";
      containerRef.current.appendChild(host);

      try {
        const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
        if (cancelled || !host.isConnected) {
          return;
        }
        const osmd = new OpenSheetMusicDisplay(host, {
          backend: "svg",
          // OSMD's delayed auto-resize render resets and hides its cursor while
          // playback is active. The studio frame scrolls independently, so keep
          // one stable render and let the frame handle viewport changes.
          autoResize: false,
          // CurrentArea paints the complete measure across every staff in the
          // current system, so orchestral scores retain one synchronized marker.
          cursorsOptions: [{ type: 3, color: "#f4c84a", alpha: 0.34, follow: false }],
          disableCursor: false,
          drawPartAbbreviations: true,
          drawPartNames: true,
          drawTitle: true,
          drawingParameters: "compacttight",
          followCursor: false
        });
        osmd.Zoom = scoreZoom;
        await osmd.load(musicXml);
        if (cancelled || !host.isConnected) {
          return;
        }
        await osmd.render();
        if (cancelled || !host.isConnected) {
          osmd.cursor?.hide?.();
          return;
        }
        osmd.cursor?.hide?.();
        osmdRef.current = osmd as OsmdInstance;
        if (osmd.cursor) {
          const index = buildOsmdPositionIndex(osmd.cursor);
          setCursorController(new ScoreCursorController(osmd.cursor, index));
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
      renderHost?.remove();
    };
  }, [musicXml]);

  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        osmd.cursor?.hide?.();
        setCursorController(null);
        osmd.Zoom = scoreZoom;
        await osmd.render?.();
        if (cancelled || osmdRef.current !== osmd || !osmd.cursor) {
          return;
        }
        const index = buildOsmdPositionIndex(osmd.cursor);
        setCursorController(new ScoreCursorController(osmd.cursor, index));
      })();
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [scoreZoom]);

  useEffect(() => {
    const previousStatus = previousPlaybackStatusRef.current;
    previousPlaybackStatusRef.current = playbackSession.status;
    if (playbackSession.status === "playing" && previousStatus !== "playing") {
      autoScrollRef.current.resume();
      setFollowPlayback(true);
    }
  }, [playbackSession.status]);

  useEffect(() => {
    const activeMeasure = activeMeasureNumber === undefined
      ? undefined
      : measureMap.find((measure) => measure.measureNumber === activeMeasureNumber);
    const visible = activePlaybackEvents.length > 0
      || playbackSession.status === "playing"
      || playbackSession.status === "paused";
    const highlight = cursorController?.moveTo(
      activeMeasure?.start ?? playbackSession.currentSourceTime,
      visible
    );
    if (visible && followPlayback && frameRef.current) {
      autoScrollRef.current.follow(frameRef.current, highlight);
    }
  }, [activeMeasureNumber, cursorController, followPlayback, measureMap, playbackSession.currentSourceTime, playbackSession.status]);

  return (
    <div className={`score-viewer ${showFullScore ? "full-score" : ""}`}>
      <div className="score-viewer-toolbar">
        <span>{noteCount} notes</span>
        {activePlaybackSummary ? (
          <span className="score-active-summary">{activePlaybackSummary}</span>
        ) : isLarge ? <span>Large score mode recommended</span> : <span>OSMD SVG renderer</span>}
        <div className="score-viewer-actions">
          <div className="score-zoom-controls" aria-label="Score zoom">
            <button
              type="button"
              aria-label="Zoom out score"
              title="Zoom out"
              disabled={isRendering || scoreZoom <= MIN_SCORE_ZOOM}
              onClick={() => setScoreZoom((current) => clampZoom(current - SCORE_ZOOM_STEP))}
            >−</button>
            <output aria-label="Score zoom level">{Math.round(scoreZoom * 100)}%</output>
            <button
              type="button"
              aria-label="Zoom in score"
              title="Zoom in"
              disabled={isRendering || scoreZoom >= MAX_SCORE_ZOOM}
              onClick={() => setScoreZoom((current) => clampZoom(current + SCORE_ZOOM_STEP))}
            >+</button>
            <button type="button" disabled={isRendering} onClick={() => setScoreZoom(recommendedScoreZoom(score))}>Fit tracks</button>
          </div>
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
  Zoom: number;
  render?: () => void;
};

function summarizeActivePlayback(activeEvents: PlaybackNoteEvent[]): string {
  if (activeEvents.length === 0) {
    return "";
  }

  const pitches = [...new Set(activeEvents.map((event) => event.pitch))].slice(0, 4).join(", ");
  const measureNumber = Math.min(...activeEvents.map((event) => event.measureNumber ?? 1));
  return `Playing ${pitches}${activeEvents.length > 4 ? "..." : ""} · measure ${measureNumber}`;
}

function recommendedScoreZoom(score: FoxChildMusicScore): number {
  const staffCount = score.parts.reduce((total, part) => total + Math.max(1, part.staffCount ?? 1), 0);
  if (staffCount >= 9) return 0.5;
  if (staffCount >= 6) return 0.65;
  return 0.85;
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_SCORE_ZOOM, Math.max(MIN_SCORE_ZOOM, Math.round(zoom * 100) / 100));
}
