# Track Editor architecture

The Track Editor is an AST editor, not an audio mixer. Track controls update
`Part` properties, event controls update `MusicEvent` values, and every edit
flows through the Studio's bounded undo/redo history. MusicXML and MIDI remain
import/export formats.

## Synchronization

- Track Editor and Piano Roll share the selected event key
  `partId:measureNumber:eventId`.
- Score view resolves the shared key and positions its notation cursor at the
  selected measure.
- Playback, the Track Editor playhead, event highlighting, and the mini score
  strip use the same playback session and rational source time.
- Part visibility, mute, solo, instrument, channel, volume, pan, colour, group,
  lock, and freeze values persist on the canonical AST.

## Editing surfaces

The desktop workspace contains a transport toolbar, orchestral track list,
measure/beat timeline, track/event inspector, Event List, Direct Note Entry,
Piano Keyboard, Spreadsheet, and mini score strip. Tablet and phone breakpoints
stack the inspector and simplify the track controls without creating a separate
data model.

Direct Note Entry accepts pitches, accidentals, octaves, chords, rests, grace
notes, tuplets, and `w`, `h`, `q`, `8`, `16`, and `32` duration tokens. Invalid
tokens are rejected before the AST is changed.

## Scale

Timeline events are windowed to the visible horizontal range with one measure
of overscan. Track lanes use browser content visibility, and overview/mini-score
rendering is capped with evenly sampled events. This keeps dense scores
interactive without changing or truncating the underlying AST.
