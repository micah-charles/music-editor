export interface DistractorContext {
  correct: string | number;
  candidates: Array<string | number>;
  count: number;
  seed: string;
}

export interface DistractorStrategy {
  id: string;
  generate(context: DistractorContext): Array<string | number>;
}

export class DistractorRegistry {
  private readonly strategies = new Map<string, DistractorStrategy>();

  register(strategy: DistractorStrategy): void {
    if (this.strategies.has(strategy.id)) {
      throw new Error(`Distractor strategy "${strategy.id}" is already registered.`);
    }
    this.strategies.set(strategy.id, strategy);
  }

  resolve(id: string): DistractorStrategy {
    const strategy = this.strategies.get(id);
    if (!strategy) throw new Error(`Unknown distractor strategy "${id}".`);
    return strategy;
  }

  ids(): string[] {
    return [...this.strategies.keys()].sort();
  }
}

export function createDefaultDistractorRegistry(): DistractorRegistry {
  const registry = new DistractorRegistry();
  registry.register({
    id: "near-neighbour@1",
    generate: ({ correct, candidates, count, seed }) => {
      const values = unique(candidates).filter((candidate) => candidate !== correct);
      if (typeof correct === "number") {
        return values
          .sort((left, right) =>
            Math.abs(Number(left) - correct) - Math.abs(Number(right) - correct)
            || seededRank(seed, left) - seededRank(seed, right)
          )
          .slice(0, count);
      }
      return values
        .sort((left, right) => seededRank(seed, left) - seededRank(seed, right))
        .slice(0, count);
    }
  });
  registry.register({
    id: "curriculum-peers@1",
    generate: ({ correct, candidates, count, seed }) =>
      unique(candidates)
        .filter((candidate) => candidate !== correct)
        .sort((left, right) => seededRank(seed, left) - seededRank(seed, right))
        .slice(0, count)
  });
  registry.register({
    id: "common-confusions@1",
    generate: ({ correct, candidates, count, seed }) => {
      const values = unique(candidates).filter((candidate) => candidate !== correct);
      const correctText = String(correct);
      return values
        .sort((left, right) => {
          const leftSimilarity = commonPrefix(correctText, String(left));
          const rightSimilarity = commonPrefix(correctText, String(right));
          return rightSimilarity - leftSimilarity || seededRank(seed, left) - seededRank(seed, right);
        })
        .slice(0, count);
    }
  });
  return registry;
}

function unique(values: Array<string | number>): Array<string | number> {
  return [...new Set(values)];
}

function seededRank(seed: string, value: string | number): number {
  let hash = 2166136261;
  const text = `${seed}:${String(value)}`;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function commonPrefix(left: string, right: string): number {
  let length = 0;
  while (length < left.length && length < right.length && left[length] === right[length]) length += 1;
  return length;
}
