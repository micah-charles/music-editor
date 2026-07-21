# MusicXML Defect Register

Date: 2026-07-20

## Fixed In This Sprint

| ID | Severity | Defect | Resolution | Regression evidence |
| --- | --- | --- | --- | --- |
| FXML-001 | High | Multi-staff clefs could reimport incorrectly because staff declarations were incomplete. | Export `<staves>` and one numbered `<clef>` per staff. | Grand-staff semantic round trip. |
| FXML-002 | Medium | The exported base tempo reimported as a redundant tempo-change event. | Filter the first downbeat tempo when it equals the global base tempo. | Melody, ensemble, tuplet, pickup, and large-score round trips. |
| FXML-003 | High | First/second endings were ordered incorrectly, and empty ending arrays could suppress ordinary measures. | Sequence repeat passes while tracking the active ending and treat empty arrays as no ending. | Expected order `[1, 2, 1, 3]`; ordinary repeat tests still pass. |
| FXML-004 | High | Synthetic full-measure rests for an empty lane lacked staff/voice metadata, causing lane growth after round trip. | Assign the lane's staff, voice, and position to generated rests. | Raw OMR lane-preservation test. |
| FXML-005 | Medium | An explicit pickup measure was reported as underfilled. | Validate a non-empty implicit first measure against its actual duration. | Pickup fixture has zero schema and measure warnings. |
| FXML-006 | Medium | Unsupported visual and expressive constructs were discarded silently. | Detect imported constructs, attach precise fidelity warnings, and display them in Studio. | Raw OMR warnings assert slur and beam normalization. |
| FXML-101 | High | Repeat expansion was not applied to engine playback events. | Compile an immutable playback projection containing expanded events, tempo segments, measure passes, duration, and playback-to-source time mapping. | Timeline repeat assertions and playback-session scheduling/cursor test. |
| FXML-102 | High | Piano grand-staff lanes were normalized into separate AST parts. | Add backward-compatible `staffCount` and numbered `clefs` fields; retain staff/voice lanes inside their source part during import and export. | Grand-staff and raw OMR import/export/reimport tests. |

## Open Defects

| ID | Severity | Defect | Impact | Recommended next action |
| --- | --- | --- | --- | --- |
| FXML-103 | Medium | Slurs, beam groups, explicit accidental appearance, articulations, ornaments, and page layout do not round trip. | Re-engraving differs and expression data may be lost. | Preserve raw/normalized extension metadata incrementally; warnings now prevent silent loss. |
| FXML-104 | Medium | Meter and key changes are represented in AST types but are not fully collected/exported by the MusicXML adapter. | Scores with mid-piece meter/key changes can use the wrong validation and display context. | Add dedicated corpus fixtures before implementation. |
| FXML-105 | Medium | Raw OMR semantic accuracy cannot be inferred from structurally valid MusicXML. | Wrong notes, missing tuplets, or misclassified marks can pass schema checks. | Keep OMR as draft, compare against the scan, and require human approval. |
| FXML-106 | Validation blocker | Localhost browser interaction is rejected by browser-control policy. | Visual notation, audio, cursor, auto-scroll, console, and interaction evidence is unavailable. | Run the same matrix in an environment where localhost browser automation is permitted. |

## Raw OMR Findings

The raw helper output contains 28 `<backup>` elements, one `<forward>`, 40 slurs, 216 beam elements, six explicit accidentals, and 345 imported timeline events across 25 measures. Its two source parts remain two AST parts; the piano part retains its staff and voice lanes. It contains no explicit ties, tuplets, grace notes, endings, or repeat marks. Therefore, the importer cannot infer those missing constructs without inventing score data.

The source remains valid MusicXML and imports without schema errors or non-finite timing. Six fidelity warnings now identify unsupported notation and layout instead of silently implying lossless support.
