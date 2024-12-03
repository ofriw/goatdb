import { bsearch } from '../algorithms.ts';
import {
  Scheduler,
  CoroutineScheduler,
  SchedulerPriority,
} from '../coroutine.ts';

function defaultComparator<T>(a: T, b: T): number {
  return (a as any) - (b as any);
}

function defaultEQ<T>(a: T, b: T): boolean {
  return a === b;
}

export class SortedList<T> {
  readonly comparator: (x: T, y: T) => number;
  private readonly _arr: T[];
  private readonly _eq: (a: T, y: T) => boolean;

  constructor(
    comparator?: (x: T, y: T) => number,
    eq?: (a: T, y: T) => boolean
  ) {
    this._arr = [];
    this.comparator = comparator || defaultComparator;
    this._eq = eq || defaultEQ;
  }

  get(index: number): T | undefined {
    return this._arr[index];
  }

  get size(): number {
    return this._arr.length;
  }

  get first(): T | undefined {
    return this._arr[0];
  }

  get last(): T | undefined {
    return this._arr[this._arr.length - 1];
  }

  *entries(
    inclusiveStart = 0,
    exclusiveEnd = this._arr.length
  ): Generator<[number, T]> {
    for (let i = inclusiveStart; i < exclusiveEnd; i++) {
      const element = this._arr[i];
      yield [i, element];
    }
  }

  values(): T[] {
    return Array.from(this._arr);
  }

  valuesUnsafe(): T[] {
    return this._arr;
  }

  add(v: T): number {
    const arr = this._arr;
    const idx = bsearch(arr, v, this.comparator);
    if (idx >= arr.length || !this._eq(arr[idx], v)) {
      this._arr.splice(idx, 0, v);
    }
    return idx;
  }

  // sort(): void {
  //   const unorderedItems: T[] = [];
  //   const arr = this._arr;
  //   const comparator = this._comparator;
  //   for (let i = 1; i < arr.length; ++i) {
  //     const prev = arr[i - 1];
  //     const current = arr[i];
  //     if (comparator(prev, current) > 0) {
  //       unorderedItems.push(current);
  //       arr.splice(i, 1);
  //       --i;
  //     }
  //   }
  //   for (const v of unorderedItems) {
  //     debugger;
  //     this.add(v);
  //   }
  //   // this._arr.sort(this._comparator);
  // }

  pop(): T | undefined {
    return this._arr.pop();
  }

  delete(v: T): boolean {
    const arr = this._arr;
    const idx = bsearch(arr, v, this.comparator);
    if (idx < arr.length && this._eq(arr[idx], v)) {
      arr.splice(idx, 1);
      return true;
    }
    return false;
  }

  deleteIndex(idx: number): boolean {
    const arr = this._arr;
    if (idx < arr.length) {
      arr.splice(idx, 1);
      return true;
    }
    return false;
  }

  has(v: T): boolean {
    return this.find(v) >= 0;
  }

  find(v: T): number {
    const arr = this._arr;
    const idx = bsearch(arr, v, this.comparator);
    if (idx < arr.length && this._eq(arr[idx], v)) {
      return idx;
    }
    return -1;
  }

  *map<OT>(mapper: (val: T, idx: number) => OT): Iterable<OT> {
    const arr = Array.from(this._arr);
    for (let i = 0; i < arr.length; i++) {
      yield mapper(arr[i], i);
    }
  }

  forEach(func: (val: T, idx: number) => void): void {
    const arr = this._arr;
    for (let i = 0; i < arr.length; ++i) {
      func(arr[i], i);
    }
  }

  forEachAsync(
    func: (val: T, idx: number) => void,
    scheduler?: Scheduler,
    priority?: SchedulerPriority,
    name?: string
  ): Promise<void> {
    if (!scheduler) {
      scheduler = CoroutineScheduler.sharedScheduler();
    }
    return scheduler.schedule(
      _forEachAsyncGen(this._arr, func),
      priority,
      name
    );
  }

  [Symbol.iterator](): Iterator<T> {
    return Array.from(this._arr)[Symbol.iterator]();
  }
}

function* _forEachAsyncGen<T>(
  arr: T[],
  func: (val: T, idx: number) => void
): Generator<void> {
  for (let i = 0; i < arr.length; ++i) {
    func(arr[i], i);
    yield;
  }
}
