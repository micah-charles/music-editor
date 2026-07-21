# Local Codex OMR Review

## Purpose

Audiveris remains the recognition engine and MusicXML remains the import boundary. Local Codex adds a second, evidence-based review stage for ambiguous OMR output. It does not silently rewrite recognition results.

## Flow

1. The browser uploads the image or PDF to the local OMR helper.
2. Audiveris produces MusicXML and recognition warnings.
3. When local review is enabled, the helper writes selected MusicXML evidence into the private OMR job directory.
4. The helper invokes the installed `codex exec` command using its existing ChatGPT login.
5. Codex runs ephemerally with a read-only sandbox and a strict correction-proposal JSON schema.
6. The helper returns the original MusicXML plus the proposals. A Codex failure does not discard a successful Audiveris result.
7. The Studio stores proposals under `score.extensions.omrAiCorrection`.
8. The OMR Review workspace requires explicit Apply, Mark reviewed, or Reject actions.

## Trust Boundary

- No OpenAI API key is accepted by the browser or required by the helper.
- The helper removes `OPENAI_API_KEY` from the Codex child process environment.
- The Codex task receives only the source file, selected MusicXML evidence, and Audiveris warnings in its job directory.
- The Codex task is read-only and cannot edit the score or project.
- Only key, tempo, and metadata proposals have deterministic Apply actions.
- Rhythm, tuplets, pitch, and notation uncertainties remain review flags until a user edits the score.
- Every proposal is normalized to `requiresHumanReview: true`.

## Configuration

- `CODEX_BIN`: optional Codex executable override.
- `CODEX_OMR_MODEL`: optional model override; the installed Codex default is used otherwise.
- `CODEX_OMR_TIMEOUT_MS`: bounded child-process timeout, default 180 seconds.
- `OMR_AI_CORRECTION_DISABLED`: disables local Codex review at the helper.

The helper health endpoint reports the provider, executable, configured model, and whether the flow is enabled.
