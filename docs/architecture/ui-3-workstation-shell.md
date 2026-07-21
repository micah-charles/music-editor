# UI 3.0 Workstation Shell

## Layout authority

The score remains the primary document surface. Application chrome is divided into five stable regions:

1. Compact document header.
2. Workspace navigation.
3. Center workspace canvas.
4. Context inspector.
5. Keyboard dock and transport.

The center canvas owns remaining width and height. Opening the keyboard reduces only the canvas region; it does not move the transport or page scroll position.

## Workspaces

Workspace selection changes which existing production tools occupy the center canvas and inspector:

- Score: notation canvas and score/track inspector.
- Piano Input: notation with Performance keyboard.
- Piano Roll and Mixer: editable track/event surface.
- Recording: notation with Teaching keyboard and MIDI controls.
- OMR Review: notation with OMR and file import inspector.
- AI Analysis and Learning: difficulty and learning-pack views.
- Export: score export actions.
- Settings: metadata, AST, chord, and layout controls.

No workspace creates a second copy of score state. Every editor receives the same canonical AST and history boundary.

## Persistent layout

`foxchild-ui-3-layout-v1` stores only presentation state in browser local storage:

- active workspace;
- navigation collapse;
- inspector visibility, collapse, dock, and width;
- keyboard visibility, mode, and custom height;
- validation expansion.

Score data, playback state, selected files, and device permissions are not stored in the layout record.

## Inspector

The inspector can be hidden, collapsed, docked left, docked right, floated, and resized. Desktop docking participates in the main flex layout. On compact viewports it becomes a contained overlay so it cannot squeeze the score out of view.

## Keyboard

The keyboard is hidden by default. It opens when selected manually, when Piano Input or Recording is selected, when MIDI recording is active, or when a MIDI device is connected.

- Compact: playable keys only.
- Performance: note-entry controls and keys.
- Teaching: note-entry, metronome, MIDI, and keys.
- Fullscreen: maximum available vertical space.

The top resize handle sets a custom Performance height. Compact viewports restore manual openings to Compact mode; explicit Piano Input and Recording selections still choose their intended modes.

## Validation

Validation is represented by one collapsed banner by default. Expanding it exposes schema, measure, and fidelity messages and enables measure repair cards in the notation view. This prevents warnings from displacing the score until the user asks to review them.

## Responsive behavior

At desktop width, navigation, score, and inspector remain side by side. Below 1180 px navigation uses icon mode. At 820 px and below, navigation starts collapsed, the inspector starts hidden and opens as an overlay, Compact keyboard shows keys above the fixed transport, and the document never creates body-level horizontal overflow.
