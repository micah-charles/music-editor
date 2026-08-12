# Adaptive Music Learning v2 implementation report

## Acceptance matrix

| Capability | Status | Verification |
| --- | --- | --- |
| `LearningActivity` 2.0 contract | Complete | Strict TypeScript model and Draft 2020-12 JSON Schema |
| Fourteen question-family domains / 29 generated families | Complete | Registry coverage test, deterministic generation and `npm run qa:smoke` |
| Parameter spaces and traceable identity | Complete | `conceptId`, `variantId`, `instanceId` assertions |
| Canonical notation model | Complete | Generated notation is inline `FoxChildMusicScore` AST and passes v1 validation |
| Generator registry | Complete | Versioned deterministic generators for all required domains |
| Distractor registry | Complete | Near-neighbour, curriculum-peer and common-confusion strategies |
| Curriculum registry | Complete | FoxChild, ABRSM, Trinity and GCSE mappings |
| Grade-aware generation and authored filtering | Complete | Per-level difficulty profiles plus Grade 1/Grade 8 authored-routing regression |
| Adaptive session policy | Complete | Exact 40/30/20/10 allocation, filtering and recent-content avoidance |
| Mastery engine | Complete | Evidence updates, bands, penalties and expanding intervals |
| Review scheduler | Complete | Due and next-review selection |
| v1 authored content migration | Complete | All 10 sets and 50 questions retained and validated |
| Advanced authored contextual pack | Complete | 14 ABRSM Grade 6–8 / GCSE questions, including linked listening, written, numeric and ordering response |
| Knowledge Graph home | Complete | 14 concepts, prerequisites, relationships, status colours, mastery rings and contextual navigation |
| Today’s Practice | Complete | One adaptive primary action informed by mastery, review, mistakes, study time and curriculum |
| Floating Knowledge Navigator | Complete | Persistent contextual flower on Home, lesson, overview and results |
| Student question runner | Complete | Choice, text/numeric entry, piano/MIDI, compact notation/audio, feedback and navigator |
| Lesson workspace | Complete | Breadcrumb/search, question, live graph, current skill and bottom session dock |
| Score Lab bridge | Complete | Generated notation/audio examples open in Score Lab without modifying the project |
| Automatic resume | Complete | Generated session draft is restored after reload and cleared on completion |
| Responsive and accessible UI | Complete | Desktop/tablet/mobile reflow, keyboard controls, AA palette and reduced motion |
| Static-first operation | Complete | Browser-only generation, assessment and persistence |
| Automated verification | Complete | 154 tests, `npm run qa:smoke`, typecheck and production build |

## Student experience

Learning Home now leads with Today’s Practice and a personalised Knowledge
Graph instead of a fixed set list. Students select concepts by recentering the
graph, while the runtime chooses questions from the authored and generated
content pool. Curriculum, five/ten/fifteen-minute sessions and
Learn/Practise/Test remain available as secondary controls.

Adaptive sessions use the same accessible question runner as authored sets. The
score/player appears only for notation or audio questions, the question
navigator reports current/answered/correct/incorrect state, and MIDI remains an
optional input—not a backend dependency.

## Supported specialised interaction surface

The first production student renderers are multiple choice, written text,
numeric entry, ordering, and single-note piano/MIDI. Audio and notation stimuli
reuse the existing player and score viewer. The domain model and assessment
registry also retain matching, notation-entry, rhythm, recording, sight-reading,
composition and composite response contracts for later specialised renderers.

## External work deliberately not simulated

- microphone feature extraction and performance assessment;
- full notation-entry and semantic score drag/drop interfaces;
- remote content publishing and authority services;
- QTI, Moodle, H5P, xAPI and CSV adapters;
- physical MIDI device-lab coverage.

Unavailable capabilities fail through controlled diagnostics. They do not
introduce a backend requirement into ordinary learning.
