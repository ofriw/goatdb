import { filterIterable } from './common.ts';
import { deepEqual, isImmutable } from './comparisons.ts';
import { coreValueEquals } from './core-types/equals.ts';
import { CoreValue } from './core-types/index.ts';

export function isSet<T>(v: unknown): v is Set<T> {
  return (
    // deno-lint-ignore no-prototype-builtins
    v instanceof Set || typeof (v as any).__wrappedValueForRecord === 'function'
  );
}

export function intersection<T>(s1: Set<T>, s2: Set<T>): Set<T> {
  if (!isSet(s1)) {
    s1 = new Set(s1);
  }
  if (!isSet(s2)) {
    s2 = new Set(s2);
  }
  const result = new Set<T>();
  for (const v of s1) {
    if (s2.has(v)) {
      result.add(v);
    }
  }
  return result;
}

export function intersectionSize<T>(s1: Set<T>, s2: Iterable<T>): number {
  let count = 0;
  for (const v of s2) {
    if (s1.has(v)) {
      ++count;
    }
  }
  return count;
}

export function intersects<T>(s1: Set<T>, s2: Set<T>): boolean {
  // Make sure s1 is the smaller of the two sets
  if (s1.size > s2.size) {
    const tmp = s1;
    s1 = s2;
    s2 = tmp;
  }
  for (const v of s1) {
    if (s2.has(v)) {
      return true;
    }
  }
  return false;
}

export function difference<T>(
  s1: Set<T> | Iterable<T>,
  s2: Set<T> | Iterable<T>
): Set<T> {
  if (!isSet(s1)) {
    s1 = new Set(s1);
  }
  if (!isSet(s2)) {
    s2 = new Set(s2);
  }
  const result = new Set<T>();
  for (const v of s1) {
    if (!(s2 as Set<T>).has(v)) {
      result.add(v);
    }
  }
  for (const v of s2) {
    if (!(s1 as Set<T>).has(v)) {
      result.add(v);
    }
  }
  return result;
}

/**
 * Subtracts the values in s2 from s1 and returns the result
 * as new set. The original sets aren't modified.
 */
export function subtract<T>(v1: Iterable<T>, v2: Iterable<T>): Set<T> {
  const s2 = isSet(v2) ? v2 : new Set(v2);

  const result = new Set<T>();
  for (const v of v1) {
    if (!s2.has(v)) {
      result.add(v);
    }
  }
  return result;
}

export function* subtractIter<T>(
  v1: Iterable<T>,
  v2: Iterable<T>
): Generator<T> {
  const s2 = isSet(v2) ? v2 : new Set(v2);

  for (const v of v1) {
    if (!s2.has(v)) {
      yield v;
    }
  }
}

export function equals<T>(
  v1: Iterable<T>,
  v2: Iterable<T>,
  filter?: (v: T) => boolean
): boolean {
  const s1 = isSet(v1) ? v1 : new Set(v1);
  const s2 = isSet(v2) ? v2 : new Set(v2);
  if (filter === undefined && s1.size !== s2.size) {
    return false;
  }
  let equalsC = 0;
  for (const v of s1) {
    if (filter && !filter(v)) {
      //Don't need to check
      continue;
    }
    if (!s2.has(v)) {
      return false;
    }
    equalsC++;
  }

  if (filter && s2.size > equalsC) {
    //There are items in s2 that have not been checked
    for (const v of s2) {
      if (filter(v)) {
        if (!s1.has(v)) {
          return false;
        }
      }
    }
  }

  return true;
}

export function union<T>(
  i1: Iterable<T> | undefined,
  i2: Iterable<T> | undefined,
  inPlace = false
): Set<T> {
  let result: Set<T>;
  if (inPlace) {
    if (i1) {
      if (isSet<T>(i1)) {
        result = i1;
      } else {
        result = new Set(i1);
      }
    } else {
      result = new Set<T>();
    }
  } else {
    result = new Set<T>(i1);
  }

  if (i2) {
    for (const v of i2) {
      result.add(v);
    }
  }
  return result;
}

export function* unionIter<T>(
  i1: Iterable<T> | undefined,
  i2: Iterable<T> | undefined
) {
  if (i1 === undefined || i2 === undefined) {
    const iter = i1 !== undefined ? i1 : i2;
    if (iter) {
      for (const item of iter) {
        yield item;
      }
    }
    return;
  }

  let set: Set<T>;
  let other: Iterable<T>;

  if (isSet<T>(i1)) {
    set = i1;
    other = i2;
  } else if (isSet<T>(i2)) {
    set = i2;
    other = i1;
  } else {
    set = new Set(i1);
    other = i2;
  }

  for (const v of set) {
    yield v;
  }
  for (const v of other) {
    if (!set.has(v)) {
      yield v;
    }
  }
}

export function map<O, I>(input: Iterable<I>, mapper: (v: I) => O): Set<O> {
  const result = new Set<O>();
  for (const v of input) {
    result.add(mapper(v));
  }
  return result;
}

export function mapToArray<T>(s: Set<T>, mapper: (v: T) => any): any[] {
  const result = [];
  for (const v of s) {
    result.push(mapper(v));
  }
  return result;
}

