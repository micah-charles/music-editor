import { describe, expect, it } from "vitest";
import {
  analyzeAudiverisLogs,
  buildAudiverisArgs,
  buildProcessingSwitchArgs,
  shouldRetryWithoutSmallHeads
} from "../src/audiverisRunner";

describe("audiverisRunner", () => {
  it("enables fingering recognition by default without enabling implicit tuplets", () => {
    const args = buildAudiverisArgs("/tmp/input.jpg", "/tmp/output", {});

    expect(args).toContain("-batch");
    expect(args).toContain("-transcribe");
    expect(args).toContain("-export");
    expect(args).toContain("org.audiveris.omr.sheet.ProcessingSwitches.fingerings=true");
    expect(args).toContain("org.audiveris.omr.sheet.ProcessingSwitches.smallHeads=true");
    expect(args).toContain("org.audiveris.omr.text.Language.defaultSpecification=eng+jpn");
    expect(args.some((arg) => arg.includes("implicitTuplets"))).toBe(false);
    expect(args.slice(-3)).toEqual(["/tmp/output", "--", "/tmp/input.jpg"]);
  });

  it("allows the OCR language specification to be overridden", () => {
    const args = buildAudiverisArgs("/tmp/input.pdf", "/tmp/output", {
      AUDIVERIS_OCR_LANGUAGES: "eng"
    });
    expect(args).toContain("org.audiveris.omr.text.Language.defaultSpecification=eng");
  });

  it("allows explicit processing switches and default switch disabling", () => {
    expect(buildProcessingSwitchArgs({
      AUDIVERIS_DISABLE_DEFAULT_SWITCHES: "true",
      AUDIVERIS_PROCESSING_SWITCHES: "disconnectedBracedParts=true implicitTuplets=false"
    })).toEqual([
      "-constant",
      "org.audiveris.omr.sheet.ProcessingSwitches.disconnectedBracedParts=true",
      "-constant",
      "org.audiveris.omr.sheet.ProcessingSwitches.implicitTuplets=false"
    ]);
  });

  it("turns Audiveris rhythm log lines into user warnings", () => {
    const warnings = analyzeAudiverisLogs(`
      S4 MeasureStack#24 no correct rhythm
      S5 MeasureStack#25 no correct rhythm
      Step CUE_BEAMS is skipped because small heads switch is off
    `);

    expect(warnings).toEqual([
      "Audiveris reported 2 rhythm issue(s) in measure stack(s) 24, 25. Review these OMR bars against the scan.",
      "Audiveris skipped cue-beam detection because small-head recognition is disabled."
    ]);
  });

  it("retries a STEMS crash only when small-head recognition is effectively enabled", () => {
    const logs = [
      "INFO [idol#6] StepMonitoring 98 | STEMS",
      "WARN [idol#6] Book 2044 | Error processing stub"
    ].join("\n");
    const enabled = buildAudiverisArgs("/tmp/input.pdf", "/tmp/output", {});
    const disabled = buildAudiverisArgs("/tmp/input.pdf", "/tmp/output", {}, {
      finalProcessingSwitches: { smallHeads: "false" }
    });

    expect(shouldRetryWithoutSmallHeads(logs, enabled)).toBe(true);
    expect(shouldRetryWithoutSmallHeads(logs, disabled)).toBe(false);
    expect(shouldRetryWithoutSmallHeads("INFO | RHYTHMS\nWARN | Error processing stub", enabled)).toBe(false);
  });

  it("reports missing OCR language data separately from recognition failures", () => {
    expect(analyzeAudiverisLogs("WARN [] Languages 142 | *** No installed OCR languages ***")).toEqual([
      "Audiveris has no English OCR language installed. Title, composer, lyrics, tempo text, and other words may be missing."
    ]);
  });
});
