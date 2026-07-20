import type { FoxChildMusicScore } from "../ast/types";
import { durationToBeats } from "../rhythm/duration";
import { pitchToName } from "../theory/pitch";

export interface LearningQuestion {
  type: "note-reading" | "rhythm" | "analysis" | "chord-function";
  question: string;
  answer: string;
}

export interface FoxChildLearningPack {
  subject: "Music";
  chapter: string;
  activityType: "music-score";
  scoreId: string;
  scoreAst: FoxChildMusicScore;
  questions: LearningQuestion[];
}

export function astToQuestions(score: FoxChildMusicScore): LearningQuestion[] {
  const questions: LearningQuestion[] = [];
  const firstNote = score.parts[0]?.measures.flatMap((measure) => measure.events).find((event) => event.type === "note");
  const chordEvents = score.parts.flatMap((part) => part.measures.flatMap((measure) => measure.events)).filter((event) => event.type === "chord");

  if (firstNote?.type === "note") {
    questions.push({
      type: "note-reading",
      question: "What is the first note?",
      answer: pitchToName(firstNote.pitch)
    });
    questions.push({
      type: "rhythm",
      question: "How many beats is the first note?",
      answer: String(durationToBeats(firstNote.duration))
    });
  }

  questions.push({
    type: "analysis",
    question: "What key is this score in?",
    answer: `${score.global.key.tonic} ${score.global.key.mode}`
  });

  chordEvents.forEach((event) => {
    if (event.type === "chord" && event.semantic?.chordName) {
      questions.push({
        type: "chord-function",
        question: `In ${score.global.key.tonic} ${score.global.key.mode}, what is the function of ${event.semantic.chordName}?`,
        answer: `${event.semantic.roman ?? "?"} / ${event.semantic.function ?? "other"}`
      });
    }
  });

  return questions;
}

export function astToLearningPack(score: FoxChildMusicScore): FoxChildLearningPack {
  return {
    subject: "Music",
    chapter: score.metadata.title,
    activityType: "music-score",
    scoreId: score.id,
    scoreAst: score,
    questions: astToQuestions(score)
  };
}