/**
 * Adds all items from the passed iterable to `s`, and returns `s`.
 * @param s The set to update.
 * @param iterable Items to add to the set.
 * @returns The updated set.
 */
export function update<T>(s: Set<T>, iterable: Iterable<T>): Set<T> {
  for (const v of iterable) {
    s.add(v);
  }
  return s;
}

export function deleteAll<T>(s: Set<T>, iterable: Iterable<T>): Set<T> {
  for (const v of iterable) {
    s.delete(v);
  }
  return s;
}

export function from<T>(
  iterable: Iterable<T>,
  mapper?: (v: T) => any
): Set<any> {
  // Shortcut - if no mapper was given, fall back to the native constructor
  if (!mapper) {
    return new Set(iterable);
  }
  const result = new Set();
  for (const v of iterable) {
    result.add(mapper(v));
  }
  return result;
}

/**
 * Returns a single value from a set or undefined if the set is empty. The
 * actual value being returned is undefined and will depend on the specific
 * JS runtime, version, and state at the call time.
 */
export function anyValue<T>(s?: Set<T>): T | undefined {
  if (!s || !s.size) {
    return undefined;
  }
  return s.values().next().value;
}

/**
 * Checks if a set contains a given value using deep equality.
 */
export function hasByValue<T>(s1: Set<T>, v: T): boolean {
  if (s1.has(v)) {
    return true;
  }
  // Shortcut: For immutable primitives, the builtin equality check properly
  // handles by-value check as immutable primitives are guaranteed to be
  // unique pointers by the runtime.
  if (isImmutable(v)) {
    return false;
  }
  // Mutable values must be searched for using linear search
  for (const x of s1) {
    if (coreValueEquals(x as CoreValue, v as CoreValue)) {
      return true;
    }
  }
  return false;
}

/**
 * Delete a value from a set based on deep equality. The built in Set
 * implementation uses strict equality (===) for checking if values are equal.
 * This function does the same but with deepEqual() as a comparator.
 *
 * WARING: Unlike regular Set operations, this function is O(N) - linear in the
 * Set size.
 */
export function deleteByValue<T>(s: Set<T>, v: T): Set<T> {
  if (!s) {
    return s;
  }
  if (!isSet(s)) {
    s = new Set(s);
  }
  // Shortcut - exact match O(1)
  if (s.has(v)) {
    s.delete(v);
  } else if (!isImmutable(v)) {
    // No exact value - do it the hard way with a linear search.
    // We only do this for values that are not immutable. Immutable values that
    // failed the has() check are guaranteed not to exist in the set due to
    // JS uniquing happening behind the scenes.
    for (const x of s) {
      if (deepEqual(x, v)) {
        s.delete(x);
        break;
      }
    }
  }
  return s;
}

/**
 * Insert a value to a set based on deep equality. The built in Set
 * implementation uses strict equality (===) for checking if values are equal.
 * This function does the same but with deepEqual() as a comparator.
 *
 * WARING: Unlike regular Set operations, this function is O(N) - linear in the
 * Set size.
 */
export function addByValue<T>(s: Set<T>, v: T): Set<T> {
  if (!s) {
    return s;
  }
  if (!isSet(s)) {
    s = new Set(s);
  }
  // If the value is an immutable primitive we can safely just add() it.
  // The JS runtime will take care of uniquing for us.
  if (isImmutable(v)) {
    s.add(v);
  } else {
    // The value is mutable. First, check for exact match that's already
    // present in the set.
    if (!s.has(v)) {
      // No exact match. Do a linear search and verify no equal value is present
      // in our set.
      let foundMatch = false;
      for (const x of s) {
        if (deepEqual(x, v)) {
          foundMatch = true;
          break;
        }
      }
      // No equal value is present. Go ahead and add the value.
      if (!foundMatch) {
        s.add(v);
      }
    }
  }
  return s;
}

export function subtractByValue<T>(s1: Set<T>, s2: Set<T>): Set<T> {
  if (!isSet(s1)) {
    s1 = new Set(s1);
  }
  if (!isSet(s2)) {
    s2 = new Set(s2);
  }
  const result = new Set<T>();
  for (const v of s1) {
    if (!hasByValue(s2, v)) {
      result.add(v);
    }
  }
  return result;
}

export function unionByValue<T>(
  i1: Iterable<T>,
  i2: Iterable<T>,
  inPlace = false
): Set<T> {
  const result = inPlace && isSet<T>(i1) ? i1 : new Set(i1);
  for (const v of i2) {
    addByValue(result, v);
  }
  return result;
}

export function equalsByValue<T>(s1: Set<T>, s2: Set<T>): boolean {
  if (!isSet(s1)) {
    s1 = new Set(s1);
  }
  if (!isSet(s2)) {
    s2 = new Set(s2);
  }
  if (s1.size !== s2.size) {
    return false;
  }
  for (const v of s1) {
    if (!hasByValue(s2, v)) {
      return false;
    }
  }
  return true;
}

export function toggleMembership<T>(s1: Set<T>, v: T): boolean {
  if (s1.has(v)) {
    s1.delete(v);
    return false;
  } else {
    s1.add(v);
    return true;
  }
}

export function filter<T>(s: Set<T>, filter: (v: T) => boolean) {
  return new Set(filterIterable(s, filter));
}
