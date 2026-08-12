import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  knowledgeStatusLabel,
  relatedKnowledgeConcepts,
  type KnowledgeConceptState,
  type KnowledgeGraphState
} from "@foxchild/music-core";

interface KnowledgeGraphProps {
  graph: KnowledgeGraphState;
  focusedConceptId: string;
  compact?: boolean;
  onSelect: (conceptId: string) => void;
}

export function KnowledgeGraph({
  graph,
  focusedConceptId,
  compact = false,
  onSelect
}: KnowledgeGraphProps) {
  const current = graph.concepts.find((entry) => entry.concept.id === focusedConceptId)
    ?? graph.concepts.find((entry) => entry.concept.id === graph.recommendedConceptId)
    ?? graph.concepts[0];
  if (!current) return null;
  const related = relatedKnowledgeConcepts(graph, current.concept.id, compact ? 5 : 7);

  return (
    <section
      className={`knowledge-graph ${compact ? "compact" : ""}`}
      aria-label={`Knowledge graph centred on ${current.concept.title}`}
      data-testid="knowledge-graph"
    >
      <svg className="knowledge-graph-links" viewBox="0 0 100 100" aria-hidden="true">
        {related.map((entry, index) => {
          const point = radialPoint(index, related.length, compact ? 34 : 38);
          return <line key={entry.concept.id} x1="50" y1="50" x2={point.x} y2={point.y} />;
        })}
      </svg>
      <ConceptNode state={current} current onSelect={onSelect} />
      {related.map((entry, index) => {
        const angle = -90 + index * 360 / Math.max(1, related.length);
        return (
          <ConceptNode
            key={entry.concept.id}
            state={entry}
            onSelect={onSelect}
            style={{
              "--concept-angle": `${angle}deg`,
              "--concept-radius": compact ? "112px" : "190px"
            } as CSSProperties}
          />
        );
      })}
      <div className="knowledge-graph-legend" aria-label="Concept status colours">
        <span><i className="learning" />Learning</span>
        <span><i className="mastered" />Mastered</span>
        <span><i className="review" />Review</span>
        <span><i className="weak" />Weak</span>
        <span><i className="locked" />Locked</span>
      </div>
    </section>
  );
}

function ConceptNode({
  state,
  current = false,
  style,
  onSelect
}: {
  state: KnowledgeConceptState;
  current?: boolean;
  style?: CSSProperties;
  onSelect: (conceptId: string) => void;
}) {
  const percentage = Math.round(state.mastery * 100);
  const locked = state.status === "locked";
  return (
    <button
      type="button"
      className={`knowledge-concept-node ${current ? "current" : "petal"} ${state.status}`}
      style={{
        ...style,
        "--concept-progress": `${percentage * 3.6}deg`
      } as CSSProperties}
      disabled={locked}
      aria-current={current ? "true" : undefined}
      aria-label={`${state.concept.title}. ${knowledgeStatusLabel(state.status)}. ${percentage}% mastery${locked ? `. Requires ${state.lockedBy.length} earlier skill${state.lockedBy.length === 1 ? "" : "s"}` : ""}.`}
      onClick={() => onSelect(state.concept.id)}
    >
      <span className="knowledge-node-ring">
        <i aria-hidden="true">{locked ? "⌁" : state.concept.icon}</i>
      </span>
      <strong>{state.concept.shortTitle}</strong>
      <small>{locked ? "Locked" : `${percentage}%`}</small>
    </button>
  );
}

interface KnowledgeNavigatorProps {
  graph: KnowledgeGraphState;
  focusedConceptId: string;
  onSelect: (conceptId: string) => void;
}

export function KnowledgeNavigator({
  graph,
  focusedConceptId,
  onSelect
}: KnowledgeNavigatorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = graph.concepts.find((entry) => entry.concept.id === focusedConceptId)
    ?? graph.concepts[0];
  const related = current ? relatedKnowledgeConcepts(graph, current.concept.id, 7) : [];

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function closeOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("pointerdown", closeOutside);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);

  if (!current) return null;
  return (
    <div className={`knowledge-navigator ${open ? "open" : ""}`} ref={rootRef}>
      {open ? (
        <div className="knowledge-navigator-flower" id="knowledge-navigator-menu" role="menu" aria-label="Related concepts">
          {related.map((entry, index) => {
            const angle = 8 - index * 100 / Math.max(1, related.length - 1);
            return (
              <button
                type="button"
                role="menuitem"
                key={entry.concept.id}
                disabled={entry.status === "locked"}
                className={entry.status}
                style={{ "--navigator-angle": `${angle}deg` } as CSSProperties}
                onClick={() => {
                  onSelect(entry.concept.id);
                  setOpen(false);
                }}
              >
                <span>{entry.status === "locked" ? "⌁" : entry.concept.icon}</span>
                <small>{entry.concept.shortTitle}</small>
              </button>
            );
          })}
        </div>
      ) : null}
      <button
        type="button"
        className={`knowledge-navigator-trigger ${current.status}`}
        aria-label={`${open ? "Close" : "Open"} Knowledge Navigator. Current concept: ${current.concept.title}`}
        aria-expanded={open}
        aria-controls="knowledge-navigator-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span>{current.concept.icon}</span>
        <i style={{ "--concept-progress": `${current.mastery * 360}deg` } as CSSProperties} />
      </button>
    </div>
  );
}

function radialPoint(index: number, total: number, radius: number) {
  const angle = (-90 + index * 360 / Math.max(1, total)) * Math.PI / 180;
  return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius };
}
