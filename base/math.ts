export interface NumberAggregator {
  get currentValue(): number;
  addValue(v: number): void;
}

export function avg(values: Iterable<number>): number {
  let result = 0;
  let count = 0;
  for (const v of values) {
    result += v;
    ++count;
  }
  return count === 0 ? 0 : result / count;
}

export class MovingAverage implements NumberAggregator {
  private readonly _readingsCount: number;
  private _values: number[];

  constructor(readingsCount: number) {
    this._readingsCount = readingsCount;
    this._values = [];
  }

  get currentValue(): number {
    return avg(this._values);
  }

  addValue(v: number): void {
    const values = this._values;
    if (values.length >= this._readingsCount) {
      values.shift();
    }
    values.push(v);
  }
}

// min - inclusive, max - exclusive
// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random#Getting_a_random_integer_between_two_values
export function randomInt(min: number, max: number): number {
  if (min === max) return min;

  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min;
}

export type Point2D = { x: number; y: number };
export type Size2D = { width: number; height: number };
export type Rect2D = Size2D & Point2D;
