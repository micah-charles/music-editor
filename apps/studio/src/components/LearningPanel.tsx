import type { FoxChildLearningPack, ScoreDifficulty } from "@foxchild/music-core";

interface LearningPanelProps {
  analysis: ScoreDifficulty;
  learningPack: FoxChildLearningPack;
}

export function LearningPanel({ analysis, learningPack }: LearningPanelProps) {
  return (
    <div className="learning-panel">
      <section>
        <h3>Analysis</h3>
        <dl>
          <div>
            <dt>Difficulty</dt>
            <dd>{analysis.level}</dd>
          </div>
          <div>
            <dt>Range</dt>
            <dd>{analysis.range}</dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>{analysis.noteCount}</dd>
          </div>
        </dl>
        <ul>
          {analysis.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      </section>
      <section>
        <h3>Generated Questions</h3>
        <div className="question-list">
          {learningPack.questions.map((question) => (
            <article key={`${question.type}-${question.question}`}>
              <strong>{question.type}</strong>
              <p>{question.question}</p>
              <span>{question.answer}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
