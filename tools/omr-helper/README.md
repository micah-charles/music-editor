# FoxChild OMR Helper

Local helper service for converting scanned score images/PDFs with an external Audiveris CLI.

FoxChild does not bundle Audiveris and does not copy Audiveris source code. The helper calls a user-installed Audiveris executable, receives MusicXML/MXL output, unpacks it if needed, and returns MusicXML to the Studio app.

## Setup

Build Audiveris separately, then set:

```bash
AUDIVERIS_BIN=/Volumes/ExtremePro/AIWorkspace/audiveris/local-dist/app-5.10.2/bin/Audiveris
OMR_HELPER_PORT=8787
JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home
AUDIVERIS_JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home
```

The repo root `.env.local` may hold these values.

By default the helper passes:

```bash
-constant org.audiveris.omr.sheet.ProcessingSwitches.fingerings=true
```

This preserves printed fingering numbers in MusicXML and was verified not to change measure validation for the Mozart scan tested on 2026-07-09.

Optional tuning:

```bash
# Space or comma separated short switch names are accepted.
AUDIVERIS_PROCESSING_SWITCHES="disconnectedBracedParts=true"

# Disable FoxChild's default Audiveris switches.
AUDIVERIS_DISABLE_DEFAULT_SWITCHES=true

# Advanced raw Audiveris args, appended before -output.
AUDIVERIS_EXTRA_ARGS="-constant org.audiveris.omr.sheet.ProcessingSwitches.smallHeads=true"
```

Do not enable `implicitTuplets=true` globally. It worsened the 2026-07-09 Mozart scan and still exported no MusicXML tuplets.

## Run

```bash
npm install
npm run dev
```

Health check:

```bash
curl http://127.0.0.1:8787/health
```

## Smoke

```bash
npm run smoke -- /Volumes/ExtremePro/AIWorkspace/docs/mozart-score.png
```

The helper returns Audiveris log-derived warnings, including measure stacks where Audiveris reports `no correct rhythm`.

## License Boundary

Audiveris is AGPL-3.0. Keep it separate from FoxChild unless the project intentionally accepts AGPL obligations. This helper shells out to Audiveris as an external local converter.
