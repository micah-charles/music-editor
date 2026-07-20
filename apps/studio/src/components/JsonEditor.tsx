import { importAstJson, type FoxChildMusicScore } from "@foxchild/music-core";
import { useEffect, useState } from "react";

interface JsonEditorProps {
  score: FoxChildMusicScore;
  onApply: (score: FoxChildMusicScore) => void;
  onMessage: (message: string) => void;
}

export function JsonEditor({ score, onApply, onMessage }: JsonEditorProps) {
  const [text, setText] = useState(() => JSON.stringify(score, null, 2));

  useEffect(() => {
    setText(JSON.stringify(score, null, 2));
  }, [score]);

  function applyJson() {
    try {
      onApply(importAstJson(text));
    } catch (error) {
      onMessage((error as Error).message);
    }
  }

  return (
    <section className="panel json-panel">
      <div className="panel-heading">
        <h2>AST JSON</h2>
        <button type="button" onClick={() => setText(JSON.stringify(score, null, 2))}>Format</button>
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        spellCheck={false}
        aria-label="FoxChild Music AST JSON editor"
      />
      <div className="button-row">
        <button type="button" onClick={applyJson}>Apply JSON</button>
      </div>
    </section>
  );
}
