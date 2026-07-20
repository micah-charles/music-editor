import type { FoxChildMusicScore, Mode, Step } from "@foxchild/music-core";

interface ScoreMetadataEditorProps {
  score: FoxChildMusicScore;
  onChange: (score: FoxChildMusicScore) => void;
}

const steps: Step[] = ["C", "D", "E", "F", "G", "A", "B"];
const modes: Mode[] = ["major", "minor"];

export function ScoreMetadataEditor({ score, onChange }: ScoreMetadataEditorProps) {
  function patch(patchScore: Partial<FoxChildMusicScore>) {
    onChange({ ...score, ...patchScore });
  }

  return (
    <section className="panel compact-panel">
      <div className="panel-heading">
        <h2>Score</h2>
      </div>
      <label className="field">
        <span>Title</span>
        <input
          value={score.metadata.title}
          onChange={(event) => patch({ metadata: { ...score.metadata, title: event.target.value } })}
        />
      </label>
      <label className="field">
        <span>Composer</span>
        <input
          value={score.metadata.composer ?? ""}
          onChange={(event) => patch({ metadata: { ...score.metadata, composer: event.target.value } })}
        />
      </label>
      <div className="field-grid">
        <label className="field">
          <span>Tempo</span>
          <input
            type="number"
            min={20}
            max={280}
            value={score.global.tempo.bpm}
            onChange={(event) => patch({ global: { ...score.global, tempo: { ...score.global.tempo, bpm: Number(event.target.value) || 90 } } })}
          />
        </label>
        <label className="field">
          <span>Key</span>
          <select
            value={score.global.key.tonic}
            onChange={(event) => patch({ global: { ...score.global, key: { ...score.global.key, tonic: event.target.value as Step } } })}
          >
            {steps.map((step) => <option key={step} value={step}>{step}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Mode</span>
          <select
            value={score.global.key.mode}
            onChange={(event) => patch({ global: { ...score.global, key: { ...score.global.key, mode: event.target.value as Mode } } })}
          >
            {modes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Meter</span>
          <select
            value={`${score.global.timeSignature.beats}/${score.global.timeSignature.beatType}`}
            onChange={(event) => {
              const [beats, beatType] = event.target.value.split("/").map(Number);
              patch({ global: { ...score.global, timeSignature: { beats, beatType } } });
            }}
          >
            <option value="4/4">4/4</option>
            <option value="3/4">3/4</option>
            <option value="2/4">2/4</option>
            <option value="6/8">6/8</option>
          </select>
        </label>
      </div>
    </section>
  );
}
