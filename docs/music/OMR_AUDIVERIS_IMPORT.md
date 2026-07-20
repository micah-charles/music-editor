# Audiveris OMR Import

FoxChild Music Score Lab can import scanned score images/PDFs by calling an external local Audiveris OMR helper.

FoxChild does not bundle Audiveris. Audiveris is AGPL-3.0, so it must stay separate unless the project intentionally accepts AGPL obligations. FoxChild only imports the MusicXML/MXL output.

## Workflow

1. Install or clone Audiveris separately.
2. Build Audiveris and locate its CLI executable.
3. Start the local FoxChild OMR helper.
4. Upload a scanned score image/PDF in FoxChild Studio.
5. The helper calls Audiveris:

```bash
Audiveris -batch -transcribe -export \
  -constant org.audiveris.omr.sheet.ProcessingSwitches.fingerings=true \
  -output <dir> -- <input>
```

6. The helper returns MusicXML to Studio.
7. Studio imports MusicXML into FoxChild Music AST v2.
8. The score is rendered, validated, and can be played.
9. Human review is required before treating the score as final.

## Local Setup

For this machine, Audiveris was built at:

```text
/Volumes/ExtremePro/AIWorkspace/audiveris
```

Detected binary:

```text
/Volumes/ExtremePro/AIWorkspace/audiveris/local-dist/app-5.10.2/bin/Audiveris
```

The current Audiveris master build requires Java 25. This machine has Java 25 at:

```text
/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home
```

Create or update `.env.local` in the FoxChild repo:

```bash
AUDIVERIS_BIN=/Volumes/ExtremePro/AIWorkspace/audiveris/local-dist/app-5.10.2/bin/Audiveris
OMR_HELPER_PORT=8787
JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home
AUDIVERIS_JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home
```

The helper enables Audiveris fingering recognition by default. For one-off investigations, add Audiveris processing switches without editing code:

```bash
AUDIVERIS_PROCESSING_SWITCHES="disconnectedBracedParts=true"
AUDIVERIS_EXTRA_ARGS="-constant org.audiveris.omr.sheet.ProcessingSwitches.smallHeads=true"
```

Keep `implicitTuplets=true` opt-in only. On the 2026-07-09 Mozart scan it produced worse final-system rhythm output and still exported no `<time-modification>` tuplets.

Start the helper:

```bash
npm run omr:helper
```

If port `8787` is already occupied by another local service, override the helper port for the current shell:

```bash
OMR_HELPER_PORT=8788 npm run omr:helper
```

Then start Studio with the matching helper URL:

```bash
VITE_OMR_HELPER_URL=http://127.0.0.1:8788 npm --workspace apps/studio run dev -- --host 127.0.0.1 --port 5175
```

Check health:

```bash
curl http://127.0.0.1:8787/health
```

Start Studio:

```bash
npm run dev
```

## Smoke Test

```bash
npm run omr:helper:smoke -- /Volumes/ExtremePro/AIWorkspace/docs/mozart-score.png
```

The helper stores temporary job files under `.omr-work/` unless `OMR_WORK_DIR` is set.

Low-resolution image scans are preflighted with `sips`. If a PNG/JPEG/TIFF is below the practical Audiveris threshold, the helper creates a temporary 300 DPI upscaled PNG before running Audiveris and returns a warning in the import panel. This keeps the original upload untouched while avoiding Audiveris failures like "picture resolution is too low".

## QA Notes

OMR can misread notes, voices, tuplets, dynamics, ornaments, and measure rhythm. Studio marks imported OMR scores with:

```json
{
  "sourceMetadata": {
    "originalFormat": "audiveris-omr",
    "draftTranscription": true
  }
}
```

Measure validation warnings are expected for imperfect OMR output. The AST remains the source of truth after import.

Audiveris log warnings are surfaced in the OMR response when Audiveris reports measure stacks with `no correct rhythm`. Treat these as review targets rather than import failures.

For cut-time pages, Audiveris may correctly export `2/2`. Do not force `4/4` unless the printed score actually shows common time or four-four.
