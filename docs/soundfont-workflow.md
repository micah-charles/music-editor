# SoundFont Playback Workflow

FoxChild Music Score Lab stays static-first. The app does not make the SoundFont the source of truth:

```text
FoxChild Music AST
→ playback events
→ playback engine
→ audio output
```

Instrument selection belongs to Tracks, not the Playback footer. Playback chooses the engine and the SoundFont source. Each track chooses its bank/program preset, MIDI channel, mute, and solo state.

When Direct SF2 is selected, the app parses the selected `.sf2` preset header and fills the Tracks instrument dropdown from the real SoundFont catalog. If the selected file cannot be parsed, Tracks falls back to the 128 General MIDI preset list so the score remains editable.

```text
.sf2 selected in Playback
→ parse preset header
→ Tracks instrument dropdown
→ AST part.instrument.soundFontBank / soundFontPreset
→ playback events
→ bank select + program change + notes
```

## Browser Static Workflow

Use extracted samples for browser playback:

```text
.sf2
→ extract selected notes to mp3/ogg/wav
→ place files under apps/studio/public/samples/{instrument}/
→ update sample-map.json
→ play through SamplePlaybackEngine or SoundFont extracted-samples mode
```

Example map:

```json
{
  "instrument": "piano",
  "format": "wav",
  "samples": {
    "C4": "/samples/piano/C4.wav",
    "E4": "/samples/piano/E4.wav",
    "G4": "/samples/piano/G4.wav"
  }
}
```

The sample player uses the nearest available sample if an exact note is missing and repitches it with Web Audio.

## High Quality Native Workflow

For future offline rendering, export MIDI and render it with FluidSynth:

```bash
fluidsynth -ni soundfont.sf2 input.mid -F output.wav -r 44100
```

Future flow:

```text
FoxChild AST
→ MIDI
→ FluidSynth CLI + .sf2
→ WAV/MP3
```

This native workflow is optional and is not required for the browser app.
