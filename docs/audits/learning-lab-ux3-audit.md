# Learning Lab UX3 requirement audit

Source prompt:
`/Volumes/ExtremePro/AIWorkspace/docs/FoxChild_LearningLab_UX3_KnowledgeGraph_Codex_Prompt.md`

Reference:
`/Volumes/ExtremePro/AIWorkspace/docs/UIX-music.png`

## Acceptance matrix

| Requirement | Status | Implementation / evidence |
| --- | --- | --- |
| Remove permanent left sidebar | Complete | Learning hides `.workspace-navigation`; computed style is `display: none` at 1280, 768 and 390 px. |
| Use full browser width | Complete | Learning canvas and UX3 shell are width 100%; body scroll width equals viewport width. |
| Floating navigator in every learning sub-module | Complete | `KnowledgeNavigator` wraps Home, overview, quiz and results and remains fixed bottom-right. |
| Navigator expands as contextual flower | Complete | Related/prerequisite petals expand radially; Escape/outside-click close it. |
| Petal selection recentres without Home | Complete | Browser QA changed Chords to Note Reading while the same question remained open. |
| Replace Learning Sets with graph | Complete | Production Home renders no authored library or set grid; 50 authored questions remain an internal pool. |
| Concept data model | Complete | Each node has mastery, prerequisites, relationships, review schedule, curriculum mappings, ABRSM mapping and 1–5 difficulty. |
| Required state colours | Complete | Grey locked, blue learning, green mastered, orange review and red weak are shared by map, navigator and details. |
| Animated mastery rings | Complete | Conic mastery rings animate/recenter; reduced-motion removes nonessential motion. |
| Adaptive recommendations | Complete | Scoring uses weak/due state, mastery gap, mistakes, session minutes and selected curriculum. |
| Never require fixed-set browsing | Complete | Today’s Practice generates an adaptive session from the selected/recommended concept. |
| Lesson top area | Complete | Breadcrumb, progress, concept search and Learn/Practise/Test mode are present. |
| Lesson middle area | Complete | Responsive question, conditional score/audio, live graph and current-skill columns. |
| Lesson bottom area | Complete | Sticky question states plus Previous/Check/Next controls and autosave status. |
| Score Lab integration | Complete | Every concept has deterministic notation; show/play it, generate practice, or open its highlighted example without changing the project. |
| Avoid duplicated stats | Complete | One summary strip and one current-skill mastery display per context. |
| One primary action | Complete | Today’s Practice is the sole primary dashboard action. |
| Continue previous session automatically | Complete | `foxchild-learning-session-v1` restores an unfinished generated session after reload. |
| Prioritise Today’s Practice | Complete | Recommendation card precedes modes, graph and secondary settings. |
| Smooth graph transitions | Complete | Node recenter, link draw, mastery and navigator-petal animations. |
| WCAG AA / keyboard | Complete | Semantic controls, labelled state, focus handling, disabled locks, Escape support and touch targets. |
| Reduced motion | Complete | `prefers-reduced-motion` disables graph and flower motion. |
| Automatic save | Complete | Attempts save immediately; unfinished session saves on every position change. |
| Learning export only `.fcmusic` | Complete | Learning UI exposes `.fcmusic` import/export only. |
| Static-first operation | Complete | Loading, generation, assessment, mastery, review, persistence, notation and playback remain local. |
| Desktop/tablet/mobile | Complete | Live QA at 1280×720, 768×1024 and 390×844; no horizontal overflow. |

## Verification

- `npm test`: 23 files, 146 tests passed.
- `npm run typecheck`: music-core and studio passed.
- `npm run build`: production build passed.
- `git diff --check`: passed.
- Live browser QA covered dashboard, automatic resume, flower recenter,
  conditional notation, answer state, Score Lab preview and responsive layout.
