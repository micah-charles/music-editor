import {
  chordProgressionToAst,
  getDemoChordLibraryIndex,
  insertChordProgressionIntoScore,
  type ChordProgressionEntry,
  type FoxChildMusicScore,
  type Mode,
  type Step
} from "@foxchild/music-core";
import { useEffect, useMemo, useState } from "react";

interface ChordProgressionPanelProps {
  score: FoxChildMusicScore;
  onPreview: (score: FoxChildMusicScore, message: string) => void;
  onInsert: (score: FoxChildMusicScore, message: string) => void;
  onMessage: (message: string) => void;
}

const keys: Step[] = ["C", "D", "E", "F", "G", "A", "B"];
const modes: Mode[] = ["major", "minor"];

export function ChordProgressionPanel({ score, onPreview, onInsert, onMessage }: ChordProgressionPanelProps) {
  const [entries, setEntries] = useState<ChordProgressionEntry[]>(() => getDemoChordLibraryIndex());
  const [key, setKey] = useState<Step>("C");
  const [mode, setMode] = useState<Mode>("major");
  const [style, setStyle] = useState("All");
  const [selectedId, setSelectedId] = useState(entries[0]?.id ?? "");
  const [tempo, setTempo] = useState(score.global.tempo.bpm);

  useEffect(() => {
    fetch("/chords/chord-library-index.json")
      .then((response) => response.ok ? response.json() : getDemoChordLibraryIndex())
      .then((data: ChordProgressionEntry[]) => {
        setEntries(data);
        setSelectedId((current) => current || data[0]?.id || "");
      })
      .catch(() => setEntries(getDemoChordLibraryIndex()));
  }, []);

  const styles = useMemo(() => ["All", ...Array.from(new Set(entries.map((entry) => entry.style).filter(Boolean))) as string[]], [entries]);
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const styleMatches = style === "All" || entry.style === style;
      const modeMatches = entry.mode === mode || entry.mode === "unknown";
      return styleMatches && modeMatches;
    });
  }, [entries, mode, style]);
  const selectedEntry = filteredEntries.find((entry) => entry.id === selectedId) ?? filteredEntries[0] ?? entries[0];

  useEffect(() => {
    if (selectedEntry && !filteredEntries.some((entry) => entry.id === selectedId)) {
      setSelectedId(selectedEntry.id);
    }
  }, [filteredEntries, selectedEntry, selectedId]);

  function buildProgressionScore() {
    if (!selectedEntry) {
      throw new Error("No chord progression selected.");
    }
    return chordProgressionToAst(selectedEntry, {
      key,
      mode,
      tempo,
      title: `${selectedEntry.title} in ${key} ${mode}`
    });
  }

  function preview() {
    try {
      const progressionScore = buildProgressionScore();
      onPreview(progressionScore, `Preview armed: ${progressionScore.metadata.title}. Press Play in the playback bar.`);
    } catch (error) {
      onMessage((error as Error).message);
    }
  }

  function insert() {
    try {
      const progressionScore = buildProgressionScore();
      onInsert(insertChordProgressionIntoScore(score, progressionScore), `Inserted ${selectedEntry?.progression ?? "chord progression"} into the score.`);
    } catch (error) {
      onMessage((error as Error).message);
    }
  }

  return (
    <section className="panel chord-panel">
      <div className="panel-heading">
        <h2>Chord Library</h2>
        <span className="mini-license">MIT</span>
      </div>
      <div className="field-grid">
        <label className="field">
          <span>Key</span>
          <select value={key} onChange={(event) => setKey(event.target.value as Step)}>
            {keys.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Mode</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
            {modes.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Style</span>
          <select value={style} onChange={(event) => setStyle(event.target.value)}>
            {styles.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Tempo</span>
          <input type="number" min={40} max={220} value={tempo} onChange={(event) => setTempo(Number(event.target.value) || 90)} />
        </label>
      </div>
      <label className="field">
        <span>Progression</span>
        <select value={selectedEntry?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>
          {filteredEntries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.progression} · {entry.title}
            </option>
          ))}
        </select>
      </label>
      {selectedEntry ? (
        <div className="chord-entry-summary">
          <strong>{selectedEntry.progression}</strong>
          <p>{selectedEntry.title}</p>
          <code>{selectedEntry.sourcePath}</code>
        </div>
      ) : null}
      <div className="button-row">
        <button type="button" onClick={preview}>Preview</button>
        <button type="button" className="primary" onClick={insert}>Insert into Score</button>
      </div>
    </section>
  );
}
