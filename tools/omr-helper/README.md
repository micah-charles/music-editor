# FoxChild OMR Helper

Local helper service for converting scanned score images/PDFs with an external Audiveris CLI.

FoxChild does not bundle Audiveris and does not copy Audiveris source code. The helper calls a user-installed Audiveris executable, receives MusicXML/MXL output, unpacks it if needed, and returns MusicXML to the Studio app.

## Setup

Build Audiveris separately, then set:

```bash
AUDIVERIS_BIN=/Volumes/ExtremePro/AIWorkspace/audiveris/local-dist/app-5.10.2/bin/Audiveris
OMR_HELPER_PORT=8788
JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home
AUDIVERIS_JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home
```

The helper requests English and Japanese OCR by default (`eng+jpn`). Install the
legacy-compatible Tesseract 4.x `eng.traineddata` and `jpn.traineddata` files in
the Audiveris user `tessdata` directory. Override the language set when needed:

```bash
AUDIVERIS_OCR_LANGUAGES=eng
```

The repo root `.env.local` may hold these values.

By default the helper passes:

```bash
-constant org.audiveris.omr.sheet.ProcessingSwitches.fingerings=true
-constant org.audiveris.omr.sheet.ProcessingSwitches.smallHeads=true
```

These switches preserve printed fingering numbers and enable recognition of small/cue noteheads. Fingering recognition was verified not to change measure validation for the Mozart scan tested on 2026-07-09.

Some dense scores can trigger an Audiveris 5.10.2 failure at the `STEMS` step when small-head recognition is enabled. When the helper sees that exact failure, it automatically retries the complete input with `smallHeads=false`. A successful fallback is imported with a warning that cue-sized notes may be missing. Other Audiveris failures are not silently retried.

## Local Codex Review

The optional post-OMR review invokes the locally installed Codex CLI. It uses the CLI's existing ChatGPT login; the Studio browser does not receive or send an API key.

```bash
codex login status
```

The expected result is `Logged in using ChatGPT`. Optional helper settings are:

```bash
# Override the executable only when codex is not available on PATH.
CODEX_BIN=/Users/charlestan/.local/bin/codex

# Omit this to use the model configured by the local Codex installation.
CODEX_OMR_MODEL=gpt-5.6-sol

# Default: 180000 milliseconds.
CODEX_OMR_TIMEOUT_MS=180000

# Disable the integration without changing the UI build.
OMR_AI_CORRECTION_DISABLED=false
```

The helper starts an ephemeral Codex task in the OMR job directory with a read-only sandbox and a strict JSON output schema. Codex returns advisory proposals only. The Studio stores those proposals with the imported score and requires the user to apply, reject, or mark each one reviewed.

Optional tuning:

```bash
# Space or comma separated short switch names are accepted.
AUDIVERIS_PROCESSING_SWITCHES="disconnectedBracedParts=true"

# Disable FoxChild's default Audiveris switches.
AUDIVERIS_DISABLE_DEFAULT_SWITCHES=true

# Advanced raw Audiveris args, appended before -output.
AUDIVERIS_EXTRA_ARGS="-constant org.audiveris.omr.sheet.ProcessingSwitches.lyrics=true"
```

Do not enable `implicitTuplets=true` globally. It worsened the 2026-07-09 Mozart scan and still exported no MusicXML tuplets.

## Run

```bash
npm install
npm run dev
```

Health check:

```bash
curl http://127.0.0.1:8788/health
```

## Smoke

```bash
npm run smoke -- /Volumes/ExtremePro/AIWorkspace/docs/mozart-score.png
```

The helper returns Audiveris log-derived warnings, including measure stacks where Audiveris reports `no correct rhythm`.

## License Boundary

Audiveris is AGPL-3.0. Keep it separate from FoxChild unless the project intentionally accepts AGPL obligations. This helper shells out to Audiveris as an external local converter.
