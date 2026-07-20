import { musicXmlToAst, type FoxChildMusicScore } from "@foxchild/music-core";
import { useState } from "react";
import { convertScoreImageToMusicXml } from "../music/omr/omrClient";

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

  async function handleFile(file: File) {
    setBusy(true);
    setStatus("Running Audiveris OMR...");
    setWarnings([]);
    setLogs("");
    setMusicXml("");
    try {
      const result = await convertScoreImageToMusicXml(file);
      setWarnings(result.warnings || []);
      setLogs(result.logs || "");
      if (!result.ok || !result.musicXml) {
        throw new Error(result.error || "No MusicXML returned from OMR helper.");
      }

      setMusicXml(result.musicXml);
      const imported = musicXmlToAst(result.musicXml);
      const score: FoxChildMusicScore = {
        ...imported,
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
          <h3>OMR Warnings</h3>
          <ul>
            {warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
          </ul>
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
