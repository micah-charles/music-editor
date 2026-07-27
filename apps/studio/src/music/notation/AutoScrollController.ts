export class AutoScrollController {
  private enabled = true;

  suspend(): void {
    this.enabled = false;
  }

  resume(): void {
    this.enabled = true;
  }

  follow(container: HTMLElement, highlight?: HTMLElement | null): void {
    if (!this.enabled) {
      return;
    }
    const target = highlight
      ?? container.querySelector<HTMLElement>(".score-playback-highlight, [id^='cursorImg-']");
    if (!target || target.offsetWidth === 0 || target.offsetHeight === 0) {
      return;
    }
    const frame = container.getBoundingClientRect();
    const cursorBox = target.getBoundingClientRect();
    const outside = cursorBox.left < frame.left + 32 || cursorBox.right > frame.right - 32 || cursorBox.top < frame.top + 32 || cursorBox.bottom > frame.bottom - 32;
    if (!outside) {
      return;
    }
    target.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
      inline: "center"
    });
  }
}
