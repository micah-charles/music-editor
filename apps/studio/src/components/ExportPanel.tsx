import {
  astToMidi,
  astToSimpleJson,
  type FoxChildMusicScore,
  type FoxChildLearningPack
} from "@foxchild/music-core";

interface ExportPanelProps {
  score: FoxChildMusicScore;
  musicXml: string;
  learningPack: FoxChildLearningPack;
}

export function ExportPanel({ score, musicXml, learningPack }: ExportPanelProps) {
  return (
    <section className="export-bar">
      <button type="button" onClick={() => downloadText(`${score.id}.score.ast.json`, JSON.stringify(score, null, 2), "application/json")}>
        Export AST
      </button>
      <button type="button" onClick={() => downloadText(`${score.id}.score.v1.json`, JSON.stringify(astToSimpleJson(score), null, 2), "application/json")}>
        Export V1 JSON
      </button>
      <button type="button" onClick={() => downloadText(`${score.id}.musicxml`, musicXml, "application/vnd.recordare.musicxml+xml")}>
        Export MusicXML
      </button>
      <button type="button" onClick={() => downloadBytes(`${score.id}.mid`, astToMidi(score), "audio/midi")}>
        Export MIDI
      </button>
      <button type="button" onClick={() => downloadText(`${score.id}.learning-pack.json`, JSON.stringify(learningPack, null, 2), "application/json")}>
        Learning Pack
      </button>
    </section>
  );
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
  URL.revokeObjectURL(url);
}
