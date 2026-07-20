import {
  importAstJson,
  importChordMidiToAst,
  midiToAst,
  musicXmlToAst,
  plainTextToAst,
  simpleMelodyAst,
  type FoxChildMusicScore
} from "@foxchild/music-core";
import { useState } from "react";

interface ImportPanelProps {
  onImport: (score: FoxChildMusicScore, message: string) => void;
  onMessage: (message: string) => void;
}

const starterText = `C4 quarter
D4 quarter
E4 quarter
C4 quarter
rest quarter
G4 half`;

export function ImportPanel({ onImport, onMessage }: ImportPanelProps) {
  const [text, setText] = useState(starterText);

  function importPaste() {
    try {
      const trimmed = text.trim();
      const score = trimmed.startsWith("{") ? importAstJson(trimmed) : plainTextToAst(trimmed);
      onImport(score, trimmed.startsWith("{") ? "Imported FoxChild JSON." : "Converted plain text notes into AST.");
    } catch (error) {
      onMessage((error as Error).message);
    }
  }

  async function importFile(file: File | undefined, kind: "musicxml" | "midi" | "chord-midi") {
    if (!file) {
      return;
    }

    try {
      if (kind === "musicxml") {
        const score = musicXmlToAst(await file.text());
        onImport(score, `Imported MusicXML from ${file.name}.`);
      } else if (kind === "chord-midi") {
        const score = importChordMidiToAst(await file.arrayBuffer(), { title: file.name.replace(/\.[^.]+$/, "") });
        onImport(score, `Imported chord MIDI progression from ${file.name}.`);
      } else {
        const score = midiToAst(await file.arrayBuffer(), { title: file.name.replace(/\.[^.]+$/, "") });
        onImport(score, `Imported MIDI draft transcription from ${file.name}.`);
      }
    } catch (error) {
      onMessage((error as Error).message);
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Import</h2>
        <button type="button" onClick={() => onImport(simpleMelodyAst, "Reloaded demo AST score.")}>Demo</button>
      </div>
      <textarea
        className="paste-box"
        value={text}
        onChange={(event) => setText(event.target.value)}
        spellCheck={false}
        aria-label="Paste AST JSON, V1 JSON, or simple note text"
      />
      <div className="button-row">
        <button type="button" className="primary" onClick={importPaste}>Generate Score</button>
      </div>
      <div className="file-grid">
        <label>
          <span>MusicXML</span>
          <input type="file" accept=".musicxml,.xml" onChange={(event) => void importFile(event.target.files?.[0], "musicxml")} />
        </label>
        <label>
          <span>MIDI</span>
          <input type="file" accept=".mid,.midi,audio/midi" onChange={(event) => void importFile(event.target.files?.[0], "midi")} />
        </label>
        <label>
          <span>Chord MIDI</span>
          <input type="file" accept=".mid,.midi,audio/midi" onChange={(event) => void importFile(event.target.files?.[0], "chord-midi")} />
        </label>
      </div>
    </section>
  );
}
