import { randomInt } from './math.ts';

export function equal<T>(
  arr1: T[],
  arr2: T[],
  comparator?: (a: T, b: T) => boolean
) {
  if (!!arr1 != !!arr2) {
    return false;
  }
  if (arr1 === null || arr1 === undefined) {
    return true;
  }
  if (arr1.length !== arr2.length) {
    return false;
  }
  for (let i = 0; i < arr1.length; ++i) {
    if (comparator) {
      if (!comparator(arr1[i], arr2[i])) {
        return false;
      }
    } else if (arr1[i] !== arr2[i]) {
      return false;
    }
  }
  return true;
}

export function append<T>(arr: T[], values: Iterable<T>): T[] {
  for (const v of values) {
    arr.push(v);
  }
  return arr;
}

export function* iter<T>(arr: T[]) {
  const len = arr.length;
  for (let idx = 0; idx < len; ++idx) {
    yield [idx, arr[idx]];
  }
}

export function lastValue<T>(arr: T[] | undefined): T | undefined {
  if (!arr) {
    return undefined;
  }
  return arr[arr.length - 1];
}

export function* concatIter() {
  const len = arguments.length;
  for (let i = 0; i < len; ++i) {
    const arr = arguments[i];
    for (const v of arr) {
      yield v;
    }
  }
}

// Fisher–Yates shuffle.
// See https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle
export function shuffle<T>(arr: T[]): T[] {
  if (!arr) {
    return arr;
  }
  const len = arr.length;
  for (let i = len - 1; i > 0; --i) {
    const j = randomInt(0, i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function* slices<T>(
  values: T[] | Iterable<T>,
  size: number
): Generator<T[], void, void> {
  if (values instanceof Array) {
    for (let i = 0; i < values.length; i += size) {
      yield values.slice(i, i + size);
    }
  } else {
    let slice: T[] = [];
    for (const v of values) {
      slice.push(v);
      if (slice.length >= size) {
        yield slice;
        slice = [];
      }
    }
    if (slice.length > 0) {
      yield slice;
    }
  }
}

export function anyArrayIntersection<T1, T2>(
  arr1: T1[],
  arr2: T2[],
  eq: (i1: T1, i2: T2) => boolean = (i1, i2) => (i1 as any) === (i2 as any)
) {
  for (const i1 of arr1) {
    for (const i2 of arr2) {
      if (eq(i1, i2)) {
        return true;
      }
    }
  }
  return false;
}

export function anyDuplicates<T>(arr: T[], eq?: (i1: T, i2: T) => boolean) {
  if (!eq) {
    //use set
    const set = new Set<T>(arr);
    return set.size < arr.length;
  }

  //using eq function
  for (let i = 0; i < arr.length; i++) {
    for (let j = 1; j < arr.length; j++) {
      if (eq(arr[i], arr[j])) {
        return true;
      }
    }
  }
  return false;
}
