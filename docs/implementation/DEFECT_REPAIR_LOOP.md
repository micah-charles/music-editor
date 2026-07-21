# Defect Repair Loop

## Default policy

When a reproducible high-priority defect is known, implementation continues through repair and verification unless a real blocker requires user input. A defect report is not the stopping point.

## Loop

1. Reproduce the defect with the smallest failing unit or acceptance test.
2. Trace the authoritative data path and identify the root cause.
3. Implement the smallest architecture-consistent repair.
4. Run the focused failing test until it passes.
5. Run adjacent integration tests and the real-score corpus.
6. Run the full test suite, typecheck, and production build.
7. Run browser interaction checks when the browser policy permits localhost access.
8. If any gate fails, return to step 2 and repeat; do not document a high-priority defect as deferred merely because the first repair attempt failed.
9. Close the defect only after recording regression evidence and remaining fidelity limits.

## Stop conditions

Pause for the user only when the repair requires a destructive migration, dependency or license decision, incompatible public contract, inaccessible external system, or product behavior that cannot be inferred safely. A backward-compatible optional AST field and an internal runtime projection do not require a pause.

## Required evidence

- A regression test that failed before the repair.
- Focused tests for the affected timing or structure.
- Real-score corpus results where the defect concerns notation import, export, playback, or cursor behavior.
- Full tests, typecheck, and production build.
- Browser evidence, or an explicit browser-policy blocker with no inferred visual/audio pass.
