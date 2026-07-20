import { useEffect, useMemo, useRef, useState } from "react";
import {
  countNotes,
  durationLabelForBeats,
  measureIssueText,
  type FoxChildMusicScore,
  type MeasureValidationResult
} from "@foxchild/music-core";
import type { PlaybackNoteEvent } from "../music/playback/PlaybackEngine";

interface ScoreViewerProps {
  score: FoxChildMusicScore;
  musicXml: string;
  measureIssues: MeasureValidationResult[];
  activePlaybackEvents?: PlaybackNoteEvent[];
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
  canRevert,
  onAddMissingRest,
  onStretchLastNote,
  onRevertChange
}: ScoreViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const osmdRef = useRef<OsmdInstance | null>(null);
  const activePlaybackEventsRef = useRef<PlaybackNoteEvent[]>(activePlaybackEvents);
  const [error, setError] = useState("");
  const [isRendering, setIsRendering] = useState(false);
  const [showFullScore, setShowFullScore] = useState(false);
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
          syncScoreCursor(osmdRef.current, activePlaybackEventsRef.current);
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
    syncScoreCursor(osmdRef.current, activePlaybackEvents);
  }, [activePlaybackEvents]);

  return (
    <div className={`score-viewer ${showFullScore ? "full-score" : ""}`}>
      <div className="score-viewer-toolbar">
        <span>{noteCount} notes</span>
        {activePlaybackSummary ? (
          <span className="score-active-summary">{activePlaybackSummary}</span>
        ) : isLarge ? <span>Large score mode recommended</span> : <span>OSMD SVG renderer</span>}
        <div className="score-viewer-actions">
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
      {measureIssues.length > 0 ? (
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
      {measureIssues.length > 0 ? (
        <div className="measure-status-strip" aria-label="Measure validation status">
          {measureIssues.map((issue) => (
            <span className={`measure-status-tile ${issue.status}`} key={`${issue.partId}-${issue.measure}-tile`}>
              Measure {issue.measure}: {issue.status}
            </span>
          ))}
        </div>
      ) : null}
      <div className={`score-paper-frame ${hasUnderfilled ? "has-underfilled-measure" : ""} ${hasOverfilled ? "has-overfilled-measure" : ""}`}>
        <div className="score-paper" ref={containerRef} />
      </div>
    </div>
  );
}

function article(label: string): "a" | "an" {
  return /^[aeiou]/i.test(label) ? "an" : "a";
}

type OsmdCursor = {
  hide?: () => void;
  next?: () => void;
  reset?: () => void;
  show?: () => void;
  update?: () => void;
  Iterator?: {
    CurrentSourceTimestamp?: { RealValue?: number };
    currentTimeStamp?: { RealValue?: number };
    EndReached?: boolean;
  };
};

type OsmdInstance = {
  cursor?: OsmdCursor;
};

function syncScoreCursor(osmd: OsmdInstance | null, activeEvents: PlaybackNoteEvent[]): void {
  const cursor = osmd?.cursor;
  if (!cursor) {
    return;
  }

  if (activeEvents.length === 0) {
    cursor.hide?.();
    return;
  }

  const targetScoreTime = Math.min(...activeEvents.map((event) => event.startBeat)) / 4;

  try {
    cursor.reset?.();
    cursor.show?.();

    let guard = 0;
    let currentTime = cursorSourceTime(cursor);
    while (currentTime !== null && currentTime + 0.0001 < targetScoreTime && !cursor.Iterator?.EndReached && guard < 2000) {
      cursor.next?.();
      currentTime = cursorSourceTime(cursor);
      guard += 1;
    }

    cursor.update?.();
  } catch {
    cursor.hide?.();
  }
}

function cursorSourceTime(cursor: OsmdCursor): number | null {
  const sourceTime = cursor.Iterator?.CurrentSourceTimestamp?.RealValue;
  if (typeof sourceTime === "number") {
    return sourceTime;
  }

  const currentTime = cursor.Iterator?.currentTimeStamp?.RealValue;
  return typeof currentTime === "number" ? currentTime : null;
}

function summarizeActivePlayback(activeEvents: PlaybackNoteEvent[]): string {
  if (activeEvents.length === 0) {
    return "";
  }

  const pitches = [...new Set(activeEvents.map((event) => event.pitch))].slice(0, 4).join(", ");
  const measureNumber = Math.min(...activeEvents.map((event) => event.measureNumber ?? 1));
  return `Playing ${pitches}${activeEvents.length > 4 ? "..." : ""} · measure ${measureNumber}`;
}
