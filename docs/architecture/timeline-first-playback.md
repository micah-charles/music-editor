# Timeline-First Playback Architecture

## Authority boundaries

`FoxChildMusicScore` AST v2 remains the editable source of truth. A compiled `ScoreTimeline` is an immutable runtime projection. MusicXML, MIDI, OSMD, FluidSynth, Tone.js, and browser MIDI are adapters around those two layers.

```text
FoxChildMusicScore AST v2
        |
        v
Timeline compiler (rational musical time)
        |
        +--> tempo map --> seconds conversion
        +--> measure map --> measure/beat navigation
        +--> source IDs --> notation position index
        +--> repeat projection --> playback events/tempo/measures
                                  |
                                  v
                             session scheduler --> audio engine
                                            |
                                            +--> transport UI
                                            +--> piano highlighting
                                            +--> metronome
                                            +--> score cursor/follow
```

## Core rules

- Musical positions and durations use normalized rational values.
- Floating point is used only when converting a score time to audio seconds or UI display.
- Timeline compilation is deterministic and does not mutate the AST.
- An event without an explicit position retains current sequential behavior.
- An event with `position` is placed independently, allowing voices to overlap.
- Every timeline event retains `sourceEventId`, part, staff, voice, and measure identity.
- Muting and soloing are playback projections and do not delete events from the canonical score timeline.
- Repeats are expanded into an immutable playback projection, not copied into the AST. The projection owns expanded events, tempo segments, measure passes, and playback duration while retaining source measure identity.

## Playback session

The session controller owns status, playback time, source notation time, seconds, duration, speed, volume, loop, and the selected engine. React subscribes to snapshots and issues commands. Components do not estimate completion.

The session uses one monotonic clock. Engines receive a normalized event batch and expose cancellation/all-notes-off capabilities; engines that cannot seek natively use an explicit restart adapter. UI updates are sampled from the session clock using animation frames. A tested look-ahead scheduler primitive is available for a future per-note engine contract, but current engines still batch-schedule internally.

Recording and the metronome use a shared recording-clock adapter. During transport playback it reads canonical score time from the playback session. When transport is idle it provides one common monotonic fallback for count-in, performed duration, quantization, and metronome ticks.

## Notation synchronization

After OSMD renders, an adapter builds a position index once. The cursor controller resolves the nearest indexed position from the session source notation time, so repeated passes return to the original notation location. It never resets and walks from the beginning for every note. Auto-follow is separate from cursor movement and pauses after intentional user scrolling.

## Compatibility

Existing v2 JSON remains valid. New positional, voice, staff, numbered clef, staff-count, extension, tempo, meter, key, tie, and repeat fields are optional. A multi-staff instrument remains one part; simultaneous staff/voice lanes are measured by their furthest endpoint rather than summed. The migration layer normalizes missing IDs and positional defaults without changing existing serialized files unless the user edits or saves new structural metadata.

Track mixer values (`volume`, `pan`, `visible`, and `color`) are optional part fields. This keeps project-specific editor state beside mute, solo, channel, and instrument settings while preserving compatibility with older v2 documents. Volume and pan flow through timeline events; direct SF2 receives MIDI volume/pan controllers, sampled playback uses gain/stereo panning, and basic synthesis applies per-event track gain.

## Document history

Score edits now enter bounded undo and redo stacks. Import, metadata edits, note edits, track changes, repairs, transpose, and recorded-event commits share the same history boundary. Replace recording clears the selected track only when the first armed event commits; overdub appends to the selected track.

## Fidelity boundary

D.C., D.S., Coda, Fine, ornaments, pedal, grace-note timing, transposition, and complex nested repeats are not fully interpreted by playback. Explicit tuplet time modification is supported. Unsupported data should remain in extensions and produce fidelity warnings rather than silently changing playback.
