# Browser Use Button QA Report

Date: 2026-07-06
URL: http://127.0.0.1:5176/
Project: /Volumes/ExtremePro/AIWorkspace/music-editor

## Summary

- Passed: 20
- Failed: 0
- Warnings: OSMD emitted non-fatal layout warnings during one Notes-tab render.
- Screenshots: /Volumes/ExtremePro/AIWorkspace/music-editor/qa/browser-use/screenshots

## Results

- PASS: Open studio - page loads at http://127.0.0.1:5176/ with Valid AST v2, V1 compatible, and no console errors.
- PASS: Generate Score - simple note text generated a `Pasted Notes` score.
- PASS: Piano key note input/audition - clicking C4 inserted/auditioned a note and playback highlighted C4.
- PASS: Playback footer no longer exposes a global Instrument dropdown. Footer controls are transport, Sound Engine, Volume, Speed, and Direct SF2 source fields.
- PASS: MusicXML upload - imported `qa/musicxml/mozart_k381_page21_scan_draft.source.musicxml`.
- PASS: Imported Mozart scan draft metadata - D major, 4/4, 120 bpm, 144 notes, 32 displayed track-measures.
- PASS: Imported Mozart scan draft validation - Valid AST v2 and V1 compatible badges visible; no overfilled/incomplete bar errors visible after import.
- PASS: Notes tab opens after MusicXML import.
- PASS: Tracks instrument control shows General MIDI fallback with 128 presets when no valid SF2 catalog has loaded.
- PASS: Track instruments are edited in Tracks, not Playback.
- PASS: Direct SF2 mode exposes SF2 URL and Local SF2 source controls in Playback.
- PASS: Local SF2 upload - uploaded `/private/tmp/GeneralUser GS v1.471.sf2`.
- PASS: Direct SF2 preset catalog - loaded 269 presets from GeneralUser GS into the Tracks instrument dropdown.
- PASS: Direct SF2 preset banks - dropdown includes bank 0 melodic presets and bank 128 drum/SFX presets.
- PASS: Direct SF2 playback smoke - Play enters `playing`, keyboard highlights active notes, Stop returns to `stopped`.
- PASS: Direct SF2 playback console - no console errors captured during local SF2 playback smoke.
- PASS: Generated playable MusicXML upload - imported `qa/musicxml/mozart_k381_page21_scan_playable.musicxml`.
- PASS: Generated playable MusicXML validation - Valid AST v2 and V1 compatible badges visible; no visible measure errors.
- PASS: Export/round-trip smoke - generated MusicXML is well-formed by `xmllint` and imports through the same browser upload path.
- PASS: Core non-browser checks - typecheck, tests, build, and MusicXML smoke scripts pass.

## Evidence

- Initial app / playback footer: `qa/browser-use/screenshots/01-open-studio.png`
- Mozart source MusicXML import: `qa/browser-use/screenshots/04-mozart-musicxml-import.png`
- Notes track instruments: `qa/browser-use/screenshots/05-notes-track-instruments.png`
- Direct SF2 track presets: `qa/browser-use/screenshots/06-direct-sf2-track-presets.png`
- Direct SF2 playback smoke: `qa/browser-use/screenshots/07-direct-sf2-playback.png`
- Generated playable MusicXML import: `qa/browser-use/screenshots/08-playable-musicxml-import.png`
- General generate/play controls: `qa/browser-use/screenshots/09-general-buttons.png`

## Console Warnings / Errors

- OSMD warning during Notes-tab render: `SkyBottomLineCalculator: width not > 0 in measure 1/2`. This did not block import, editing, playback, or validation.
- No application runtime errors captured in the final MusicXML import, Direct SF2 preset, or Direct SF2 playback smoke checks.
