import type { Mode, Step } from "../ast/types";

export type ChordProgressionEntry = {
  id: string;
  title: string;
  sourcePath: string;
  key?: string;
  mode?: Mode | "unknown";
  style?: string;
  progression?: string;
  tags?: string[];
  license: "MIT";
};

export type ChordProgressionAstOptions = {
  id?: string;
  title?: string;
  key?: Step;
  mode?: Mode;
  tempo?: number;
  progression?: string;
  style?: string;
  barsPerChord?: number;
};
