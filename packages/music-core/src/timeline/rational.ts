import type { Rational } from "../ast/types";

export const ZERO: Rational = Object.freeze({ numerator: 0, denominator: 1 });
export const ONE: Rational = Object.freeze({ numerator: 1, denominator: 1 });

export function rational(numerator: number, denominator = 1): Rational {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    throw new Error("A rational requires finite values and a non-zero denominator.");
  }

  const sign = denominator < 0 ? -1 : 1;
  const scaledNumerator = Math.round(numerator) * sign;
  const scaledDenominator = Math.round(Math.abs(denominator));
  const divisor = gcd(Math.abs(scaledNumerator), scaledDenominator);
  return {
    numerator: scaledNumerator / divisor,
    denominator: scaledDenominator / divisor
  };
}

export function rationalFromNumber(value: number, resolution = 3840): Rational {
  if (!Number.isFinite(value)) {
    throw new Error("Cannot convert a non-finite number to rational time.");
  }
  return rational(Math.round(value * resolution), resolution);
}

export function addRational(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator
  );
}

export function subtractRational(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator
  );
}

export function multiplyRational(left: Rational, right: Rational | number): Rational {
  const factor = typeof right === "number" ? rationalFromNumber(right) : right;
  return rational(left.numerator * factor.numerator, left.denominator * factor.denominator);
}

export function divideRational(left: Rational, right: Rational | number): Rational {
  const divisor = typeof right === "number" ? rationalFromNumber(right) : right;
  if (divisor.numerator === 0) {
    throw new Error("Cannot divide rational time by zero.");
  }
  return rational(left.numerator * divisor.denominator, left.denominator * divisor.numerator);
}

export function compareRational(left: Rational, right: Rational): number {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference === 0 ? 0 : difference < 0 ? -1 : 1;
}

export function maxRational(...values: Rational[]): Rational {
  return values.reduce((current, value) => compareRational(value, current) > 0 ? value : current, ZERO);
}

export function toNumber(value: Rational): number {
  return value.numerator / value.denominator;
}

export function equalRational(left: Rational, right: Rational): boolean {
  return compareRational(left, right) === 0;
}

function gcd(left: number, right: number): number {
  let a = Math.max(1, Math.round(left));
  let b = Math.max(1, Math.round(right));
  if (left === 0) {
    return b;
  }
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a || 1;
}
