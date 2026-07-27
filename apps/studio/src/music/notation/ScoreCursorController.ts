import type { Rational } from "@foxchild/music-core";
import type { OsmdCursorLike, OsmdPositionIndex } from "./OsmdPositionIndex";

export class ScoreCursorController {
  private currentStep = 0;

  constructor(
    private readonly cursor: OsmdCursorLike,
    private readonly index: OsmdPositionIndex
  ) {}

  moveTo(scoreTime: Rational, visible: boolean): HTMLElement | null {
    if (!visible || this.index.entries.length === 0) {
      this.cursor.hide?.();
      return null;
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
      const highlight = this.cursor.cursorElement ?? null;
      if (highlight) {
        highlight.classList.add("score-playback-highlight");
        delete highlight.dataset.playbackHighlightError;
      }
      return highlight;
    } catch (error) {
      this.cursor.hide?.();
      if (this.cursor.cursorElement) {
        this.cursor.cursorElement.dataset.playbackHighlightError = error instanceof Error ? error.message : String(error);
      }
      console.warn("Unable to update the notation playback highlight.", error);
      return null;
    }
  }
}
