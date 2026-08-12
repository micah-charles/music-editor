# Music learning migration and revision policy

## Version roles

- `schemaVersion` identifies a storage contract.
- `revision` identifies an immutable authored content revision.
- Generator, distractor and assessment IDs contain their behaviour version.
- Attempts retain the source question-set ID and revision for auditability.

## QuestionSet 1.0 to LearningActivity 2.0

`migrateQuestionSetsToActivity(sets)` is a pure migration used by the Learning
workspace and tests. It:

1. creates the default adaptive activity and all fourteen family references;
2. flattens every v1 section into `authoredItems`;
3. assigns collision-safe item, stimulus and response IDs prefixed by set ID;
4. retains the original prompt, answers, assessment, feedback and score content;
5. attaches source set ID/revision and adaptive identity metadata;
6. maps the legacy set domain to a v2 family and concept;
7. retains authors and advances the content revision;
8. validates the result through `validateLearningActivity`.

The distributed ten-set bank migrates to one valid v2 activity containing all
fifty authored items plus fourteen generator-backed families. The original
question-set JSON files remain unchanged and can still run independently.

`migrateLearningContentV2` accepts a single v1 question set, an array of v1 sets,
or an existing v2 activity. Unknown shapes are rejected; there is no best-effort
reinterpretation.

## Compatibility boundary

Adaptive generation produces `GeneratedLearningQuestion` records. Before
delivery, `adaptiveSessionAsQuestionSet` wraps their FCMLIF items in a transient
v1 question set. This preserves the proven v1 resolver, assessment engine,
notation renderer and attempt format while v2 owns selection and learner policy.

## Future migrations

For every later schema version:

1. retain frozen fixtures for the old version;
2. implement a pure one-version migration;
3. preserve stable source and identity metadata;
4. validate structure, references, policies and score ASTs;
5. add golden tests for seeds, IDs, answers and score equivalence;
6. chain migrations one version at a time;
7. retain original documents for audit and rollback.
