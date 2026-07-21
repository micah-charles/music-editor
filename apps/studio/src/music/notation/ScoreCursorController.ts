import type { Rational } from "@foxchild/music-core";
import type { OsmdCursorLike, OsmdPositionIndex } from "./OsmdPositionIndex";

export class ScoreCursorController {
  private currentStep = 0;

  constructor(
    private readonly cursor: OsmdCursorLike,
    private readonly index: OsmdPositionIndex
  ) {}

  moveTo(scoreTime: Rational, visible: boolean): void {
    if (!visible || this.index.entries.length === 0) {
      this.cursor.hide?.();
      return;
    }

    const targetStep = this.index.stepAtScoreTime(scoreTime);
    try {
      if (targetStep < this.currentStep) {
        this.cursor.reset?.();
        this.currentStep = 0;
      }
      while (this.currentStep < targetStep && !this.cursor.Iterator?.EndReached) {
        this.cursor.next?.();
        this.currentStep += 1;
      }
      this.cursor.show?.();
      this.cursor.update?.();
    } catch {
      this.cursor.hide?.();
    }
  }
}
