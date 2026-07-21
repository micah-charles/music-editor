import { musicXmlToAst, type FoxChildMusicScore } from "@foxchild/music-core";
import { useState } from "react";
import { convertScoreImageToMusicXml, type AiOmrCorrectionResult } from "../music/omr/omrClient";

interface OmrImportPanelProps {
  onImport: (score: FoxChildMusicScore, message: string) => void;
  onMessage: (message: string) => void;
}

const reviewWarning = "OMR draft: compare against the original scan before final use.";

export function OmrImportPanel({ onImport, onMessage }: OmrImportPanelProps) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [logs, setLogs] = useState("");
  const [musicXml, setMusicXml] = useState("");
  const [aiReview, setAiReview] = useState(true);
  const [aiCorrection, setAiCorrection] = useState<AiOmrCorrectionResult>();

  async function handleFile(file: File) {
    setBusy(true);
    setStatus(aiReview ? "Running Audiveris OMR, then reviewing with local Codex..." : "Running Audiveris OMR...");
    setWarnings([]);
    setLogs("");
    setMusicXml("");
    setAiCorrection(undefined);
    try {
      const result = await convertScoreImageToMusicXml(file, { aiReview });
      setWarnings(result.warnings || []);
      setLogs(result.logs || "");
      setAiCorrection(result.aiCorrection);
      if (!result.ok || !result.musicXml) {
        throw new Error(result.error || "No MusicXML returned from OMR helper.");
      }

      setMusicXml(result.musicXml);
      const imported = musicXmlToAst(result.musicXml);
      const score: FoxChildMusicScore = {
        ...imported,
        global: {
          ...imported.global,
          tempo: {
            ...imported.global.tempo,
            source: imported.global.tempo.source === "default" ? "default" : "omr"
          }
        },
        metadata: {
          ...imported.metadata,
          source: "audiveris-omr",
          notes: [
            imported.metadata.notes,
            `Source scan: ${file.name}`,
            "Imported from Audiveris OMR. This is a draft transcription and requires human review."
          ].filter(Boolean).join("\n\n")
        },
        sourceMetadata: {
          ...imported.sourceMetadata,
          originalFormat: "audiveris-omr",
          draftTranscription: true,
          warnings: [
            ...(imported.sourceMetadata?.warnings ?? []),
            ...(result.warnings ?? []),
            reviewWarning
          ]
        },
        extensions: {
          ...imported.extensions,
          ...(result.aiCorrection ? { omrAiCorrection: result.aiCorrection } : {})
        }
      };

      onImport(score, `Imported Audiveris OMR draft from ${file.name}. Please review validation warnings.`);
      setStatus(`Imported OMR MusicXML from ${file.name}.`);
    } catch (error) {
      const message = errorMessage(error);
      setStatus(message);
      onMessage(message);
    } finally {
      setBusy(false);
    }
  }

  function downloadMusicXml() {
    if (!musicXml) {
      return;
    }
    const blob = new Blob([musicXml], { type: "application/vnd.recordare.musicxml+xml" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "foxchild-audiveris-omr.musicxml";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel omr-import-panel" data-testid="omr-import-panel">
      <div className="panel-heading">
        <h2>Scan OMR</h2>
      </div>
      <p className="small-copy">Powered by external Audiveris OMR. Not bundled with FoxChild.</p>
      <p className="warning">OMR output is a draft transcription and requires human review.</p>
      <label className="inline-toggle omr-codex-toggle">
        <input
          data-testid="omr-codex-review-toggle"
          type="checkbox"
          checked={aiReview}
          disabled={busy}
          onChange={(event) => setAiReview(event.currentTarget.checked)}
        />
        <span>Generate local Codex review proposals</span>
      </label>
      <p className="small-copy">Uses the installed Codex CLI and its existing ChatGPT login. It proposes evidence-backed changes but does not silently rewrite music. No API key is sent by the browser.</p>
      <label className="field">
        <span>Score image/PDF</span>
        <input
          data-testid="omr-file-input"
          type="file"
          accept=".png,.jpg,.jpeg,.tif,.tiff,.pdf"
          disabled={busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) {
              void handleFile(file);
            }
          }}
        />
      </label>
      {busy ? <p data-testid="omr-status" className="message-line compact">Running OMR...</p> : null}
      {status ? <p data-testid="omr-status" className="message-line compact">{status}</p> : null}
      {warnings.length > 0 ? (
        <div data-testid="omr-warnings" className="omr-warning-list">
          <h3>OMR processing report</h3>
          <p className="small-copy">These messages are retained as evidence. Only items labelled “Unresolved score issue” require musical correction.</p>
          <div className="omr-report-items">
            {warnings.map((warning, index) => {
              const classification = classifyOmrMessage(warning);
              return (
                <article className={`omr-report-item ${classification.kind}`} key={`${index}-${warning}`}>
                  <strong>{classification.label}</strong>
                  <p>{warning}</p>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
      {aiCorrection ? (
        <div className={`omr-ai-status ${aiCorrection.status}`} data-testid="omr-ai-status">
          <strong>Local Codex review: {aiCorrection.status}</strong>
          {aiCorrection.summary ? <p>{aiCorrection.summary}</p> : null}
          {aiCorrection.status === "completed" ? (
            <small>
              Codex completed a second review and returned {aiCorrection.proposals.length} evidence-backed proposal(s).
              Original Audiveris notices remain visible for traceability. Review proposals in OMR Review.
            </small>
          ) : null}
          {aiCorrection.error ? <small>{aiCorrection.error}</small> : null}
        </div>
      ) : null}
      {musicXml ? (
        <button type="button" data-testid="download-omr-musicxml" onClick={downloadMusicXml}>
          Download OMR MusicXML
        </button>
      ) : null}
      {logs ? (
        <details className="omr-logs">
          <summary>Audiveris logs</summary>
          <pre>{logs}</pre>
        </details>
      ) : null}
    </section>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function classifyOmrMessage(message: string): { kind: "issue" | "limitation" | "recovered" | "notice"; label: string } {
  const lower = message.toLowerCase();
  if (lower.includes("rhythm issue")) return { kind: "issue", label: "Unresolved score issue" };
  if (lower.includes("automatically retried") || lower.includes("recovered the complete score")) {
    return { kind: "recovered", label: "Recovered automatically" };
  }
  if (lower.includes("small-head") || lower.includes("cue-beam") || lower.includes("ocr language")) {
    return { kind: "limitation", label: "Recognition limitation" };
  }
  if (lower.includes("draft transcription") || lower.includes("human review")) {
    return { kind: "notice", label: "Review policy" };
  }
  if (lower.includes("took more than") || lower.includes("compressed mxl") || lower.includes("unpacked")) {
    return { kind: "notice", label: "Processing note" };
  }
  return { kind: "notice", label: "OMR notice" };
}
