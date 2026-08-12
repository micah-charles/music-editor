import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  AdaptiveLearningRuntime,
  LearningRuntime,
  QuestionFamilyEngine,
  ReviewScheduler,
  adaptiveSessionAsQuestionSet,
  allocateMix,
  astToMusicXml,
  buildKnowledgeGraphState,
  calculateSetProgress,
  categoriesForSet,
  commonMistakes,
  coverageMap,
  createBrowserAttemptStore,
  createDefaultQuestionFamilyRegistry,
  createDefaultAssessmentRegistry,
  createDefaultSyllabusMatrix,
  syllabusCoverage,
  createLearnerState,
  deterministicShuffle,
  filterCatalogue,
  formatRelativeAttempt,
  inferDomainFromConcept,
  localisedText,
  migrateQuestionSetsToActivity,
  normaliseQuestionBankSet,
  questionItems,
  startAttempt,
  submitAttempt,
  type AssessmentResult,
  type AdaptiveSessionPreferences,
  type ConceptMastery,
  type CoverageEntry,
  type CurriculumId,
  type FoxChildMusicScore,
  type LearningAttempt,
  type LearningCatalogueEntry,
  type LearningCategory,
  type LearningDomain,
  type LearningMode,
  type KnowledgeConceptState,
  type KnowledgeGraphState,
  type QuestionSet,
  type ResolvedLearningItem,
  type SetProgress,
  type SyllabusCoverageEntry
} from "@foxchild/music-core";
import { LearningPlaybackControls } from "./LearningPlaybackControls";
import { KnowledgeGraph, KnowledgeNavigator } from "./KnowledgeGraph";
import { PianoKeyboard } from "./PianoKeyboard";
import { ScoreViewer } from "./ScoreViewer";

interface LearningPanelProps {
  midiActivePitches?: string[];
  midiStatus?: string;
  onEnableMidi?: () => void;
  onOpenScoreLab?: (score: FoxChildMusicScore, conceptTitle: string) => void;
}

type LearningView = "home" | "overview" | "quiz" | "results";
type CategoryFilter = LearningCategory | "all";
type SessionKind = "start" | "continue" | "review";

interface AdaptivePracticeSettings {
  curriculumId: CurriculumId;
  domain: LearningDomain | "all";
  questionCount: number;
  mode: LearningMode;
}

interface BankManifest {
  sets: Array<{
    id: string;
    title: string;
    file: string;
    questionCount: number;
    domain: string;
  }>;
  adaptivePacks?: Array<{
    id: string;
    title: string;
    file: string;
    questionCount: number;
    domain: string;
  }>;
}

interface LearningSessionDraft {
  format: "FoxChildLearningSession";
  schemaVersion: 1;
  set: QuestionSet;
  mode: LearningMode;
  sessionKind: SessionKind;
  sessionIndices: number[];
  sessionPosition: number;
  focusedConceptId: string;
}

const learningSessionKey = "foxchild-learning-session-v1";
const runtime = new LearningRuntime();
const attemptStore = createBrowserAttemptStore();
const adaptiveFamilies = createDefaultQuestionFamilyRegistry().list();
const adaptiveFamilyRegistry = createDefaultQuestionFamilyRegistry();
const syllabusMatrix = createDefaultSyllabusMatrix();
const syllabusAssessments = createDefaultAssessmentRegistry();
const reviewScheduler = new ReviewScheduler();
const categoryFilters: Array<{ id: CategoryFilter; label: string; icon: string }> = [
  { id: "all", label: "All sets", icon: "✦" },
  { id: "theory", label: "Theory", icon: "♭" },
  { id: "ear-training", label: "Ear training", icon: "♫" },
  { id: "rhythm", label: "Rhythm", icon: "♩" },
  { id: "notation", label: "Notation", icon: "𝄞" },
  { id: "midi", label: "MIDI", icon: "⌨" }
];
const modes: Array<{ id: LearningMode; label: string; description: string }> = [
  { id: "learn", label: "Learn", description: "Hints and explanations as you go" },
  { id: "practise", label: "Practise", description: "Build accuracy with instant feedback" },
  { id: "test", label: "Test", description: "Complete the set without hints" }
];
const setVisuals: Array<{ icon: string; colour: string; tint: string }> = [
  { icon: "𝄞", colour: "#5b5cf0", tint: "#eeedff" },
  { icon: "♯", colour: "#16a66a", tint: "#e5f8ef" },
  { icon: "♫", colour: "#0795b6", tint: "#e3f7fb" },
  { icon: "♩", colour: "#e44d73", tint: "#ffe9ef" },
  { icon: "¾", colour: "#7a5ce5", tint: "#f0ebff" },
  { icon: "↗", colour: "#7655be", tint: "#efe9f8" },
  { icon: "♬", colour: "#c34870", tint: "#fae9ef" },
  { icon: "♙", colour: "#3a9078", tint: "#e4f5f0" },
  { icon: "♭", colour: "#3868d8", tint: "#e6edff" },
  { icon: "♪", colour: "#905acb", tint: "#f2e9fb" }
];

