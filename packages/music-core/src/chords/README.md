# FoxChild Chord Module

This module adopts `free-midi-chords` as a static-friendly chord/progression source without making MIDI the internal model.

Flow:

```text
free-midi-chords MIDI
→ parse MIDI
→ FoxChild Music AST chord events
→ render / play / edit / export
```

The upstream project is MIT licensed:

```text
Copyright (c) 2019 Ludovic Drolez
```

Do not commit a full generated chord pack unless size and licensing are explicitly reviewed. The Studio can work from `public/chords/chord-library-index.json` and MIDI files placed under `public/chords/free-midi-chords/`.
