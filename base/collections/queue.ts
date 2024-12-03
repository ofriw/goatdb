import { bsearch } from '../algorithms.ts';

function defaultComparator<T>(a: T, b: T): number {
  return (a as any) - (b as any);
}

function defaultEQ<T>(a: T, b: T): boolean {
  return a === b;
}

export class SortedQueue<T> {
  readonly _arr: T[]; // TODO: Use a binary tree
  readonly _comparator: (x: T, y: T) => number;
  readonly _eq: (a: T, y: T) => boolean;

  constructor(
    comparator?: (x: T, y: T) => number,
    eq?: (a: T, y: T) => boolean
  ) {
    this._arr = [];
    this._comparator = comparator || defaultComparator;
    this._eq = eq || defaultEQ;
  }

  get size(): number {
    return this._arr.length;
  }

  get peek(): T | undefined {
    return this._arr[this._arr.length - 1];
  }

  push(v: T): void {
    const arr = this._arr;
    const idx = bsearch(arr, v, this._comparator);
    if (idx >= arr.length || !this._eq(arr[idx], v)) {
      this._arr.splice(idx, 0, v);
    }
  }

  pop(): T | undefined {
    return this._arr.pop();
  }

  delete(v: T): boolean {
    const arr = this._arr;
    const idx = bsearch(arr, v, this._comparator);
    if (idx < arr.length && this._eq(arr[idx], v)) {
      arr.splice(idx, 1);
      return true;
    }
    return false;
  }

  has(v: T): boolean {
    const arr = this._arr;
    const idx = bsearch(arr, v, this._comparator);
    return idx < arr.length && this._eq(arr[idx], v);
  }
}