export function LearningPanel({
  midiActivePitches = [],
  midiStatus = "MIDI not connected",
  onEnableMidi,
  onOpenScoreLab
}: LearningPanelProps) {
  const [sets, setSets] = useState<QuestionSet[]>([]);
  const [adaptiveSets, setAdaptiveSets] = useState<QuestionSet[]>([]);
  const [catalogue, setCatalogue] = useState<LearningCatalogueEntry[]>([]);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<LearningView>("home");
  const [selectedSetId, setSelectedSetId] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [mode, setMode] = useState<LearningMode>("practise");
  const [sessionKind, setSessionKind] = useState<SessionKind>("start");
  const [sessionIndices, setSessionIndices] = useState<number[]>([]);
  const [sessionPosition, setSessionPosition] = useState(0);
  const [resolvedItem, setResolvedItem] = useState<ResolvedLearningItem>();
  const [selectedResponse, setSelectedResponse] = useState<unknown>();
  const [result, setResult] = useState<AssessmentResult>();
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [hintVisible, setHintVisible] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [attempts, setAttempts] = useState<LearningAttempt[]>(() => attemptStore.load());
  const [adaptiveSettings, setAdaptiveSettings] = useState<AdaptivePracticeSettings>({
    curriculumId: "foxchild",
    domain: "all",
    questionCount: 10,
    mode: "practise"
  });
  const [focusedConceptId, setFocusedConceptId] = useState(
    () => window.localStorage.getItem("foxchild-learning-focused-concept-v1") ?? ""
  );
  const [conceptSearch, setConceptSearch] = useState("");
  const previousMidiRef = useRef<string[]>([]);
  const submissionLockedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadQuestionBank()
      .then(({ loadedSets, adaptiveSets: loadedAdaptiveSets, entries }) => {
        if (cancelled) return;
        const draft = loadLearningSessionDraft();
        setSets(draft ? [...loadedSets, draft.set] : loadedSets);
        setAdaptiveSets(loadedAdaptiveSets);
        setCatalogue(entries);
        if (draft) {
          setSelectedSetId(draft.set.id);
          setMode(draft.mode);
          setSessionKind(draft.sessionKind);
          setSessionIndices(draft.sessionIndices);
          setSessionPosition(Math.min(draft.sessionPosition, draft.sessionIndices.length - 1));
          setFocusedConceptId(draft.focusedConceptId);
          setView("quiz");
        }
      })
      .catch((error) => {
        if (!cancelled) setLoadError((error as Error).message);
      });
    return () => { cancelled = true; };
  }, []);

  const selectedSet = sets.find((set) => set.id === selectedSetId);
  const allItems = useMemo(() => selectedSet ? questionItems(selectedSet) : [], [selectedSet]);
  const currentItemIndex = sessionIndices[sessionPosition] ?? 0;
  const currentItem = allItems[currentItemIndex];
  const locale = String(selectedSet?.defaults?.locale ?? selectedSet?.metadata.language ?? "en-GB");
  const progressBySet = useMemo(() =>
    new Map(sets.map((set) => [set.id, calculateSetProgress(set, attempts)])),
  [attempts, sets]);
  const selectedProgress = selectedSet ? progressBySet.get(selectedSet.id) : undefined;
  const filteredCatalogue = useMemo(() => filterCatalogue(catalogue, category), [catalogue, category]);
  const adaptiveActivity = useMemo(() => migrateQuestionSetsToActivity(
    [...sets.filter((set) => !set.id.startsWith("session-")), ...adaptiveSets]
  ), [adaptiveSets, sets]);
  const learnerState = useMemo(() => createLearnerState(
    attempts,
    inferDomainFromConcept,
    adaptiveActivity.masteryPolicy,
    adaptiveActivity.reviewPolicy
  ), [adaptiveActivity.masteryPolicy, adaptiveActivity.reviewPolicy, attempts]);
  const adaptiveCoverage = useMemo(() =>
    coverageMap(adaptiveFamilies, learnerState.mastery),
  [learnerState.mastery]);
  const syllabusReport = useMemo(() => syllabusCoverage(
    syllabusMatrix,
    adaptiveFamilyRegistry,
    syllabusAssessments
  ), []);
  const mistakes = useMemo(() => commonMistakes(learnerState.mastery), [learnerState.mastery]);
  const nextReview = useMemo(() => reviewScheduler.next(learnerState.mastery), [learnerState.mastery]);
  const knowledgeGraph = useMemo(() => buildKnowledgeGraphState(learnerState, {
    curriculumId: adaptiveSettings.curriculumId,
    studyMinutes: adaptiveSettings.questionCount
  }), [adaptiveSettings.curriculumId, adaptiveSettings.questionCount, learnerState]);
  const questionConceptId = String(currentItem?.metadata?.conceptId ?? "");
  const activeConceptId = focusedConceptId || questionConceptId || knowledgeGraph.recommendedConceptId;
  const focusedConcept = knowledgeGraph.concepts.find((entry) => entry.concept.id === activeConceptId)
    ?? knowledgeGraph.concepts.find((entry) => entry.concept.id === focusedConceptId)
    ?? knowledgeGraph.concepts.find((entry) => entry.concept.id === knowledgeGraph.recommendedConceptId)
    ?? knowledgeGraph.concepts[0];
  const activeScore = resolvedItem?.resolvedStimuli.find((stimulus) => stimulus.resolvedScore)?.resolvedScore;
  const visibleNotation = resolvedItem?.resolvedStimuli.some((stimulus) => stimulus.kind === "notation" && stimulus.visibility !== "hidden") ?? false;
  const hasAudio = resolvedItem?.resolvedStimuli.some((stimulus) =>
    stimulus.kind === "audio" || (stimulus.kind === "notation" && stimulus.playback?.enabled === true)
  ) ?? false;
  const maxReplays = Number(resolvedItem?.resolvedStimuli.find((stimulus) => stimulus.kind === "audio")?.playback?.maxReplays ?? 4);
  const optionOrder = useMemo(() => {
    const options = currentItem?.interaction.options ?? [];
    return currentItem?.interaction.shuffleOptions
      ? deterministicShuffle(options, String(currentItem.interaction.optionOrderSeed ?? currentItem.id))
      : options;
  }, [currentItem]);
  const orderingOptionIds = useMemo(() => {
    if (currentItem?.interaction.kind !== "ordering") return [];
    const available = optionOrder.map((option) => option.id);
    const selected = Array.isArray(selectedResponse)
      ? selectedResponse.map(String).filter((id) => available.includes(id))
      : [];
    return [...selected, ...available.filter((id) => !selected.includes(id))];
  }, [currentItem, optionOrder, selectedResponse]);

  useEffect(() => {
    if (!focusedConceptId && knowledgeGraph.recommendedConceptId) {
      setFocusedConceptId(knowledgeGraph.recommendedConceptId);
    }
  }, [focusedConceptId, knowledgeGraph.recommendedConceptId]);

  useEffect(() => {
    if (!questionConceptId || view !== "quiz") return;
    setFocusedConceptId(questionConceptId);
  }, [currentItem?.id, questionConceptId, view]);

  useEffect(() => {
    if (!activeConceptId) return;
    setFocusedConceptId(activeConceptId);
    window.localStorage.setItem("foxchild-learning-focused-concept-v1", activeConceptId);
  }, [activeConceptId]);

  useEffect(() => {
    if (view !== "quiz" || !selectedSet?.id.startsWith("session-") || sessionIndices.length === 0) return;
    saveLearningSessionDraft({
      set: selectedSet,
      mode,
      sessionKind,
      sessionIndices,
      sessionPosition,
      focusedConceptId: activeConceptId
    });
  }, [activeConceptId, mode, selectedSet, sessionIndices, sessionKind, sessionPosition, view]);

  useEffect(() => {
    if (view !== "quiz" || !selectedSet || !currentItem) return;
    let cancelled = false;
    setResolvedItem(undefined);
    setResult(undefined);
    setSelectedResponse(undefined);
    submissionLockedRef.current = false;
    setAttemptNumber(1);
    setHintVisible(false);
    setShowExplanation(false);
    void runtime.resolveItem(selectedSet, currentItem, `${selectedSet.id}:${currentItem.id}:${mode}`)
      .then((resolved) => {
        if (!cancelled) setResolvedItem(resolved);
      })
      .catch((error) => {
        if (!cancelled) setLoadError((error as Error).message);
      });
    return () => { cancelled = true; };
  }, [currentItem, mode, selectedSet, view]);

  useEffect(() => {
    const previous = new Set(previousMidiRef.current);
    const pressed = midiActivePitches.find((pitch) => !previous.has(pitch));
    previousMidiRef.current = midiActivePitches;
    if (pressed && resolvedItem?.interaction.kind === "music-keyboard" && !result) {
      submit(pressed, "web-midi");
    }
  }, [midiActivePitches, resolvedItem, result]);

  function selectSet(setId: string) {
    setSelectedSetId(setId);
    setView("overview");
  }

  function launchAdaptiveSession(settings: AdaptivePracticeSettings) {
    const adaptiveRuntime = new AdaptiveLearningRuntime(adaptiveActivity);
    const preferences: AdaptiveSessionPreferences = {
      curriculumId: settings.curriculumId,
      domains: settings.domain === "all" ? undefined : [settings.domain],
      questionCount: settings.questionCount,
      mode: settings.mode
    };
    const plan = adaptiveRuntime.start(
      adaptiveActivity,
      learnerState,
      preferences,
      `${adaptiveActivity.generatorConfiguration.defaultSeed}:${attempts.length}:${settings.curriculumId}:${settings.domain}`
    );
    const adaptiveSet = adaptiveSessionAsQuestionSet(adaptiveActivity, plan);
    setSets((current) => [...current.filter((set) => !set.id.startsWith("session-")), adaptiveSet]);
    setMode(settings.mode);
    setSelectedSetId(adaptiveSet.id);
    setSessionKind("start");
    setSessionIndices(questionItems(adaptiveSet).map((_, index) => index));
    setSessionPosition(0);
    setView("quiz");
  }

  function selectConcept(conceptId: string) {
    const selected = knowledgeGraph.concepts.find((entry) => entry.concept.id === conceptId);
    if (!selected || selected.status === "locked") return;
    setFocusedConceptId(conceptId);
    setAdaptiveSettings((current) => ({ ...current, domain: selected.concept.domain }));
    window.localStorage.setItem("foxchild-learning-focused-concept-v1", conceptId);
  }

  function launchConcept(concept: KnowledgeConceptState, requestedMode = adaptiveSettings.mode) {
    if (concept.status === "locked") return;
    setFocusedConceptId(concept.concept.id);
    const settings = {
      ...adaptiveSettings,
      domain: concept.concept.domain,
      mode: requestedMode
    };
    setAdaptiveSettings(settings);
    launchAdaptiveSession(settings);
  }

  function openConceptInScoreLab(concept: KnowledgeConceptState) {
    if (!onOpenScoreLab) return;
    const score = exampleScoreForConcept(concept);
    if (score) onOpenScoreLab(score, concept.concept.title);
  }

  function launchSession(kind: SessionKind) {
    if (!selectedSet || !selectedProgress) return;
    const all = allItems.map((_, index) => index);
    const indices = kind === "review" ? selectedProgress.mistakeItemIndices : all;
    if (indices.length === 0) return;
    const resumePosition = kind === "continue"
      ? Math.max(0, indices.indexOf(selectedProgress.resumeItemIndex))
      : 0;
    setSessionKind(kind);
    setSessionIndices(indices);
    setSessionPosition(resumePosition);
    setView("quiz");
  }

  function submit(value = selectedResponse, inputSource = "pointer") {
    if (!selectedSet || !resolvedItem || value === undefined || result || submissionLockedRef.current) return;
    submissionLockedRef.current = true;
    try {
      const attempt = startAttempt(selectedSet, resolvedItem);
      const completed = submitAttempt(attempt, resolvedItem, value, runtime, {
        inputSource,
        attemptNumber
      });
      attemptStore.save(completed);
      setAttempts((current) => [...current, completed]);
      setSelectedResponse(value);
      setResult(completed.result);
    } catch (error) {
      submissionLockedRef.current = false;
      throw error;
    }
  }

  function moveOrderingOption(optionId: string, delta: -1 | 1) {
    if (result || !resolvedItem || resolvedItem.interaction.kind !== "ordering") return;
    const current = orderingOptionIds.length ? orderingOptionIds : optionOrder.map((option) => option.id);
    const index = current.indexOf(optionId);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return;
    const next = [...current];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setSelectedResponse(next);
  }

  function retry() {
    setAttemptNumber((current) => current + 1);
    setSelectedResponse(undefined);
    setResult(undefined);
    submissionLockedRef.current = false;
  }

  function moveQuestion(direction: -1 | 1) {
    const next = sessionPosition + direction;
    if (next >= sessionIndices.length) {
      clearLearningSessionDraft();
      setView("results");
      return;
    }
    setSessionPosition(Math.max(0, next));
  }

  function jumpQuestion(position: number) {
    setSessionPosition(position);
  }

  const totals = overallProgress(
    sets.filter((set) => !set.id.startsWith("session-")),
    progressBySet
  );
  const currentVisual = setVisuals[Math.max(0, catalogue.findIndex((entry) => entry.id === selectedSetId)) % setVisuals.length];

  if (loadError) {
    return <div className="learning-hub-state"><strong>Learning needs a quick refresh.</strong><p>Your saved progress is safe on this device.</p><button type="button" onClick={() => window.location.reload()}>Refresh learning</button></div>;
  }
  if (sets.length === 0) {
    return <div className="learning-hub-state"><span className="learning-loader" /><strong>Preparing your learning sets…</strong></div>;
  }
  if (view === "home") {
    return (
      <div className="learning-ux3-shell">
      <KnowledgeLearningHome
        totals={totals}
        graph={knowledgeGraph}
        focusedConceptId={focusedConcept?.concept.id ?? knowledgeGraph.recommendedConceptId}
        search={conceptSearch}
        onSearch={setConceptSearch}
        mistakes={mistakes}
        nextReview={nextReview}
        attempts={attempts}
        onImportProgress={(importedAttempts) => {
          window.localStorage.setItem("foxchild-learning-attempts-v1", JSON.stringify(importedAttempts));
          setAttempts(importedAttempts);
        }}
        adaptiveSettings={adaptiveSettings}
        onAdaptiveSettings={setAdaptiveSettings}
        onStartAdaptive={() => {
          const concept = focusedConcept
            ?? knowledgeGraph.concepts.find((entry) => entry.concept.id === knowledgeGraph.recommendedConceptId);
          if (concept) launchConcept(concept);
        }}
        onSelectConcept={selectConcept}
        onOpenScoreLab={openConceptInScoreLab}
        onMode={setMode}
        syllabusReport={syllabusReport}
      />
      <KnowledgeNavigator graph={knowledgeGraph} focusedConceptId={focusedConcept?.concept.id ?? knowledgeGraph.recommendedConceptId} onSelect={selectConcept} />
      </div>
    );
  }
  if (!selectedSet || !selectedProgress) return null;
  if (view === "overview") {
    return (
      <div className="learning-ux3-shell">
      <SetOverview
        set={selectedSet}
        progress={selectedProgress}
        mode={mode}
        visual={currentVisual}
        onBack={() => setView("home")}
        onMode={setMode}
        onLaunch={launchSession}
      />
      <KnowledgeNavigator graph={knowledgeGraph} focusedConceptId={focusedConcept?.concept.id ?? knowledgeGraph.recommendedConceptId} onSelect={(id) => { selectConcept(id); setView("home"); }} />
      </div>
    );
  }
  if (view === "results") {
    const refreshed = calculateSetProgress(selectedSet, attempts);
    return (
      <div className="learning-ux3-shell">
      <SetResults
        set={selectedSet}
        progress={refreshed}
        mode={mode}
        visual={currentVisual}
        onHome={() => setView("home")}
        onOverview={() => setView(selectedSet.id.startsWith("session-") ? "home" : "overview")}
        onReview={() => {
          const indices = refreshed.mistakeItemIndices;
          if (indices.length === 0) return;
          setSessionKind("review");
          setSessionIndices(indices);
          setSessionPosition(0);
          setView("quiz");
        }}
      />
      <KnowledgeNavigator graph={knowledgeGraph} focusedConceptId={focusedConcept?.concept.id ?? knowledgeGraph.recommendedConceptId} onSelect={(id) => { selectConcept(id); setView("home"); }} />
      </div>
    );
  }

  const maximumAttempts = resolvedItem?.assessment.attemptPolicy?.maximumAttempts ?? 1;
  const canRetry = Boolean(result && !result.passed && attemptNumber < maximumAttempts);
  const feedback = result?.passed ? resolvedItem?.feedback?.correct : resolvedItem?.feedback?.incorrect;
  const feedbackMessage = isRecord(feedback) ? localisedText(feedback.message, locale) : "";
  const currentAttemptState = itemAttemptState(selectedSet.id, currentItem.id, attempts);
  const isAdaptiveSession = selectedSet.id.startsWith("session-");
  const linkedGroupId = String(currentItem.metadata?.linkedGroupId ?? "");
  const linkedItems = linkedGroupId
    ? allItems.filter((item) => item.metadata?.linkedGroupId === linkedGroupId)
    : [];
  const linkedPosition = linkedItems.findIndex((item) => item.id === currentItem.id);

  return (
    <div className="learning-ux3-shell">
    <div className="learning-quiz">
      <header className="learning-quiz-header">
        <nav aria-label="Lesson breadcrumb">
          <button type="button" className="learning-back-link" onClick={() => setView(isAdaptiveSession ? "home" : "overview")}>Learning</button>
          <span>›</span><span>{focusedConcept ? domainLabel(focusedConcept.concept.domain) : "Practice"}</span>
          <span>›</span><strong>{focusedConcept?.concept.title ?? "Adaptive lesson"}</strong>
        </nav>
        <label className="lesson-concept-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            list="lesson-concept-options"
            value={conceptSearch}
            placeholder="Find a concept"
            aria-label="Find a concept"
            onChange={(event) => {
              const value = event.target.value;
              setConceptSearch(value);
              const match = knowledgeGraph.concepts.find((entry) =>
                entry.concept.title.toLocaleLowerCase() === value.toLocaleLowerCase()
              );
              if (match && match.status !== "locked") selectConcept(match.concept.id);
            }}
          />
          <datalist id="lesson-concept-options">
            {knowledgeGraph.concepts.filter((entry) => entry.status !== "locked").map((entry) =>
              <option key={entry.concept.id} value={entry.concept.title} />
            )}
          </datalist>
        </label>
        <span className={`learning-mode-pill ${mode}`}>{modeLabel(mode)}</span>
      </header>

      <div className="learning-quiz-progress">
        <div>
          <span>Question {sessionPosition + 1} of {sessionIndices.length}</span>
          <span>{sessionKind === "review" ? "Reviewing mistakes" : `${Math.round((sessionPosition + 1) / sessionIndices.length * 100)}% complete`}</span>
        </div>
        <span><i style={{ width: `${(sessionPosition + 1) / sessionIndices.length * 100}%` }} /></span>
      </div>

      <div className="learning-quiz-layout">
        <main className="learning-question-card">
          <div className="learning-question-title">
            <span>Question {currentItemIndex + 1}</span>
            {linkedItems.length > 1 ? <small className="learning-linked-question">Linked listening · Part {linkedPosition + 1} of {linkedItems.length}</small> : null}
            <h2>{localisedText(currentItem.prompt.content, locale)}</h2>
          </div>

          {resolvedItem ? renderSimpleStimulus(resolvedItem, locale) : null}

          {activeScore && (visibleNotation || hasAudio) ? (
            <section className={`learning-media-card ${visibleNotation ? "" : "audio-only"}`}>
              {visibleNotation ? (
                <div className="learning-compact-score" aria-label={notationDescription(resolvedItem, locale)}>
                  <ScoreViewer
                    score={activeScore}
                    musicXml={astToMusicXml(activeScore, {
                      showTitle: false,
                      showTimeSignature: notationWantsTimeSignature(resolvedItem),
                      showTempo: false
                    })}
                    measureIssues={[]}
                    canRevert={false}
                    compact
                    onAddMissingRest={() => undefined}
                    onStretchLastNote={() => undefined}
                    onRevertChange={() => undefined}
                  />
                </div>
              ) : null}
              {hasAudio ? <LearningPlaybackControls score={activeScore} maxReplays={maxReplays} /> : null}
            </section>
          ) : null}

          {resolvedItem?.interaction.kind === "choice" ? (
            <div className="learning-answer-grid" role="group" aria-label="Answer choices">
              {optionOrder.map((option, index) => {
                const selected = selectedResponse === option.id;
                const correct = result && option.id === resolvedItem.response.correct?.value;
                const incorrect = result && selected && !result.passed;
                return (
                  <button
                    type="button"
                    key={option.id}
                    className={[selected ? "selected" : "", mode !== "test" && correct ? "correct" : "", mode !== "test" && incorrect ? "incorrect" : ""].filter(Boolean).join(" ")}
                    aria-pressed={selected}
                    disabled={Boolean(result)}
                    onClick={() => submit(option.id)}
                  >
                    <span>{String.fromCharCode(65 + index)}</span>
                    {localisedText(option.content, locale)}
                  </button>
                );
              })}
            </div>
          ) : null}

          {resolvedItem?.interaction.kind === "music-keyboard" ? (
            <div className="learning-keyboard-card">
              <div className="learning-midi-row">
                <div><span className={midiActivePitches.length ? "connected" : ""} />{midiStatus}</div>
                {onEnableMidi ? <button type="button" onClick={onEnableMidi}>Connect MIDI</button> : null}
              </div>
              <PianoKeyboard
                range={keyboardRange(resolvedItem)}
                activePitches={midiActivePitches}
                keyboardNavigable
                selectedPitches={typeof selectedResponse === "string" ? [selectedResponse] : []}
                invalidPitches={result && !result.passed && typeof selectedResponse === "string" ? [selectedResponse] : []}
                onKeyPress={(pitch) => submit(pitch, "onscreen-piano")}
              />
              <p>Play the note on screen or use your MIDI keyboard.</p>
            </div>
          ) : null}

          {resolvedItem?.interaction.kind === "text-entry" || resolvedItem?.interaction.kind === "numeric-entry" ? (
            <form className="learning-text-entry" onSubmit={(event) => { event.preventDefault(); if (!result && String(selectedResponse ?? "").trim()) submit(selectedResponse, resolvedItem.interaction.kind); }}>
              <label htmlFor="learning-written-answer">{resolvedItem.interaction.kind === "numeric-entry" ? "Numeric answer" : "Written answer"}</label>
              <div>
                <input
                  id="learning-written-answer"
                  type={resolvedItem.interaction.kind === "numeric-entry" ? "number" : "text"}
                  value={selectedResponse === undefined ? "" : String(selectedResponse)}
                  disabled={Boolean(result)}
                  autoComplete="off"
                  onChange={(event) => setSelectedResponse(resolvedItem.interaction.kind === "numeric-entry" && event.target.value !== "" ? Number(event.target.value) : event.target.value)}
                  placeholder={resolvedItem.interaction.kind === "numeric-entry" ? "Enter a number" : "Type your answer"}
                />
                <button type="submit" className="primary" disabled={Boolean(result) || !String(selectedResponse ?? "").trim()}>{resolvedItem.interaction.kind === "numeric-entry" ? "Submit number" : "Submit written response"}</button>
              </div>
            </form>
          ) : null}

          {resolvedItem?.interaction.kind === "ordering" ? (
            <section className="learning-ordering" aria-label="Order the options">
              <p className="learning-ordering-instruction">Arrange the items from first to last.</p>
              <ol>
                {orderingOptionIds.map((optionId, index) => {
                  const option = optionOrder.find((entry) => entry.id === optionId);
                  if (!option) return null;
                  return (
                    <li key={option.id}>
                      <span className="learning-ordering-index">{index + 1}</span>
                      <span className="learning-ordering-label">{localisedText(option.content, locale)}</span>
                      <button type="button" aria-label={`Move ${localisedText(option.content, locale)} up`} disabled={Boolean(result) || index === 0} onClick={() => moveOrderingOption(option.id, -1)}>↑</button>
                      <button type="button" aria-label={`Move ${localisedText(option.content, locale)} down`} disabled={Boolean(result) || index === orderingOptionIds.length - 1} onClick={() => moveOrderingOption(option.id, 1)}>↓</button>
                    </li>
                  );
                })}
              </ol>
              <button type="button" className="primary" disabled={Boolean(result)} onClick={() => submit(orderingOptionIds, "ordering")}>Submit order</button>
            </section>
          ) : null}

          {result ? (
            <div className={`learning-result-callout ${result.passed ? "correct" : "incorrect"} ${mode === "test" ? "test" : ""}`} role="status">
              <div className="learning-result-icon">{mode === "test" ? "✓" : result.passed ? "✓" : "↻"}</div>
              <div>
                <strong>{mode === "test" ? "Answer saved" : result.passed ? "Correct!" : "Not quite yet"}</strong>
                <p>{mode === "test" ? "Your result will be included in the set summary." : feedbackMessage}</p>
              </div>
              {canRetry && mode !== "test" ? <button type="button" onClick={retry}>Try again</button> : null}
            </div>
          ) : null}

          {mode !== "test" && resolvedItem?.hints?.length ? (
            <div className="learning-help-row">
              <button type="button" onClick={() => setHintVisible((current) => !current)}>
                {hintVisible ? "Hide hint" : "Need a hint?"}
              </button>
              {result ? <button type="button" onClick={() => setShowExplanation((current) => !current)}>Why this answer?</button> : null}
            </div>
          ) : null}
          {hintVisible ? <div className="learning-hint-panel"><strong>Hint</strong><p>{localisedText(resolvedItem?.hints?.[0]?.content, locale)}</p></div> : null}
          {showExplanation ? <div className="learning-hint-panel explanation"><strong>Explanation</strong><p>{localisedText(resolvedItem?.explanation?.content, locale)}</p></div> : null}

        </main>

        <section className="lesson-knowledge-map">
          <div className="learning-sidebar-heading"><strong>Knowledge map</strong><span>Live mastery</span></div>
          <KnowledgeGraph graph={knowledgeGraph} focusedConceptId={focusedConcept?.concept.id ?? activeConceptId} compact onSelect={selectConcept} />
        </section>

        <aside className="lesson-skill-panel">
          <section className={focusedConcept?.status}>
            <div className="lesson-skill-title">
              <span>{focusedConcept?.concept.icon ?? "♪"}</span>
              <div><small>Current skill</small><strong>{focusedConcept?.concept.title ?? "Music skill"}</strong></div>
            </div>
            <div className="lesson-mastery-ring" style={{ "--progress": `${(focusedConcept?.mastery ?? 0) * 360}deg` } as CSSProperties}>
              <strong>{Math.round((focusedConcept?.mastery ?? 0) * 100)}%</strong><small>mastery</small>
            </div>
            <p>{focusedConcept?.concept.description}</p>
            <dl>
              <div><dt>Difficulty</dt><dd>{focusedConcept ? `${focusedConcept.concept.estimatedDifficulty} / 5` : "—"}</dd></div>
              <div><dt>Curriculum</dt><dd>{adaptiveSettings.curriculumId.toUpperCase()}</dd></div>
            </dl>
            {focusedConcept && onOpenScoreLab && activeScore ? (
              <button type="button" onClick={() => onOpenScoreLab(activeScore, focusedConcept.concept.title)}>Open example in Score Lab</button>
            ) : null}
          </section>
          {mistakes.length ? <section className="lesson-weak-area"><span>Weak area</span><strong>{conceptLabel(mistakes[0].conceptId)}</strong><small>{mistakes[0].incorrectCount} mistakes to revisit</small></section> : null}
        </aside>
      </div>

      <footer className="learning-session-dock">
        <div>
          <strong>Questions</strong>
          <div className="learning-question-navigator">
            {sessionIndices.map((itemIndex, position) => {
              const item = allItems[itemIndex];
              const state = itemAttemptState(selectedSet.id, item.id, attempts);
              return (
                <button
                  type="button"
                  key={item.id}
                  className={`${position === sessionPosition ? "current" : ""} ${mode === "test" && state !== "unanswered" ? "answered" : state}`}
                  aria-label={`Question ${itemIndex + 1}: ${state}${position === sessionPosition ? ", current" : ""}`}
                  onClick={() => jumpQuestion(position)}
                >{itemIndex + 1}</button>
              );
            })}
          </div>
        </div>
        <div className="learning-navigator-legend">
          <span><i className="answered" />Answered</span>
          <span><i className="correct" />Correct</span>
          <span><i className="incorrect" />Incorrect</span>
          <span><i className="current" />Current</span>
        </div>
        <div className="learning-dock-controls">
          <button type="button" disabled={sessionPosition === 0} onClick={() => moveQuestion(-1)}>← Previous</button>
          {!result ? (
            <span className="learning-choice-guidance">
              {resolvedItem?.interaction.kind === "choice" ? "Choose an answer above" : resolvedItem?.interaction.kind === "text-entry" ? "Write an answer above" : resolvedItem?.interaction.kind === "numeric-entry" ? "Enter a number above" : resolvedItem?.interaction.kind === "ordering" ? "Arrange the items above" : "Complete the question above"}
            </span>
          ) : (
            <button type="button" className="primary" disabled={!result && currentAttemptState === "unanswered"} onClick={() => moveQuestion(1)}>
              {sessionPosition === sessionIndices.length - 1 ? "Finish" : "Next"} →
            </button>
          )}
        </div>
        <span className="learning-autosave-state">✓ Progress saved automatically</span>
      </footer>
    </div>
    <KnowledgeNavigator graph={knowledgeGraph} focusedConceptId={focusedConcept?.concept.id ?? knowledgeGraph.recommendedConceptId} onSelect={selectConcept} />
    </div>
  );
}

