import { astToMusicXml, fifthsToKey, type FoxChildMusicScore, type MusicEvent } from "@foxchild/music-core";
import { useMemo, useState } from "react";
import { ScoreMetadataEditor } from "./ScoreMetadataEditor";
import type { AiOmrCorrectionProposal, AiOmrCorrectionResult } from "../music/omr/omrClient";

interface OmrFidelityReviewProps {
  score: FoxChildMusicScore;
  onChange: (score: FoxChildMusicScore) => void;
}

type ReviewResolution = "source" | "recognised" | "ignored";

export function OmrFidelityReview({ score, onChange }: OmrFidelityReviewProps) {
  const [resolutions, setResolutions] = useState<Record<string, ReviewResolution>>({});
  const [editing, setEditing] = useState(false);
  const sourceXml = typeof score.extensions?.musicXmlSource === "string" ? score.extensions.musicXmlSource : "";
  const exportedXml = useMemo(() => astToMusicXml(score), [score]);
  const sourceFifths = numberTag(sourceXml, "fifths");
  const sourceTempo = numberTag(sourceXml, "per-minute") ?? numberAttribute(sourceXml, "sound", "tempo");
  const exportedFifths = numberTag(exportedXml, "fifths");
  const issues = (score.sourceMetadata?.warnings ?? []).map((warning, index) => ({
    id: `source-${index}`,
    category: issueCategory(warning),
    warning
  }));
  const notation = notationSummary(score);
  const aiCorrection = readAiCorrection(score.extensions?.omrAiCorrection);
  const aiResolutions = readAiResolutions(score.extensions?.omrAiCorrectionResolutions);

  function acceptSource(): void {
    onChange({
      ...score,
      global: {
        ...score.global,
        key: sourceFifths === undefined ? score.global.key : { ...fifthsToKey(sourceFifths, score.global.key.mode), fifths: sourceFifths },
        tempo: sourceTempo === undefined ? score.global.tempo : { ...score.global.tempo, bpm: sourceTempo, source: "musicxml" }
      }
    });
  }

  function resolveAiProposal(proposal: AiOmrCorrectionProposal, resolution: "applied" | "reviewed" | "rejected"): void {
    const next = resolution === "applied" ? applyAiProposal(score, proposal) : score;
    onChange({
      ...next,
      extensions: {
        ...next.extensions,
        omrAiCorrectionResolutions: {
          ...aiResolutions,
          [proposal.id]: resolution
        }
      }
    });
  }

  return (
    <section className="omr-fidelity-review" aria-label="OMR first measures comparison">
      <div className="omr-comparison-grid">
        <article className="omr-comparison-pane">
          <header><strong>Original PDF</strong><span>Source evidence</span></header>
          <div className="source-placeholder">
            <strong>{sourceScanName(score) ?? "Original scan not retained"}</strong>
            <p>The imported score keeps semantic source XML. Re-run OMR with the original image or PDF to compare pixels and regions.</p>
          </div>
          <dl>
            <dt>Source XML key</dt><dd>{sourceFifths === undefined ? "Missing" : `${sourceFifths} fifths`}</dd>
            <dt>Source XML tempo</dt><dd>{sourceTempo ?? "Missing"}</dd>
          </dl>
        </article>

        <article className="omr-comparison-pane recognised-pane">
          <header><strong>Recognised Score</strong><span>Measures 1-6</span></header>
          <div className="recognised-summary">
            <div><span>Key</span><strong>{score.global.key.tonic} {score.global.key.mode} ({score.global.key.fifths ?? "derived"} fifths)</strong></div>
            <div><span>Tempo</span><strong>{score.global.tempo.bpm} BPM</strong></div>
            <div><span>Expression</span><strong>{notation.dynamics} dynamics · {notation.slurs} slurs</strong></div>
            <div><span>Notation</span><strong>{notation.staccatos} staccatos · {notation.beams} beams</strong></div>
          </div>
          <p className="small-copy">Use Score workspace for engraved notation and measure highlighting.</p>
        </article>

        <article className="omr-comparison-pane issue-pane">
          <header><strong>Issue Inspector</strong><span>{issues.length} findings</span></header>
          <dl className="omr-value-comparison">
            <dt>Source XML</dt><dd>{sourceFifths ?? "?"} fifths · {sourceTempo ?? "?"} BPM</dd>
            <dt>AST</dt><dd>{score.global.key.fifths ?? "derived"} fifths · {score.global.tempo.bpm} BPM</dd>
            <dt>Export XML</dt><dd>{exportedFifths ?? "?"} fifths · {numberTag(exportedXml, "per-minute") ?? "?"} BPM</dd>
          </dl>
          <div className="omr-issue-list">
            {aiCorrection?.status === "completed" ? (
              <div className="omr-ai-proposals">
                <h3>Local Codex proposals</h3>
                {aiCorrection.summary ? <p className="small-copy">{aiCorrection.summary}</p> : null}
                {aiCorrection.proposals.map((proposal) => {
                  const resolution = aiResolutions[proposal.id];
                  const applicable = canApplyAiProposal(proposal);
                  return (
                    <article key={proposal.id} className="omr-review-issue ai-proposal">
                      <div className="ai-proposal-heading">
                        <span className={`issue-category ${proposal.category}`}>{proposal.category.replace("-", " ")}</span>
                        <span>{Math.round(proposal.confidence * 100)}% confidence{proposal.measure ? ` · measure ${proposal.measure}` : ""}</span>
                      </div>
                      <strong>{proposal.summary}</strong>
                      <p>{proposal.evidence}</p>
                      {resolution ? <small>Resolution: {resolution}</small> : (
                        <div className="button-row">
                          {applicable ? <button type="button" onClick={() => resolveAiProposal(proposal, "applied")}>Apply proposal</button> : null}
                          <button type="button" onClick={() => resolveAiProposal(proposal, "reviewed")}>Mark reviewed</button>
                          <button type="button" onClick={() => resolveAiProposal(proposal, "rejected")}>Reject</button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : null}
            {issues.length === 0 ? <p>No OMR fidelity warnings.</p> : issues.map((issue) => (
              <article key={issue.id} className="omr-review-issue">
                <span className={`issue-category ${issue.category.toLowerCase().replaceAll(" ", "-")}`}>{issue.category}</span>
                <p>{issue.warning}</p>
                {resolutions[issue.id] ? <small>Resolution: {resolutions[issue.id]}</small> : (
                  <div className="button-row">
                    <button type="button" onClick={() => { acceptSource(); setResolutions((current) => ({ ...current, [issue.id]: "source" })); }}>Accept source</button>
                    <button type="button" onClick={() => setResolutions((current) => ({ ...current, [issue.id]: "recognised" }))}>Accept recognised</button>
                    <button type="button" onClick={() => setEditing(true)}>Edit</button>
                    <button type="button" onClick={() => setResolutions((current) => ({ ...current, [issue.id]: "ignored" }))}>Ignore</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </article>
      </div>
      {editing ? (
        <div className="omr-inline-editor">
          <div className="panel-heading"><h2>Edit recognised metadata</h2><button type="button" onClick={() => setEditing(false)}>Close</button></div>
          <ScoreMetadataEditor score={score} onChange={onChange} />
        </div>
      ) : null}
    </section>
  );
}

function readAiCorrection(value: unknown): AiOmrCorrectionResult | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<AiOmrCorrectionResult>;
  return typeof candidate.status === "string" && Array.isArray(candidate.proposals)
    ? candidate as AiOmrCorrectionResult
    : undefined;
}

function readAiResolutions(value: unknown): Record<string, "applied" | "reviewed" | "rejected"> {
  return value && typeof value === "object" ? value as Record<string, "applied" | "reviewed" | "rejected"> : {};
}

function canApplyAiProposal(proposal: AiOmrCorrectionProposal): boolean {
  if (proposal.operation === "set-key-signature") return Number.isInteger(proposal.patch?.fifths);
  if (proposal.operation === "set-tempo") return typeof proposal.patch?.bpm === "number";
  if (proposal.operation === "set-metadata") return Boolean(proposal.patch?.metadataField && proposal.patch.value !== undefined);
  return false;
}

function applyAiProposal(score: FoxChildMusicScore, proposal: AiOmrCorrectionProposal): FoxChildMusicScore {
  if (proposal.operation === "set-key-signature" && Number.isInteger(proposal.patch?.fifths)) {
    const fifths = proposal.patch!.fifths!;
    const mode = proposal.patch?.mode ?? score.global.key.mode;
    return { ...score, global: { ...score.global, key: { ...fifthsToKey(fifths, mode), fifths } } };
  }
  if (proposal.operation === "set-tempo" && typeof proposal.patch?.bpm === "number") {
    return { ...score, global: { ...score.global, tempo: { ...score.global.tempo, bpm: proposal.patch.bpm, source: "user" } } };
  }
  if (proposal.operation === "set-metadata" && proposal.patch?.metadataField && proposal.patch.value !== undefined) {
    return { ...score, metadata: { ...score.metadata, [proposal.patch.metadataField]: proposal.patch.value } };
  }
  return score;
}

function notationSummary(score: FoxChildMusicScore): { dynamics: number; slurs: number; staccatos: number; beams: number } {
  const events = score.parts.flatMap((part) => part.measures.filter((measure) => measure.number <= 6).flatMap((measure) => measure.events));
  return {
    dynamics: events.filter((event) => event.type === "direction" && event.dynamic).length,
    slurs: notationCount(events, "slurs"),
    staccatos: events.filter((event) => (event.type === "note" || event.type === "chord") && event.notation?.articulations?.includes("staccato")).length,
    beams: notationCount(events, "beams")
  };
}

function notationCount(events: MusicEvent[], key: "slurs" | "beams"): number {
  return events.reduce((total, event) => total + (event.type === "note" || event.type === "chord" ? event.notation?.[key]?.length ?? 0 : 0), 0);
}

function sourceScanName(score: FoxChildMusicScore): string | undefined {
  return score.metadata.notes?.match(/Source scan:\s*([^\n]+)/i)?.[1]?.trim();
}

function issueCategory(warning: string): "Critical semantic" | "Playback" | "Notation" | "Expression" | "Layout" | "Metadata" {
  const lower = warning.toLowerCase();
  if (lower.includes("key signature") || lower.includes("tempo")) return "Critical semantic";
  if (lower.includes("dynamic") || lower.includes("hairpin")) return "Expression";
  if (lower.includes("layout")) return "Layout";
  if (lower.includes("metadata") || lower.includes("title") || lower.includes("creator")) return "Metadata";
  if (lower.includes("playback") || lower.includes("grace")) return "Playback";
  return "Notation";
}

function numberTag(xml: string, name: string): number | undefined {
  const value = Number(xml.match(new RegExp(`<${name}\\b[^>]*>([^<]+)<\\/${name}>`, "i"))?.[1]);
  return Number.isFinite(value) ? value : undefined;
}

function numberAttribute(xml: string, tag: string, attribute: string): number | undefined {
  const value = Number(xml.match(new RegExp(`<${tag}\\b[^>]*\\b${attribute}="([^"]+)"`, "i"))?.[1]);
  return Number.isFinite(value) ? value : undefined;
}
