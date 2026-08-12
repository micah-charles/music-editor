# Home Launcher and flower menu

The Home Launcher is the static-first entry point for FoxChild Music Score Lab.
It provides nine task-oriented cards, a recent-project handoff, and a radial
project workspace menu.

## Navigation model

`home` is a first-class workspace ID. Project workspaces remain synchronized
views of the same in-memory `FoxChildMusicScore`:

- Score
- Piano Roll
- Track Editor
- Performance
- Print
- OMR Review
- Learning Tools
- Project Info

Selecting a flower option changes only the active workspace. It does not clone,
convert, or reload the project.

The Score Assistant card opens local score-editing tools. It deliberately does
not register or contact the disabled AI Analysis feature. OMR remains the only
optional backend workflow and is contacted only after the user explicitly
selects a PDF or image.

## Interaction

The launcher uses ordinary buttons and maintains a visible focus state.
Hovering or focusing a flower option updates the adjacent description card;
activating either the petal or its preview button enters that workspace.

On narrow screens the nine cards become a two-column grid. The radial menu
scales down while the description card moves below it, preserving the same
navigation options without a separate mobile data model.
