import type { QuestionSet } from "./types";

export const musicLearningDemoSet: QuestionSet = {
  format: "foxchild.music-learning.question-set",
  schemaVersion: "1.0.0",
  id: "set-music-learning-foundations",
  revision: 1,
  status: "published",
  metadata: {
    title: { "en-GB": "Music Learning Foundations" },
    description: { "en-GB": "Read key signatures and written notes using the shared FoxChild score engine." },
    language: "en-GB",
    authors: ["FoxChild"],
    subject: "music-theory",
    domain: "notation-reading",
    skillIds: ["theory.key-signature.major.identify", "notation.treble.pitch.identify"],
    difficulty: { system: "foxchild-1-10", value: 2 },
    tags: ["key-signature", "note-reading", "midi"],
    accessibility: {
      keyboardNavigable: true,
      reducedMotionSupported: true,
      colourIndependentFeedback: true
    }
  },
  defaults: { locale: "en-GB", feedbackMode: "after-submit" },
  assets: [],
  variables: {},
  delivery: {
    mode: "guided-practice",
    navigation: "linear",
    showProgress: true,
    allowResume: true
  },
  sections: [{
    id: "section-reading",
    title: { "en-GB": "Reading notation" },
    items: [
      {
        id: "item-a-major-key-signature",
        type: "selected-response",
        version: 1,
        metadata: {
          skillIds: ["theory.key-signature.major.identify"],
          difficulty: 2,
          tags: ["three-sharps"]
        },
        variables: {},
        stimulus: [{
          id: "key-signature-score",
          kind: "notation",
          source: {
            mode: "generator",
            generatorId: "key-signature-display@1",
            seed: "a-major-fixed-001",
            parameters: {
              tonic: "A",
              mode: "major",
              clef: "treble",
              showNotes: false
            }
          },
          presentation: {
            renderer: "foxchild-score",
            layout: "single-system",
            scale: 1.5,
            showCursor: false,
            editable: false
          },
          playback: { enabled: false },
          accessibility: {
            description: { "en-GB": "Treble clef with F-sharp, C-sharp and G-sharp." }
          }
        }],
        prompt: {
          content: { "en-GB": "Which major key is shown?" },
          format: "plain-text",
          ariaLabel: { "en-GB": "Choose the major key represented by the displayed key signature." }
        },
        interaction: {
          kind: "choice",
          responseId: "response-main",
          cardinality: "single",
          display: "buttons",
          shuffleOptions: true,
          optionOrderSeed: "a-major-options-001",
          options: [
            { id: "opt-d-major", content: { "en-GB": "D major" } },
            { id: "opt-a-major", content: { "en-GB": "A major" } },
            { id: "opt-e-major", content: { "en-GB": "E major" } },
            { id: "opt-b-major", content: { "en-GB": "B major" } }
          ]
        },
        response: {
          id: "response-main",
          baseType: "identifier",
          cardinality: "single",
          correct: { value: "opt-a-major" }
        },
        assessment: {
          strategy: "exact-identifier@1",
          maximumScore: 1,
          passingScore: 1,
          attemptPolicy: { maximumAttempts: 2, scorePolicy: "best" }
        },
        feedback: {
          mode: "after-submit",
          correct: { message: { "en-GB": "Correct. Three sharps represent A major or F-sharp minor." } },
          incorrect: { message: { "en-GB": "Count the sharps and use the final-sharp rule." } },
          showCorrectAnswer: "after-final-attempt",
          showScore: true
        },
        hints: [{
          id: "hint-final-sharp",
          content: { "en-GB": "The last sharp is G-sharp. Move one letter name higher." },
          cost: 0
        }],
        explanation: {
          content: { "en-GB": "One letter above G is A, so the major key is A major." }
        },
        delivery: {},
        analytics: {
          misconceptionMap: {
            "opt-d-major": "confuses-two-and-three-sharps",
            "opt-e-major": "confuses-three-and-four-sharps"
          }
        }
      },
      {
        id: "item-play-f-sharp-four",
        type: "midi-input",
        version: 1,
        metadata: {
          skillIds: ["notation.treble.pitch.identify"],
          difficulty: 2,
          requiredEquipment: [],
          alternativeInput: "onscreen-piano"
        },
        variables: {},
        stimulus: [{
          id: "written-note-score",
          kind: "notation",
          source: {
            mode: "generator",
            generatorId: "note-reading@1",
            seed: "written-f-sharp-4-001",
            parameters: { midi: 66, clef: "treble" }
          },
          presentation: {
            renderer: "foxchild-score",
            layout: "single-system",
            showCursor: false,
            editable: false
          },
          accessibility: {
            description: { "en-GB": "A single written note on a treble-clef staff." }
          }
        }],
        prompt: {
          content: { "en-GB": "Play the written note on the piano keyboard." },
          format: "plain-text"
        },
        interaction: {
          kind: "music-keyboard",
          responseId: "response-note",
          inputSources: ["onscreen-piano", "web-midi", "computer-keyboard"],
          mode: "single-note",
          range: { minimumMidi: 48, maximumMidi: 72 },
          display: { showNoteNames: true, showOctaveNumbers: true, highlightPressedKeys: true },
          submission: { mode: "immediate-on-note-on" }
        },
        response: {
          id: "response-note",
          baseType: "pitch",
          cardinality: "single",
          correct: {
            value: {
              written: { step: "F", alter: 1, octave: 4 },
              midi: 66
            }
          }
        },
        assessment: {
          strategy: "pitch-match@1",
          maximumScore: 1,
          passingScore: 1,
          parameters: {
            compare: "written-pitch",
            octaveRequired: true,
            allowEnharmonicEquivalent: false
          },
          attemptPolicy: { maximumAttempts: 3, scorePolicy: "best" }
        },
        feedback: {
          mode: "after-submit",
          correct: { message: { "en-GB": "Correct — that is F-sharp 4." } },
          incorrect: { message: { "en-GB": "Try again. Check the staff position and accidental." } },
          showCorrectAnswer: "after-final-attempt",
          showScore: true
        },
        hints: [{
          id: "hint-treble-space",
          content: { "en-GB": "The note sits in the first treble-clef space and has a sharp." },
          cost: 0
        }],
        explanation: {
          content: { "en-GB": "The first space in treble clef is F; the sharp raises it to F-sharp." }
        },
        delivery: {},
        analytics: {}
      }
    ]
  }]
};
