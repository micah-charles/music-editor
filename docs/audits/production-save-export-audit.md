# Production save and export audit

Date: 2026-07-28

This audit records the repository state before the production persistence and
save/export implementation. The revised v2 strategy is authoritative: Save is
internal IndexedDB persistence; normal music export is MusicXML, MIDI, or
Print/Save as PDF; internal JSON is developer-only; no proprietary score
package is exposed.

## Current route and workspace map

The Studio has no URL router. `App` stores one `WorkspaceId` in the UI layout
state and switches React surfaces in place.

| Workspace ID | Visible label | Current surface |
| --- | --- | --- |
| `home` | Home | Nine-card launcher and project flower |
| `score` | Score | OSMD notation view |
| `piano-input` | Piano Input | Score plus keyboard dock |
| `piano-roll` | Piano Roll | Editable event/track table |
| `track-editor` | Track Editor | DAW-style AST timeline |
| `recording` | Performance | Score plus recording keyboard |
| `omr-review` | OMR Review | OMR fidelity review and import panels |
| `learning` | Learning | Learning catalogue and runners |
| `export` | Print | Existing export panel |
| `settings` | Settings | Metadata, layout, JSON and chord tools |

The only URL-specific behavior redirects disabled AI Analysis paths to Score.
Direct project routes, browser Back integration and project-ID routing do not
exist.

## Existing persistence

- `foxchild-ui-3-layout-v1` in localStorage stores workspace/layout preferences.
- Learning attempt runtime stores attempts in localStorage.
- The editable score exists only in React state.
- There is no IndexedDB project database, current-project ID, autosave,
  recovery snapshot, saved revision, recent-project query or project library.
- The Home recent-project row is currently derived from the in-memory demo
  score and is not authoritative persistence.

## Existing project identity

`FoxChildMusicScore.id` identifies the score document, but there is no separate
saved-project record containing created/updated/opened timestamps, favourite or
archive state, last workspace, revision, recovery state or saved UI state.
The built-in `simpleMelodyAst` is loaded as the initial editor score and can be
mistaken for a user project.

## Existing imports

| Format | Status | Entry point |
| --- | --- | --- |
| AST v2 JSON | Working and validated | Paste/import parser |
| Legacy V1 JSON | Working through migration | Paste/import parser |
| Plain note text | Working | Paste/import parser |
| MusicXML/XML | Working | Paste and file picker |
| MIDI | Working draft transcription | File picker |
| Chord MIDI | Working | File picker |
| PDF/image OMR | Optional backend, explicit user start | OMR file picker |

There is no central import workflow or destructive-replacement safeguard.

## Existing exports and print

| Output | Current behavior |
| --- | --- |
| AST JSON | Direct browser download in normal Export panel |
| V1 JSON | Direct browser download in normal Export panel |
| MusicXML | Direct browser download |
| MIDI | Direct browser download |
| Learning Pack JSON | Direct browser download in normal Export panel |
| Print/PDF | OSMD score view calls `window.print()` with print CSS |

There is no dedicated export centre, filename/scope UI, validation summary,
developer-mode gate or explicit Save-as-PDF wording. There is no direct PDF
generator, so the honest production path is a clean Print View plus the
browser's Print / Save as PDF dialog.

## Missing production features

- IndexedDB repository and schema migration
- explicit current project ID
- real recent projects and Project Browser
- autosave with truthful status
- manual Save and Cmd/Ctrl+S
- recovery snapshots and unclean-session detection
- duplicate, rename, favourite, archive, restore and confirmed deletion
- bounded revision checkpoints and restore
- normal-user export separation from developer data
- Developer Mode preference
- coherent project top bar and command palette
- URL project routes and browser history integration
- central import/export status and validation

## Migration and data-loss risks

| Risk | Mitigation |
| --- | --- |
| Existing users only have in-memory demo edits | First meaningful edit creates a clearly labelled local project record. |
| IndexedDB schema upgrade fails | Use versioned stores and reject the upgrade without deleting old data. |
| Quota or transaction error | Keep the in-memory score, show Save failed, and never claim Saved. |
| Autosave races with rapid edits | Debounce, serialize writes, and increment revisions transactionally. |
| Recovery is older than saved data | Compare revisions/timestamps and never silently replace newer saved data. |
| Delete removes the wrong project | Require ID-specific confirmation; archive is the reversible default. |
| Internal JSON confuses normal users | Hide AST, V1 and learning JSON unless Developer Mode is enabled. |
| PDF feature is overstated | Label the workflow Print / Save as PDF and use clean print CSS. |
| OMR triggers backend unexpectedly | Keep OMR behind its explicit PDF/image picker. |
| Clearing preferences destroys projects | Store preferences separately; never delete IndexedDB from preference reset. |
