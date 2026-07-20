# Audiveris OMR Browser QA

Date: 2026-07-07

## Environment

- Studio URL: `http://127.0.0.1:5175/`
- OMR helper URL: `http://127.0.0.1:8788/`
- Default helper port `8787` was already occupied by a separate local Python service, so QA used `OMR_HELPER_PORT=8788` and `VITE_OMR_HELPER_URL=http://127.0.0.1:8788`.
- Audiveris binary: `/Volumes/ExtremePro/AIWorkspace/audiveris/local-dist/app-5.10.2/bin/Audiveris`
- Java home: `/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home`
- Test scan: `/Volumes/ExtremePro/AIWorkspace/music-editor/qa/omr/mozart-score.png`

## Checks

| Check | Result | Evidence |
|---|---:|---|
| Helper health responds and reports Audiveris configured | Pass | `curl http://127.0.0.1:8788/health` returned `ok: true`, `audiverisConfigured: true` |
| Studio shows Scan OMR panel | Pass | `screenshots/10-omr-panel.png` |
| Browser upload accepts the Mozart scan | Pass | Browse upload reported `mozart-score.png (1205777B)` |
| Helper runs real Audiveris, not mock mode | Pass | UI warnings include 300 DPI upscale and MXL unpacking; helper health `mockConfigured: false` |
| Returned MusicXML imports into AST | Pass | UI message: `Imported Audiveris OMR draft from mozart-score.png` |
| Measure validation runs after import | Pass | UI shows `1 errors`, `1 bar warning`, and `Measure 1 overfilled: 15 / 4 beats` |
| OSMD renders imported notation | Pass | `screenshots/11-omr-imported.png` |
| Playback starts from imported OMR score | Pass | Footer state changes to `playing`; active score note shows `Playing E3 · measure 1` |
| Score note highlighting during playback works | Pass | `screenshots/12-omr-playback.png` shows active note highlight in the score |
| AST contains OMR source metadata | Pass | AST tab contains `originalFormat: "audiveris-omr"` and `draftTranscription: true` |
| Browser console errors | Pass | `console --errors` returned `(no console errors)` for import and playback passes |

## Screenshots

- `qa/browser-use/screenshots/10-omr-panel.png`
- `qa/browser-use/screenshots/11-omr-imported.png`
- `qa/browser-use/screenshots/12-omr-playback.png`
- `qa/browser-use/screenshots/13-omr-ast-metadata.png`

## Known OMR Quality Note

Audiveris produced a draft one-measure transcription from the low-resolution rotated page photo. The import path is functional and preserves warnings, but the musical result needs human correction before use. This is expected for OMR and is why FoxChild marks the score as `draftTranscription: true`.
