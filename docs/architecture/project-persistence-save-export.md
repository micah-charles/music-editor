# Project persistence, Save and Export

## Product model

Save and Export are separate:

- **Save** writes the current editable project to the local IndexedDB library.
- **Export** creates MusicXML, MIDI or a printable/PDF representation for use
  outside FoxChild.
- **Learning Progress** is separate from score projects and transfers through
  `.fcmusic`.
- Internal AST, legacy V1 and learning JSON are visible only in Developer Mode.

There is no visible FoxChild score-package format and no Save As format picker.

## Route map

| Route | Destination |
| --- | --- |
| `/home` | Home Launcher |
| `/projects` | My Projects |
| `/demo/score` | Explicit unsaved demo |
| `/project/:id/score` | Score |
| `/project/:id/tracks` | Track Editor |
| `/project/:id/piano-roll` | Piano Roll |
| `/project/:id/perform` | Perform & Record |
| `/project/:id/omr-review` | OMR Review |
| `/project/:id/print` | Export and Print View |
| `/learn` | Learning Home |
| `/settings` | Settings |

Direct project-route refresh resolves the project ID from IndexedDB. Missing
projects return to My Projects instead of loading the demo as user data.

## IndexedDB schema

Database: `foxchild-music-projects`, version 1.

| Store | Key | Purpose |
| --- | --- | --- |
| `projects` | `id` | Authoritative saved project records and AST |
| `revisions` | `projectId:revision` | Bounded previous checkpoints |
| `recovery` | `projectId` | Newer unsaved snapshot for crash recovery |

Each project stores identity, title/composer/subtitle, timestamps, last project
workspace, AST, source kind, selected part/event, revision, archive and favourite
flags. The last twelve checkpoints per project are retained.

Schema upgrades create missing stores without deleting prior stores. Future
versions must migrate records in a new database upgrade transaction and retain
the old record until the migrated write succeeds.

## Save and recovery lifecycle

1. A meaningful AST edit marks the project `Unsaved changes`.
2. A recovery snapshot is written immediately for an existing project.
3. Autosave runs after 900 ms of inactivity.
4. The project and previous revision are committed atomically.
5. Only after transaction completion does the UI announce `Saved`.
6. The recovery snapshot is cleared after the successful project write.

Cmd/Ctrl+S performs the same internal save immediately. Visibility loss requests
an immediate save where the browser still allows asynchronous IndexedDB work.
Quota, blocked-upgrade and transaction failures preserve the in-memory score and
surface `Save failed`.

On launch, newer recovery records appear on Home with Recover and Discard.
Recovery is refused when the saved project revision is newer than the snapshot.

## Project library

My Projects reads real IndexedDB records and supports Recent, All, Favourites,
Archived, search, four sort orders, rename, duplicate, favourite, archive,
restore, permanent delete confirmation, revision history and opening the last
workspace. The built-in demo is never inserted as a saved project.

Imports create a new saved project instead of silently replacing the current
project. OMR remains backend-optional and starts only after explicit file
selection.

## Export matrix

| Audience | Output | Status |
| --- | --- | --- |
| Music user | MusicXML `.musicxml` | Browser download; full or visible parts |
| Music user | MIDI `.mid` | Browser download; Type 1 multi-track |
| Music user | Print / Save as PDF | Clean notation-only print surface and browser PDF destination |
| Learner | Progress `.fcmusic` | Attempts/progress only; no score AST |
| Developer Mode | AST JSON | Browser download |
| Developer Mode | Legacy V1 JSON | Browser download |
| Developer Mode | Learning JSON | Browser download |
| Developer Mode | Validation report | Text download |

The Export Centre sanitises filenames, exposes scope, validates before export,
blocks structural errors, shows warnings, and never mutates the AST to make an
export pass.

## Navigation and commands

Focused project workspaces use the top project view switcher rather than the old
permanent workspace sidebar. A floating project menu exposes eight primary
actions and moves above the keyboard dock. On mobile it becomes a bottom action
sheet. Cmd/Ctrl+K opens a searchable command palette; Escape closes it.

## Accessibility and responsive verification

- Semantic navigation, dialogs and live save/export status are labelled.
- Project menus expose `aria-expanded`; dialogs use `aria-modal`.
- Home recovery is announced as status.
- All hover previews also update on keyboard focus.
- Destructive deletion uses project-specific confirmation.
- Reduced-motion mode removes menu/dialog transition behavior.
- Desktop uses full project controls; tablet compresses the view switcher;
  mobile uses single-column project/export cards and a bottom action sheet.

## Known limitations

- PDF is produced through the browser's Print / Save as PDF destination; no
  direct binary PDF generator is claimed.
- Compressed MXL, score PNG/SVG and offline audio export are not exposed because
  they are not implemented and verified.
- IndexedDB projects are local to the browser profile. Normal users are not
  offered a proprietary score package under the revised strategy; MusicXML is
  the interoperable score backup.
- Undo/redo stacks are session-local. Bounded saved revisions persist and can be
  restored, but fine-grained undo history is not serialized.
- Recovery depends on the immediate recovery write completing before a hard
  process termination. Browsers cannot guarantee asynchronous work after a
  forced OS-level kill.
- Static production hosting must rewrite the documented client routes to
  `index.html`.
