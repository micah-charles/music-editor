import { describe, expect, it } from "vitest";
import { metronomeBeatInfo } from "./metronome";

describe("metronomeBeatInfo", () => {
  it("accents beat one", () => {
    expect(metronomeBeatInfo(0, 4)).toMatchObject({ beatInBar: 1, isAccent: true });
    expect(metronomeBeatInfo(2, 4)).toMatchObject({ beatInBar: 3, isAccent: false });
  });

  it("marks count-in beats before zero", () => {
    expect(metronomeBeatInfo(-4, 4, 4)).toMatchObject({ beatInBar: 1, isAccent: true, isCountIn: true });
    expect(metronomeBeatInfo(0, 4, 4)).toMatchObject({ beatInBar: 1, isAccent: true, isCountIn: false });
  });
});
