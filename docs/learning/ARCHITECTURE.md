# FoxChild adaptive music learning architecture

## Static-first boundary

Music Learning runs entirely in the browser. Activities, authored questions,
question-family definitions, generation, assessment, mastery, review scheduling,
attempt history, notation, playback and MIDI input do not require a backend.
Generated music always uses the existing `FoxChildMusicScore` AST; the learning
system does not introduce a second notation model.

## Content contracts

`LearningActivity` 2.0 is the primary adaptive contract:

```text
LearningActivity
├── authoredItems
├── questionFamilies
├── generatorConfiguration
├── curriculumConstraints
├── sessionPolicy
├── masteryPolicy
└── reviewPolicy
```

FCMLIF `QuestionSet` 1.0 remains supported as the authored-item and delivery
contract. `adaptiveSessionAsQuestionSet` converts an adaptive plan into a
standard question set, so the existing renderer, assessment strategies and
attempt persistence are reused without branching the student runner.

## Runtime flow

```text
persisted attempts
  → rebuild concept mastery and review schedule
  → apply curriculum, level and topic constraints
  → allocate 40% review / 30% developing / 20% new / 10% challenge
  → select families while avoiding recent concepts and interaction repetition
  → generate deterministic conceptId / variantId / instanceId questions
  → resolve and validate canonical FoxChildMusicScore AST
  → render existing notation, playback, piano and MIDI components
  → assess through versioned declarative strategies
  → persist the immutable attempt
  → update mastery and next-review evidence
```

The adaptive modules under `packages/music-core/src/learning/` are:

- `adaptiveTypes.ts`: activity, family, identity, policy, mastery and session contracts.
- `questionFamilies.ts`: the twenty family definitions and deterministic family
  engine (fourteen domains, with dedicated accidental and interval-inversion
  families).
- `adaptiveRuntime.ts`: eligibility, adaptive selection, session planning and v1 delivery adapter.
- `mastery.ts`: evidence rebuild, mastery bands, coverage, mistakes and spaced review.
- `knowledgeGraph.ts`: concept prerequisites, relationships, curriculum mappings,
  difficulty, status resolution and recommendation scoring.
- `curriculum.ts`: FoxChild, ABRSM, Trinity and GCSE registries and grade mappings.
- `syllabus.ts`: the ten-area curriculum skill matrix, cross-curriculum target
  levels, generator/assessment links and explicit covered/partial/planned
  coverage reporting. The matrix is the roadmap for expanding beyond the
  current authored bank; it does not claim planned skills are implemented.
- `distractors.ts`: versioned near-neighbour, curriculum-peer and common-confusion strategies.
- `migrationV2.ts`: pure v1 question-set bank to v2 activity migration.
- `validationV2.ts`: v2 structural, reference and policy diagnostics.

The existing v1 modules remain the trusted delivery layer:

- `types.ts`, `validation.ts`, `registries.ts`
- `generators.ts`, `assessment.ts`, `runtime.ts`

## Question families

Each family declares its parameter space, concepts, variants, interactions,
versioned generator, distractor strategy, curriculum objectives and grade
mappings. The registry covers note reading, key signatures, music symbols, note
values, time signatures, intervals, chords, scales, rhythm, tempo, ear training,
sight reading, melody dictation and error detection.

A seed plus family and parameters produces stable content and three traceable IDs:

- `conceptId`: the curriculum skill being measured;
- `variantId`: the pedagogical form of the question;
- `instanceId`: the exact deterministic generated instance.

Generated items also expose `canonicalId`, which combines the versioned family,
concept, pedagogical variant, stable generator-parameter hash and seed hash.
The ID is safe to persist in attempt history and lets coverage tools distinguish
the finite semantic universe from the learner's sampled instances. Syllabus
coverage estimates the finite parameter universe where bounds are declared and
reports `unbounded` when a family has an open numeric parameter.

## Trust boundaries

- Imported JSON must pass diagnostics before use.
- Registry IDs are allow-listed and versioned; content cannot embed executable code.
- Every notation stimulus resolves to and validates as the canonical score AST.
- Adaptive mix values must total one and all configured families must resolve.
- Curriculum constraints must resolve through the curriculum registry.
- Unknown schema or generator versions fail explicitly.

## Persistence and privacy

Attempts remain separate from content under `foxchild-learning-attempts-v1`.
They retain question-set revision, resolved seed, responses, result, skill
evidence and device-independent telemetry. Mastery is rebuilt locally from that
evidence, making the learner model auditable and portable. No normal learning
action contacts a server.

## Knowledge Graph experience

The student-facing Learning Lab does not expose authored question sets as a
catalogue. The ten-set/50-question bank remains an internal source of authored
items for the adaptive activity. The browser builds a 14-concept graph from the
same stable concept IDs used by question families and mastery evidence.

Each graph node stores prerequisites, contextual relationships, curriculum
mappings, ABRSM grade, estimated difficulty and its local review schedule.
`buildKnowledgeGraphState` resolves the visible state:

- grey — locked by unmet prerequisites;
- blue — available or currently learning;
- green — mastered;
- orange — due for review;
- red — weak after repeated mistakes.

The recommendation score combines due/weak priority, mastery gap, mistakes,
available study time and the selected curriculum. A generated adaptive session
is still delivered through `QuestionSet`, preserving the validated renderer.

## Syllabus coverage model

The system measures curriculum coverage by skill rather than by a fixed number
of stored questions. `createDefaultSyllabusMatrix()` defines ten areas spanning
pitch and notation, keys and scales, intervals, rhythm and metre, harmony,
terms and signs, melody and composition, score reading, aural/listening, and
musical analysis/context. Each skill records its target FoxChild levels,
ABRSM/Trinity Grades 1–8, GCSE Foundation/Higher levels, generator families,
and assessment strategies.

`syllabusCoverage()` reports each skill as `covered`, `partial`, or `planned`.
Generated skills can produce many reproducible instances from a seed; planned
skills remain visible as explicit syllabus gaps until their generator or
authored assessment is implemented. This prevents a finite 50- or 1,000-item
bank from being mistaken for complete ABRSM or GCSE coverage.

The expanded graph is the primary Learning Home navigation. During every
lesson, result and overview state, `KnowledgeNavigator` remains available as a
floating contextual flower. Selecting an available petal changes the focused
concept without navigating back to Home.

An unfinished generated session is stored separately under
`foxchild-learning-session-v1` and restored automatically when Learning opens.
It is cleared on completion. Portable learning progress is imported and
exported only as the `FoxChildLearningProgress` `.fcmusic` envelope.
