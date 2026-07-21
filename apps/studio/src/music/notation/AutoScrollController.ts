export class AutoScrollController {
  private enabled = true;

  suspend(): void {
    this.enabled = false;
  }

  resume(): void {
    this.enabled = true;
  }

  follow(container: HTMLElement): void {
    if (!this.enabled) {
      return;
    }
    const cursor = container.querySelector<HTMLElement>(".osmd-cursor");
    if (!cursor) {
      return;
    }
    const frame = container.getBoundingClientRect();
    const cursorBox = cursor.getBoundingClientRect();
    const outside = cursorBox.left < frame.left + 32 || cursorBox.right > frame.right - 32 || cursorBox.top < frame.top + 32 || cursorBox.bottom > frame.bottom - 32;
    if (!outside) {
      return;
    }
    cursor.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
      inline: "center"
    });
  }
}