function KnowledgeLearningHome({
  totals,
  graph,
  focusedConceptId,
  search,
  onSearch,
  mistakes,
  nextReview,
  attempts,
  onImportProgress,
  adaptiveSettings,
  onAdaptiveSettings,
  onStartAdaptive,
  onSelectConcept,
  onOpenScoreLab,
  onMode,
  syllabusReport
}: {
  totals: ReturnType<typeof overallProgress>;
  graph: KnowledgeGraphState;
  focusedConceptId: string;
  search: string;
  onSearch: (value: string) => void;
  mistakes: ConceptMastery[];
  nextReview?: ConceptMastery;
  attempts: LearningAttempt[];
  onImportProgress: (attempts: LearningAttempt[]) => void;
  adaptiveSettings: AdaptivePracticeSettings;
  onAdaptiveSettings: (settings: AdaptivePracticeSettings) => void;
  onStartAdaptive: () => void;
  onSelectConcept: (conceptId: string) => void;
  onOpenScoreLab: (concept: KnowledgeConceptState) => void;
  onMode: (mode: LearningMode) => void;
  syllabusReport: SyllabusCoverageEntry[];
}) {
  const [exampleVisible, setExampleVisible] = useState(false);
  const focused = graph.concepts.find((entry) => entry.concept.id === focusedConceptId)
    ?? graph.concepts.find((entry) => entry.concept.id === graph.recommendedConceptId)
    ?? graph.concepts[0];
  const exampleScore = focused ? exampleScoreForConcept(focused) : undefined;
  const query = search.trim().toLocaleLowerCase();
  const searchResults = query
    ? graph.concepts.filter((entry) =>
      `${entry.concept.title} ${entry.concept.description} ${domainLabel(entry.concept.domain)}`
        .toLocaleLowerCase().includes(query)
    ).slice(0, 7)
    : [];
  const masteredCount = graph.concepts.filter((entry) => entry.status === "mastered").length;
  const reviewCount = graph.concepts.filter((entry) => entry.status === "review" || entry.status === "weak").length;
  const exploredCount = graph.concepts.filter((entry) => entry.evidenceCount > 0).length;
  const recentAttempts = [...attempts]
    .filter((attempt) => attempt.submittedAt)
    .sort((left, right) => String(right.submittedAt).localeCompare(String(left.submittedAt)))
    .slice(0, 4);

  if (!focused) return null;
  return (
    <div className="learning-home knowledge-learning-home">
      <header className="knowledge-home-header">
        <div>
          <span className="learning-kicker">Music Learning Lab</span>
          <h1>Good to see you, musician <span aria-hidden="true">♪</span></h1>
          <p>Your next lesson is chosen from what you know, what needs review, and what you are ready to unlock.</p>
        </div>
        <label className="knowledge-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search concepts"
            aria-label="Search music concepts"
          />
          {searchResults.length ? (
            <div className="knowledge-search-results">
              {searchResults.map((entry) => (
                <button
                  type="button"
                  key={entry.concept.id}
                  disabled={entry.status === "locked"}
                  onClick={() => {
                    onSelectConcept(entry.concept.id);
                    onSearch("");
                  }}
                >
                  <span>{entry.status === "locked" ? "⌁" : entry.concept.icon}</span>
                  <strong>{entry.concept.title}</strong>
                  <small>{knowledgeConceptStatusCopy(entry)}</small>
                </button>
              ))}
            </div>
          ) : null}
        </label>
        <div className="knowledge-home-achievements">
          <span><b>◆</b><strong>{totals.streak}</strong><small>day streak</small></span>
          <span><b>✦</b><strong>{totals.correct * 10}</strong><small>points</small></span>
          <span><b>♫</b><strong>{masteredCount + 1}</strong><small>level</small></span>
        </div>
      </header>

      <section className="knowledge-summary-strip" aria-label="Learning progress summary">
        <div><span>Today’s goal</span><strong>{Math.min(totals.completed, 8)} / 8</strong><i><b style={{ width: `${Math.min(100, totals.completed / 8 * 100)}%` }} /></i></div>
        <div><span>Overall mastery</span><strong>{Math.round(totals.mastery)}%</strong></div>
        <div><span>Concepts explored</span><strong>{exploredCount} / {graph.concepts.length}</strong></div>
        <div><span>Correct answers</span><strong>{totals.correct}</strong></div>
        <div className={reviewCount ? "needs-attention" : ""}><span>Ready to review</span><strong>{reviewCount}</strong></div>
      </section>

      <section className="syllabus-coverage-card" aria-labelledby="syllabus-coverage-title">
        <div className="learning-section-heading">
          <div><h2 id="syllabus-coverage-title">Syllabus coverage</h2><p>Generated skills are measured separately from planned syllabus work.</p></div>
          <span>{syllabusReport.filter((entry) => entry.status === "covered").length} covered · {syllabusReport.filter((entry) => entry.status === "planned").length} planned</span>
        </div>
        <div className="syllabus-coverage-summary">
          {syllabusReport.slice(0, 10).map((entry) => (
            <div key={entry.skillId} className={`syllabus-status-${entry.status}`}>
              <span>{entry.status === "covered" ? "✓" : entry.status === "partial" ? "◐" : "·"}</span>
              <strong>{entry.skillId.replaceAll(".", " · ")}</strong>
              <small>{entry.estimatedGeneratedInstances === "unbounded" ? "open generator" : `${entry.estimatedGeneratedInstances} generated combinations`}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="today-practice-card" aria-labelledby="today-practice-title">
        <div className="today-practice-icon">{focused.concept.icon}</div>
        <div>
          <span className="learning-kicker">Today’s practice</span>
          <h2 id="today-practice-title">{focused.concept.title}</h2>
          <p>{todayPracticeReason(focused, nextReview)} · about {Math.max(4, adaptiveSettings.questionCount)} minutes</p>
        </div>
        <div className="today-practice-mix" aria-label="Adaptive session composition">
          <span>Review</span><b>{allocateMix(adaptiveSettings.questionCount).review}</b>
          <span>Build</span><b>{allocateMix(adaptiveSettings.questionCount).developing}</b>
          <span>New</span><b>{allocateMix(adaptiveSettings.questionCount).new}</b>
        </div>
        <button type="button" className="primary today-practice-action" data-testid="start-recommended-session" onClick={onStartAdaptive}>
          {loadLearningSessionDraft() ? "Continue today’s practice" : "Start today’s practice"} <span>→</span>
        </button>
      </section>

      <nav className="knowledge-mode-switcher" aria-label="Learning approach">
        {modes.map((item) => (
          <button
            type="button"
            key={item.id}
            className={adaptiveSettings.mode === item.id ? "active" : ""}
            aria-current={adaptiveSettings.mode === item.id ? "page" : undefined}
            onClick={() => {
              onAdaptiveSettings({ ...adaptiveSettings, mode: item.id });
              onMode(item.id);
            }}
          >
            <span>{item.id === "learn" ? "◉" : item.id === "practise" ? "↗" : "✓"}</span>
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </button>
        ))}
      </nav>

      <div className="knowledge-dashboard-grid">
        <section className="knowledge-map-card">
          <div className="learning-section-heading">
            <div><h2>Your knowledge map</h2><p>Select an available concept to recenter your learning path.</p></div>
            <span>{masteredCount} mastered</span>
          </div>
          <KnowledgeGraph graph={graph} focusedConceptId={focused.concept.id} onSelect={onSelectConcept} />
        </section>

        <aside className="knowledge-insight-column">
          <section className={`current-concept-card ${focused.status}`}>
            <div className="current-concept-heading">
              <span>{focused.concept.icon}</span>
              <div><small>Current skill</small><h2>{focused.concept.title}</h2></div>
              <strong>{Math.round(focused.mastery * 100)}%</strong>
            </div>
            <p>{focused.concept.description}</p>
            <dl>
              <div><dt>Status</dt><dd>{knowledgeConceptStatusCopy(focused)}</dd></div>
              <div><dt>Difficulty</dt><dd>{"●".repeat(focused.concept.estimatedDifficulty)}{"○".repeat(5 - focused.concept.estimatedDifficulty)}</dd></div>
              <div><dt>ABRSM</dt><dd>{focused.concept.abrsmGrades.join(", ")}</dd></div>
              <div><dt>Next review</dt><dd>{focused.nextReviewAt ? formatReviewTime(focused.nextReviewAt) : "After your first lesson"}</dd></div>
            </dl>
            <div className="current-concept-actions">
              <button type="button" onClick={() => setExampleVisible((value) => !value)}>{exampleVisible ? "Hide example" : "Show example"}</button>
              <button type="button" onClick={() => onOpenScoreLab(focused)}>Open in Score Lab</button>
            </div>
            {exampleVisible && exampleScore ? (
              <div className="concept-example-player">
                <ScoreViewer
                  score={exampleScore}
                  musicXml={astToMusicXml(exampleScore, { showTitle: false, showTempo: false })}
                  measureIssues={[]}
                  canRevert={false}
                  compact
                  onAddMissingRest={() => undefined}
                  onStretchLastNote={() => undefined}
                  onRevertChange={() => undefined}
                />
                <LearningPlaybackControls score={exampleScore} maxReplays={4} />
              </div>
            ) : null}
          </section>

          <details className="practice-settings-card">
            <summary>Adjust today’s practice</summary>
            <label><span>Curriculum</span><select value={adaptiveSettings.curriculumId} onChange={(event) => onAdaptiveSettings({ ...adaptiveSettings, curriculumId: event.target.value as CurriculumId })}>
              <option value="foxchild">FoxChild pathway</option><option value="abrsm">ABRSM</option><option value="trinity">Trinity</option><option value="gcse">GCSE</option>
            </select></label>
            <label><span>Session length</span><select value={adaptiveSettings.questionCount} onChange={(event) => onAdaptiveSettings({ ...adaptiveSettings, questionCount: Number(event.target.value) })}>
              <option value={5}>5 minutes</option><option value={10}>10 minutes</option><option value={15}>15 minutes</option>
            </select></label>
          </details>

          <section className="knowledge-review-card">
            <div><span>Needs attention</span><strong>{reviewCount}</strong></div>
            {mistakes.length ? mistakes.slice(0, 3).map((entry) => (
              <button type="button" key={entry.conceptId} onClick={() => onSelectConcept(entry.conceptId)}>
                <span>!</span><div><strong>{conceptLabel(entry.conceptId)}</strong><small>{entry.incorrectCount} recent mistakes</small></div>
              </button>
            )) : <p>No weak areas yet. Your graph will adapt as you answer.</p>}
          </section>
        </aside>
      </div>

      <section className="knowledge-recent-row">
        <div className="learning-section-heading"><div><h2>Recent learning</h2><p>Answers save automatically on this device.</p></div></div>
        <div>
          {recentAttempts.length ? recentAttempts.map((attempt) => (
            <article key={attempt.attemptId}>
              <span className={attempt.result?.passed ? "correct" : "incorrect"}>{attempt.result?.passed ? "✓" : "↻"}</span>
              <div><strong>{conceptLabel(attempt.result?.masteryEvidence[0]?.skillId ?? attempt.itemId)}</strong><small>{formatRelativeAttempt(attempt.submittedAt)}</small></div>
              <b>{Math.round(attempt.result?.percentage ?? 0)}%</b>
            </article>
          )) : <p>Complete your first question to begin your learning history.</p>}
        </div>
        <div className="learning-transfer-actions">
          <button type="button" onClick={() => exportLearningProgress(attempts)}>Export .fcmusic</button>
          <label><span>Import .fcmusic</span><input type="file" accept=".fcmusic" onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void importLearningProgress(file).then(onImportProgress).catch((error) => window.alert(errorMessage(error)));
          }} /></label>
        </div>
      </section>
    </div>
  );
}

function LearningHome({
  catalogue,
  category,
  mode,
  progressBySet,
  totals,
  coverage,
  mastery,
  mistakes,
  nextReview,
  attempts,
  onImportProgress,
  adaptiveSettings,
  onAdaptiveSettings,
  onStartAdaptive,
  onCategory,
  onMode,
  onSelectSet,
  onLaunch
}: {
  catalogue: LearningCatalogueEntry[];
  category: CategoryFilter;
  mode: LearningMode;
  progressBySet: Map<string, SetProgress>;
  totals: ReturnType<typeof overallProgress>;
  coverage: CoverageEntry[];
  mastery: ConceptMastery[];
  mistakes: ConceptMastery[];
  nextReview?: ConceptMastery;
  attempts: LearningAttempt[];
  onImportProgress: (attempts: LearningAttempt[]) => void;
  adaptiveSettings: AdaptivePracticeSettings;
  onAdaptiveSettings: (settings: AdaptivePracticeSettings) => void;
  onStartAdaptive: (settings: AdaptivePracticeSettings) => void;
  onCategory: (value: CategoryFilter) => void;
  onMode: (value: LearningMode) => void;
  onSelectSet: (id: string) => void;
  onLaunch: (id: string, kind: SessionKind) => void;
}) {
  const mix = allocateMix(adaptiveSettings.questionCount);
  const masteryBands = {
    mastered: mastery.filter((entry) => entry.band === "mastered").length,
    secure: mastery.filter((entry) => entry.band === "secure").length,
    developing: mastery.filter((entry) => entry.band === "developing").length,
    new: coverage.reduce((sum, entry) => sum + entry.conceptCount - entry.coveredConcepts, 0)
  };
  const recentAttempts = [...attempts]
    .filter((attempt) => attempt.submittedAt)
    .sort((left, right) => String(right.submittedAt).localeCompare(String(left.submittedAt)))
    .slice(0, 5);

  return (
    <div className="learning-home">
      <header className="learning-welcome">
        <div>
          <span className="learning-kicker">Music Learning Lab</span>
          <h1>Welcome back, musician <span aria-hidden="true">♪</span></h1>
          <p>Build skills with a recommended session or choose exactly what to practise.</p>
        </div>
        <div className="learning-progress-actions">
          <div className="learning-streak"><span>◆</span><strong>{totals.streak} day streak</strong><small>Keep it up!</small></div>
          <button type="button" onClick={() => exportLearningProgress(attempts)}>Export Progress</button>
          <label><span>Import Progress</span><input type="file" accept=".fcmusic,application/json" onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void importLearningProgress(file).then(onImportProgress).catch((error) => window.alert(errorMessage(error)));
          }} /></label>
        </div>
      </header>

      <section className="learning-overall-progress">
        <div className="learning-progress-copy">
          <span>Your progress</span>
          <strong>{totals.completed} of {totals.total} questions complete</strong>
          <div><span style={{ width: `${totals.percentage}%` }} /></div>
        </div>
        <div><strong>{totals.started}</strong><span>Sets started</span></div>
        <div><strong>{Math.round(totals.mastery)}%</strong><span>Mastery</span></div>
        <div><strong>{totals.correct}</strong><span>Correct answers</span></div>
        <div className="learning-progress-ring" style={{ "--progress": `${totals.percentage * 3.6}deg` } as CSSProperties}>
          <span>{Math.round(totals.percentage)}%</span>
        </div>
      </section>

      <section className="adaptive-recommendation" aria-labelledby="recommended-session-title">
        <div className="adaptive-recommendation-copy">
          <span className="learning-kicker">Recommended for you</span>
          <h2 id="recommended-session-title">A balanced {adaptiveSettings.questionCount}-question session</h2>
          <p>FoxChild blends review, developing skills, new ideas and a small challenge—then adjusts after every answer.</p>
          <div className="adaptive-mix" aria-label="Recommended question mix">
            <span className="review"><strong>{mix.review}</strong> Review</span>
            <span className="developing"><strong>{mix.developing}</strong> Developing</span>
            <span className="new"><strong>{mix.new}</strong> New</span>
            <span className="challenge"><strong>{mix.challenge}</strong> Challenge</span>
          </div>
        </div>
        <button
          type="button"
          className="adaptive-start-button"
          data-testid="start-recommended-session"
          onClick={() => onStartAdaptive(adaptiveSettings)}
        >
          <span>▶</span>
          <strong>Start recommended session</strong>
          <small>{modeLabel(adaptiveSettings.mode)} · about {Math.max(4, adaptiveSettings.questionCount)} min</small>
        </button>
      </section>

      <section className="adaptive-practice" aria-labelledby="practice-controls-title">
        <div className="learning-section-heading">
          <div><h2 id="practice-controls-title">Choose your practice</h2><p>Set the curriculum, topic, length and learning style.</p></div>
        </div>
        <div className="adaptive-practice-controls">
          <label>
            <span>Curriculum</span>
            <select
              aria-label="Curriculum"
              value={adaptiveSettings.curriculumId}
              onChange={(event) => onAdaptiveSettings({ ...adaptiveSettings, curriculumId: event.target.value as CurriculumId })}
            >
              <option value="foxchild">FoxChild</option>
              <option value="abrsm">ABRSM</option>
              <option value="trinity">Trinity</option>
              <option value="gcse">GCSE</option>
            </select>
          </label>
          <label>
            <span>Topic</span>
            <select
              aria-label="Practice topic"
              value={adaptiveSettings.domain}
              onChange={(event) => onAdaptiveSettings({ ...adaptiveSettings, domain: event.target.value as LearningDomain | "all" })}
            >
              <option value="all">All music skills</option>
              {coverage.map((entry) => <option key={entry.domain} value={entry.domain}>{domainLabel(entry.domain)}</option>)}
            </select>
          </label>
          <fieldset>
            <legend>Questions</legend>
            <div>
              {[5, 10, 15].map((count) => (
                <button
                  type="button"
                  key={count}
                  className={adaptiveSettings.questionCount === count ? "active" : ""}
                  aria-pressed={adaptiveSettings.questionCount === count}
                  onClick={() => onAdaptiveSettings({ ...adaptiveSettings, questionCount: count })}
                >
                  {count}
                </button>
              ))}
            </div>
          </fieldset>
          <button type="button" className="primary adaptive-build-button" onClick={() => onStartAdaptive(adaptiveSettings)}>
            Build my session →
          </button>
        </div>
        <div className="learning-mode-tabs adaptive-mode-tabs" aria-label="Adaptive learning mode">
          {modes.map((item) => (
            <button
              type="button"
              key={item.id}
              className={adaptiveSettings.mode === item.id ? "active" : ""}
              onClick={() => {
                onAdaptiveSettings({ ...adaptiveSettings, mode: item.id });
                onMode(item.id);
              }}
            >
              <strong>{item.label}</strong><span>{item.description}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="adaptive-dashboard-grid">
        <section className="adaptive-coverage" aria-labelledby="coverage-title">
          <div className="learning-section-heading">
            <div><h2 id="coverage-title">Skill coverage</h2><p>Fourteen areas that grow with you.</p></div>
            <span>{coverage.reduce((sum, entry) => sum + entry.coveredConcepts, 0)} concepts explored</span>
          </div>
          <div className="adaptive-coverage-grid" data-testid="adaptive-coverage-map">
            {coverage.map((entry) => (
              <button
                type="button"
                key={entry.domain}
                className={adaptiveSettings.domain === entry.domain ? "active" : ""}
                onClick={() => onAdaptiveSettings({ ...adaptiveSettings, domain: entry.domain })}
                aria-label={`${domainLabel(entry.domain)}, ${Math.round(entry.mastery * 100)} percent mastery`}
              >
                <span>{domainIcon(entry.domain)}</span>
                <strong>{domainLabel(entry.domain)}</strong>
                <small>{entry.coveredConcepts}/{entry.conceptCount} concepts · {Math.round(entry.mastery * 100)}%</small>
                <i><b style={{ width: `${entry.mastery * 100}%` }} /></i>
              </button>
            ))}
          </div>
        </section>

        <aside className="adaptive-insights">
          <section className="adaptive-mastery-card">
            <div className="learning-section-heading"><div><h2>Mastery</h2><p>Your skills at a glance.</p></div></div>
            <div className="adaptive-band-list">
              <span><i className="mastered" /><strong>{masteryBands.mastered}</strong> Mastered</span>
              <span><i className="secure" /><strong>{masteryBands.secure}</strong> Secure</span>
              <span><i className="developing" /><strong>{masteryBands.developing}</strong> Developing</span>
              <span><i className="new" /><strong>{masteryBands.new}</strong> New</span>
            </div>
          </section>
          <section className="adaptive-next-review">
            <span>Next review</span>
            <strong>{nextReview ? domainLabel(nextReview.domain) : "Ready when you are"}</strong>
            <p>{nextReview?.nextReviewAt ? formatReviewTime(nextReview.nextReviewAt) : "Complete a session to begin your review schedule."}</p>
          </section>
        </aside>
      </div>

      <div className="adaptive-secondary-grid">
        <section className="adaptive-history">
          <div className="learning-section-heading"><div><h2>Recent answers</h2><p>Your latest practice activity.</p></div></div>
          {recentAttempts.length ? recentAttempts.map((attempt) => (
            <article key={attempt.attemptId}>
              <span className={attempt.result?.passed ? "correct" : "incorrect"}>{attempt.result?.passed ? "✓" : "↻"}</span>
              <div><strong>{conceptLabel(attempt.result?.masteryEvidence[0]?.skillId ?? attempt.itemId)}</strong><small>{formatRelativeAttempt(attempt.submittedAt)}</small></div>
              <b>{Math.round(attempt.result?.percentage ?? 0)}%</b>
            </article>
          )) : <p className="adaptive-empty">Your completed answers will appear here.</p>}
        </section>
        <section className="adaptive-mistakes">
          <div className="learning-section-heading"><div><h2>Common mistakes</h2><p>Skills worth revisiting next.</p></div></div>
          {mistakes.length ? mistakes.map((entry) => (
            <article key={entry.conceptId}>
              <div><strong>{conceptLabel(entry.conceptId)}</strong><small>{domainLabel(entry.domain)}</small></div>
              <span>{entry.incorrectCount} to review</span>
            </article>
          )) : <p className="adaptive-empty">No recurring mistakes yet—nice work.</p>}
        </section>
      </div>

    </div>
  );
}

function SetOverview({
  set,
  progress,
  mode,
  visual,
  onBack,
  onMode,
  onLaunch
}: {
  set: QuestionSet;
  progress: SetProgress;
  mode: LearningMode;
  visual: typeof setVisuals[number];
  onBack: () => void;
  onMode: (mode: LearningMode) => void;
  onLaunch: (kind: SessionKind) => void;
}) {
  const items = questionItems(set);
  const locale = String(set.defaults?.locale ?? set.metadata.language);
  return (
    <div className="learning-overview">
      <button type="button" className="learning-back-link" onClick={onBack}>← Back to all sets</button>
      <header style={{ "--set-colour": visual.colour, "--set-tint": visual.tint } as CSSProperties}>
        <span className="learning-overview-icon">{visual.icon}</span>
        <div>
          <span className="learning-kicker">Five-question learning set</span>
          <h1>{localisedText(set.metadata.title, locale)}</h1>
          <p>{localisedText(set.metadata.description, locale)}</p>
        </div>
        <div className="learning-overview-score"><strong>{Math.round(progress.mastery)}%</strong><span>mastery</span></div>
      </header>
      <div className="learning-overview-layout">
        <main>
          <section className="learning-mode-choice">
            <h2>How would you like to learn?</h2>
            <div>
              {modes.map((item) => (
                <button type="button" key={item.id} className={mode === item.id ? "active" : ""} onClick={() => onMode(item.id)}>
                  <span>{item.id === "learn" ? "◉" : item.id === "practise" ? "↗" : "✓"}</span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </button>
              ))}
            </div>
          </section>
          <section className="learning-question-list">
            <div className="learning-section-heading"><div><h2>Questions in this set</h2><p>Your progress is saved automatically</p></div><span>{progress.completedQuestions}/{progress.totalQuestions}</span></div>
            {items.map((item, index) => {
              const state = progress.itemStates[index];
              return (
                <article key={item.id} className={state}>
                  <span className="learning-list-status">{state === "correct" ? "✓" : state === "incorrect" ? "!" : index + 1}</span>
                  <div><strong>{localisedText(item.prompt.content, locale)}</strong><span>{interactionLabel(item.interaction.kind)}</span></div>
                  <span>{state === "correct" ? "Correct" : state === "incorrect" ? "Try again" : "Not started"}</span>
                </article>
              );
            })}
          </section>
        </main>
        <aside className="learning-overview-actions">
          <section>
            <h3>Set progress</h3>
            <div className="learning-overview-progress"><span style={{ width: `${progress.completedQuestions / progress.totalQuestions * 100}%` }} /></div>
            <dl>
              <div><dt>Completed</dt><dd>{progress.completedQuestions}/{progress.totalQuestions}</dd></div>
              <div><dt>Best score</dt><dd>{Math.round(progress.bestScore)}%</dd></div>
              <div><dt>Last attempt</dt><dd>{formatRelativeAttempt(progress.lastAttempt)}</dd></div>
            </dl>
          </section>
          <button type="button" className="primary large" onClick={() => onLaunch(progress.completedQuestions > 0 && progress.completedQuestions < progress.totalQuestions ? "continue" : "start")}>
            {progress.completedQuestions > 0 && progress.completedQuestions < progress.totalQuestions ? "Continue set" : "Start set"} →
          </button>
          <button type="button" disabled={progress.mistakeItemIndices.length === 0} onClick={() => onLaunch("review")}>Review {progress.mistakeItemIndices.length || ""} mistakes</button>
        </aside>
      </div>
    </div>
  );
}

function SetResults({
  set,
  progress,
  mode,
  visual,
  onHome,
  onOverview,
  onReview
}: {
  set: QuestionSet;
  progress: SetProgress;
  mode: LearningMode;
  visual: typeof setVisuals[number];
  onHome: () => void;
  onOverview: () => void;
  onReview: () => void;
}) {
  const isAdaptiveSession = set.id.startsWith("session-");
  return (
    <div className="learning-results">
      <div className="learning-results-badge" style={{ "--set-colour": visual.colour, "--set-tint": visual.tint } as CSSProperties}>{progress.bestScore >= 80 ? "★" : "✓"}</div>
      <span className="learning-kicker">{modeLabel(mode)} complete</span>
      <h1>{localisedText(set.metadata.title, set.metadata.language)}</h1>
      <p>You completed {progress.completedQuestions} of {progress.totalQuestions} questions.</p>
      <div className="learning-results-stats">
        <div><strong>{Math.round(progress.bestScore)}%</strong><span>Best score</span></div>
        <div><strong>{progress.correctQuestions}</strong><span>Correct</span></div>
        <div><strong>{progress.incorrectQuestions}</strong><span>To review</span></div>
        <div><strong>{Math.round(progress.mastery)}%</strong><span>Mastery</span></div>
      </div>
      <div className="learning-results-actions">
        <button type="button" onClick={onHome}>{isAdaptiveSession ? "Learning home" : "All learning sets"}</button>
        {!isAdaptiveSession ? <button type="button" onClick={onOverview}>Set overview</button> : null}
        <button type="button" className="primary" disabled={progress.mistakeItemIndices.length === 0} onClick={onReview}>Review mistakes</button>
      </div>
    </div>
  );
}

async function loadQuestionBank(): Promise<{ loadedSets: QuestionSet[]; adaptiveSets: QuestionSet[]; entries: LearningCatalogueEntry[] }> {
  const manifestResponse = await fetch("/learning/manifest.json");
  if (!manifestResponse.ok) throw new Error("The learning catalogue manifest is unavailable.");
  const manifest = await manifestResponse.json() as BankManifest;
  const loadedSets = await Promise.all(manifest.sets.map(async (entry) => {
    const response = await fetch(`/learning/question-sets/${entry.file}`);
    if (!response.ok) throw new Error(`Could not load ${entry.title}.`);
    return normaliseQuestionBankSet(await response.json() as QuestionSet);
  }));
  const adaptiveSets = await Promise.all((manifest.adaptivePacks ?? []).map(async (entry) => {
    const response = await fetch(`/learning/question-sets/${entry.file}`);
    if (!response.ok) throw new Error(`Could not load ${entry.title}.`);
    return normaliseQuestionBankSet(await response.json() as QuestionSet);
  }));
  const entries = loadedSets.map((set, index) => ({
    id: set.id,
    title: localisedText(set.metadata.title, set.metadata.language),
    description: localisedText(set.metadata.description, set.metadata.language),
    domain: String(set.metadata.domain ?? manifest.sets[index]?.domain ?? ""),
    categories: categoriesForSet(set),
    questionCount: questionItems(set).length,
    file: manifest.sets[index]?.file ?? ""
  }));
  return { loadedSets, adaptiveSets, entries };
}

function overallProgress(sets: QuestionSet[], progressBySet: Map<string, SetProgress>) {
  const progress = sets.map((set) => progressBySet.get(set.id) ?? emptyProgress(set.id, questionItems(set).length));
  const total = progress.reduce((sum, item) => sum + item.totalQuestions, 0);
  const completed = progress.reduce((sum, item) => sum + item.completedQuestions, 0);
  const correct = progress.reduce((sum, item) => sum + item.correctQuestions, 0);
  const started = progress.filter((item) => item.completedQuestions > 0).length;
  return {
    total,
    completed,
    correct,
    started,
    mastery: total === 0 ? 0 : progress.reduce((sum, item) => sum + item.mastery * item.totalQuestions, 0) / total,
    percentage: total === 0 ? 0 : completed / total * 100,
    streak: completed > 0 ? 3 : 0
  };
}

function emptyProgress(setId: string, total: number): SetProgress {
  return {
    setId,
    completedQuestions: 0,
    totalQuestions: total,
    correctQuestions: 0,
    incorrectQuestions: 0,
    mastery: 0,
    bestScore: 0,
    resumeItemIndex: 0,
    mistakeItemIndices: [],
    itemStates: Array.from({ length: total }, () => "unanswered")
  };
}

function itemAttemptState(setId: string, itemId: string, attempts: LearningAttempt[]): "unanswered" | "correct" | "incorrect" {
  const matches = attempts.filter((attempt) => attempt.questionSetId === setId && attempt.itemId === itemId && attempt.result);
  if (matches.length === 0) return "unanswered";
  return matches.some((attempt) => attempt.result?.passed) ? "correct" : "incorrect";
}

function renderSimpleStimulus(item: ResolvedLearningItem, locale: string) {
  const stimulus = item.resolvedStimuli.find((entry) => entry.kind === "music-symbol" || entry.kind === "text" || entry.kind === "rich-text");
  if (!stimulus) return null;
  if (stimulus.kind === "music-symbol") {
    const symbolId = isRecord(stimulus.content) ? String(stimulus.content.symbolId ?? "") : "";
    return <div className="learning-symbol-stimulus" aria-label={notationDescription(item, locale)}><span>{symbolGlyph(symbolId)}</span></div>;
  }
  return <div className="learning-text-stimulus">{localisedText(stimulus.content, locale)}</div>;
}

function symbolGlyph(id: string): string {
  const glyphs: Record<string, string> = {
    staccato: "•",
    fermata: "𝄐",
    crescendo: "＜",
    tie: "⌒",
    natural: "♮",
    "whole-note": "𝅝",
    "half-note": "𝅗𝅥",
    "quarter-note": "♩",
    "eighth-note": "♪",
    "dotted-half-note": "𝅗𝅥·",
    trill: "tr",
    turn: "↻",
    mordent: "≋",
    "grace-note": "♬"
  };
  return glyphs[id] ?? "♪";
}

function notationDescription(item: ResolvedLearningItem | undefined, locale: string): string {
  const stimulus = item?.resolvedStimuli.find((entry) => entry.kind === "notation" || entry.kind === "music-symbol");
  return isRecord(stimulus?.accessibility)
    ? localisedText(stimulus.accessibility.description, locale)
    : "Music question";
}

function notationWantsTimeSignature(item: ResolvedLearningItem): boolean {
  const notation = item.resolvedStimuli.find((entry) => entry.kind === "notation");
  const source = notation?.source as Record<string, unknown> | undefined;
  const parameters = isRecord(source?.parameters) ? source.parameters : {};
  return parameters.showTimeSignature !== false && isRecord(parameters.timeSignature);
}

function keyboardRange(item: ResolvedLearningItem): { from: string; to: string } {
  const range = isRecord(item.interaction.range) ? item.interaction.range : {};
  const minimum = Number(range.minimumMidi ?? 48);
  const maximum = Number(range.maximumMidi ?? 72);
  return { from: midiName(minimum), to: midiName(maximum) };
}

function midiName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function interactionLabel(kind: string): string {
  if (kind === "music-keyboard") return "Piano or MIDI";
  if (kind === "choice") return "Multiple choice";
  return kind.replaceAll("-", " ");
}

function modeLabel(mode: LearningMode): string {
  return mode === "practise" ? "Practise" : mode[0].toUpperCase() + mode.slice(1);
}

function domainLabel(domain: LearningDomain): string {
  return domain.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function conceptLabel(conceptId: string): string {
  const parts = conceptId.split(".");
  return parts.slice(1).join(" ").replaceAll("-", " ") || domainLabel(inferDomainFromConcept(conceptId));
}

function domainIcon(domain: LearningDomain): string {
  const icons: Record<LearningDomain, string> = {
    "note-reading": "𝄞",
    "key-signatures": "♯",
    "music-symbols": "𝄐",
    "note-values": "♩",
    "time-signatures": "¾",
    intervals: "↗",
    chords: "♬",
    scales: "♭",
    rhythm: "𝅘𝅥𝅮",
    tempo: "♙",
    "ear-training": "♫",
    "sight-reading": "◉",
    "melody-dictation": "♪",
    "error-detection": "✓"
  };
  return icons[domain];
}

function formatReviewTime(value: string): string {
  const difference = Date.parse(value) - Date.now();
  if (difference <= 0) return "Ready to review now.";
  const hours = Math.ceil(difference / 3_600_000);
  if (hours < 24) return `Due in ${hours} hour${hours === 1 ? "" : "s"}.`;
  const days = Math.ceil(hours / 24);
  return `Due in ${days} day${days === 1 ? "" : "s"}.`;
}

function knowledgeConceptStatusCopy(entry: KnowledgeConceptState): string {
  if (entry.status === "review") return "Needs review";
  if (entry.status === "weak") return "Needs support";
  if (entry.status === "locked") return "Locked";
  if (entry.status === "mastered") return "Mastered";
  return entry.evidenceCount > 0 ? "Learning" : "Ready to learn";
}

function todayPracticeReason(entry: KnowledgeConceptState, nextReview?: ConceptMastery): string {
  if (entry.status === "weak") return "A focused session to rebuild a tricky skill";
  if (entry.status === "review" || nextReview?.conceptId === entry.concept.id) return "Ready now on your review schedule";
  if (entry.evidenceCount > 0) return "Continue from your most useful next step";
  return "The best unlocked concept for your current pathway";
}

function exampleScoreForConcept(entry: KnowledgeConceptState): FoxChildMusicScore | undefined {
  const family = adaptiveFamilies.find((candidate) => candidate.domain === entry.concept.domain);
  if (!family) return undefined;
  const generated = new QuestionFamilyEngine().generate(
    family.id,
    `knowledge-example:${entry.concept.id}`,
    entry.concept.estimatedDifficulty / 5
  );
  const notation = generated.item.stimulus.find((stimulus) => stimulus.kind === "notation");
  if (!isRecord(notation?.source) || notation.source.mode !== "inline-ast" || !isRecord(notation.source.score)) return undefined;
  return notation.source.score as unknown as FoxChildMusicScore;
}

function saveLearningSessionDraft(draft: Omit<LearningSessionDraft, "format" | "schemaVersion">) {
  const payload: LearningSessionDraft = {
    format: "FoxChildLearningSession",
    schemaVersion: 1,
    ...draft
  };
  window.localStorage.setItem(learningSessionKey, JSON.stringify(payload));
}

function loadLearningSessionDraft(): LearningSessionDraft | undefined {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(learningSessionKey) ?? "null") as unknown;
    if (!isRecord(parsed)
      || parsed.format !== "FoxChildLearningSession"
      || parsed.schemaVersion !== 1
      || !isRecord(parsed.set)
      || !Array.isArray(parsed.sessionIndices)
      || typeof parsed.sessionPosition !== "number"
      || typeof parsed.focusedConceptId !== "string") return undefined;
    return parsed as unknown as LearningSessionDraft;
  } catch {
    return undefined;
  }
}

function clearLearningSessionDraft() {
  window.localStorage.removeItem(learningSessionKey);
}

function indexForSet(setId: string): number {
  const knownOrder = [
    "set-note-reading-01",
    "set-key-signatures-major-01",
    "set-music-symbols-01",
    "set-note-values-01",
    "set-time-signatures-01",
    "set-interval-ear-training-01",
    "set-chord-ear-training-01",
    "set-tempo-terms-01",
    "set-scales-and-keys-01",
    "set-rhythm-counting-01"
  ];
  const knownIndex = knownOrder.indexOf(setId);
  if (knownIndex >= 0) return knownIndex;
  const match = /^set-(\d+)(?:-|$)/.exec(setId);
  return match ? Math.max(0, Number(match[1]) - 1) : 0;
}

function exportLearningProgress(attempts: LearningAttempt[]) {
  const payload = {
    format: "FoxChildLearningProgress",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    attempts
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `FoxChild-Learning-Progress-${new Date().toISOString().slice(0, 10)}.fcmusic`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function importLearningProgress(file: File): Promise<LearningAttempt[]> {
  if (file.size > 5_000_000) throw new Error("The learning progress file is too large.");
  const parsed = JSON.parse(await file.text()) as unknown;
  if (!isRecord(parsed) || parsed.format !== "FoxChildLearningProgress" || parsed.schemaVersion !== 1 || !Array.isArray(parsed.attempts)) {
    throw new Error("This is not a supported FoxChild learning progress file.");
  }
  if (parsed.attempts.some((attempt) => !isRecord(attempt) || typeof attempt.attemptId !== "string")) {
    throw new Error("The learning progress file contains invalid attempt data.");
  }
  return parsed.attempts as unknown as LearningAttempt[];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
