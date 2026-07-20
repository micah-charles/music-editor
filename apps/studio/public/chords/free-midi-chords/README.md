# free-midi-chords Data

This folder is the static drop-in location for MIDI files from:

https://github.com/ldrolez/free-midi-chords

The full generated packs can be large, so this repo does not vendor every MIDI file by default. To populate the folder, download a release from upstream or run:

```bash
git clone https://github.com/ldrolez/free-midi-chords /tmp/free-midi-chords
```

Then copy or generate selected MIDI files into this folder and update:

```text
apps/studio/public/chords/chord-library-index.json
```

## License

The upstream MIDI chord pack is MIT licensed. Preserve the MIT notice in `LICENSE`.
