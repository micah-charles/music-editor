# FoxChild Music MCP

This folder documents the future MCP surface for FoxChild Music Score Lab.

The current repository already exposes the core functions that an MCP server needs through `@foxchild/music-core`:

- AST validation
- AST to MusicXML
- AST to MIDI
- MusicXML to AST
- MIDI to AST
- Plain text to AST
- Transpose
- Difficulty analysis
- Learning pack generation

The MCP runtime itself is intentionally deferred until the static Studio MVP is stable.
MIDI and MusicXML must remain import/export formats; MCP tools should accept and return the FoxChild Music AST v2 as the primary structured object.
