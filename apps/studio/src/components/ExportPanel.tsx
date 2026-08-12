import {
  astToLearningPack,
  astToMidi,
  astToMusicXml,
  astToSimpleJson,
  type FoxChildMusicScore,
  type FoxChildLearningPack
} from "@foxchild/music-core";
import { useMemo, useState } from "react";

interface ExportPanelProps {
  score: FoxChildMusicScore;
  musicXml: string;
  learningPack: FoxChildLearningPack;
  developerMode: boolean;
  validationErrors: string[];
  validationWarnings: string[];
}

type ExportScope = "full" | "visible";
type PaperSize = "A4" | "Letter";
type Orientation = "portrait" | "landscape";

export function ExportPanel({
  score,
  musicXml,
  learningPack,
  developerMode,
  validationErrors,
  validationWarnings
}: ExportPanelProps) {
  const [filename, setFilename] = useState(() => sanitizeFilename(score.metadata.title || score.id));
  const [scope, setScope] = useState<ExportScope>("full");
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [margin, setMargin] = useState(12);
  const [scale, setScale] = useState(100);
  const [result, setResult] = useState("");
  const exportScore = useMemo(() => {
    if (scope === "full") return score;
    const visibleParts = score.parts.filter((part) => part.visible !== false);
    return visibleParts.length ? { ...score, parts: visibleParts } : score;
  }, [scope, score]);
  const exportMusicXml = scope === "full" ? musicXml : astToMusicXml(exportScore);
  const canExport = validationErrors.length === 0;

  function complete(message: string) {
    setResult(message);
  }

  function printScore() {
    applyPrintSettings({ paperSize, orientation, margin, scale });
    setResult("Print dialog opened. Choose “Save as PDF” to create a PDF file.");
    window.print();
  }

  return (
    <section className="export-centre" aria-label="Export music">
      <header>
        <div><p>EXPORT MUSIC</p><h1>Share your score</h1><span>Save keeps your FoxChild project editable. Export creates a file for another person or application.</span></div>
      </header>

      {validationErrors.length || validationWarnings.length ? (
        <section className={`export-validation ${validationErrors.length ? "blocking" : "warning"}`}>
          <strong>{validationErrors.length ? "Resolve validation errors before exporting" : "Review export warnings"}</strong>
          {validationErrors.map((error) => <p key={error}>{error}</p>)}
          {validationWarnings.slice(0, 6).map((warning) => <p key={warning}>{warning}</p>)}
        </section>
      ) : <p className="export-validation ready">✓ Score validation passed</p>}

      <div className="export-common-options">
        <label><span>Filename</span><input value={filename} onChange={(event) => setFilename(sanitizeFilename(event.target.value))} /></label>
        <label><span>Score scope</span><select value={scope} onChange={(event) => setScope(event.target.value as ExportScope)}><option value="full">Full score</option><option value="visible">Visible parts only</option></select></label>
      </div>

      <div className="export-format-grid">
        <article>
          <span className="export-format-icon xml">♪</span>
          <div><h2>MusicXML</h2><p>Open the notation in MuseScore, Dorico, Sibelius and other score applications.</p><small>.musicxml · {exportScore.parts.length} part{exportScore.parts.length === 1 ? "" : "s"}</small></div>
          <button type="button" className="primary" disabled={!canExport} onClick={() => {
            downloadText(`${filename}.musicxml`, exportMusicXml, "application/vnd.recordare.musicxml+xml");
            complete(`Exported ${filename}.musicxml`);
          }}>Export MusicXML</button>
        </article>

        <article>
          <span className="export-format-icon midi">▤</span>
          <div><h2>MIDI</h2><p>Share playback data with a DAW while preserving tracks, tempo, channels and percussion behavior.</p><small>.mid · Type 1 multi-track</small></div>
          <button type="button" className="primary" disabled={!canExport} onClick={() => {
            downloadBytes(`${filename}.mid`, astToMidi(exportScore), "audio/midi");
            complete(`Exported ${filename}.mid`);
          }}>Export MIDI</button>
        </article>

        <article className="pdf-export-card">
          <span className="export-format-icon pdf">▣</span>
          <div><h2>Print / Save as PDF</h2><p>Open a clean, notation-only print view. Use your browser’s Save as PDF destination for a reliable local PDF.</p></div>
          <div className="print-options">
            <label><span>Paper</span><select value={paperSize} onChange={(event) => setPaperSize(event.target.value as PaperSize)}><option>A4</option><option>Letter</option></select></label>
            <label><span>Orientation</span><select value={orientation} onChange={(event) => setOrientation(event.target.value as Orientation)}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
            <label><span>Margins</span><input type="number" min={5} max={30} value={margin} onChange={(event) => setMargin(Number(event.target.value))} /><small>mm</small></label>
            <label><span>Scale</span><input type="number" min={60} max={140} value={scale} onChange={(event) => setScale(Number(event.target.value))} /><small>%</small></label>
          </div>
          <button type="button" className="primary" disabled={!canExport} onClick={printScore}>Print / Save as PDF</button>
        </article>
      </div>

      {developerMode ? (
        <details className="developer-exports">
          <summary>Developer exports</summary>
          <p>Internal data and diagnostics. These files are not required to continue working in FoxChild.</p>
          <div>
            <button type="button" onClick={() => downloadText(`${filename}.ast.json`, JSON.stringify(score, null, 2), "application/json")}>AST JSON</button>
            <button type="button" onClick={() => downloadText(`${filename}.v1.json`, JSON.stringify(astToSimpleJson(score), null, 2), "application/json")}>Legacy V1 JSON</button>
            <button type="button" onClick={() => downloadText(`${filename}.learning.json`, JSON.stringify(learningPack ?? astToLearningPack(score), null, 2), "application/json")}>Learning JSON</button>
            <button type="button" onClick={() => downloadText(`${filename}.validation.txt`, validationReport(validationErrors, validationWarnings), "text/plain")}>Validation Report</button>
          </div>
        </details>
      ) : null}

      {result ? <p className="export-result" role="status" aria-live="polite">{result}</p> : null}
    </section>
  );
}

export function sanitizeFilename(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .trim()
    .slice(0, 100) || "Untitled Score";
}

function validationReport(errors: string[], warnings: string[]) {
  return [
    "FoxChild Music Score Lab validation report",
    "",
    `Errors (${errors.length})`,
    ...errors.map((error) => `- ${error}`),
    "",
    `Warnings (${warnings.length})`,
    ...warnings.map((warning) => `- ${warning}`)
  ].join("\n");
}

function applyPrintSettings(options: { paperSize: PaperSize; orientation: Orientation; margin: number; scale: number }) {
  const id = "foxchild-print-settings";
  document.getElementById(id)?.remove();
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `@page { size: ${options.paperSize} ${options.orientation}; margin: ${options.margin}mm; } @media print { .score-osmd-host { transform: scale(${options.scale / 100}); transform-origin: top left; width: ${10000 / options.scale}%; } }`;
  document.head.appendChild(style);
}

function downloadText(filename: string, text: string, type: string) {
  downloadBlob(filename, new Blob([text], { type }));
}

function downloadBytes(filename: string, bytes: Uint8Array, type: string) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  downloadBlob(filename, new Blob([buffer], { type }));
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
