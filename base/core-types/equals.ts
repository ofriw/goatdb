import { dictEquals, Dictionary } from '../collections/dict.ts';
import {
  CoreKey,
  CoreOptions,
  CoreType,
  CoreValue,
  IterableFilterFunc,
  ReadonlyCoreArray,
  ReadonlyCoreObject,
} from './base.ts';
import {
  getCoreType,
  getCoreTypeOrUndef,
  isComparable,
  isEquatable,
} from './utils.ts';
import { numbersEqual } from '../comparisons.ts';
import * as SetUtils from '../set.ts';

function coreIterableEquals(
  i1: Iterable<CoreValue>,
  i2: Iterable<CoreValue>,
  iterableFilter: IterableFilterFunc,
  options?: EqualOptions,
) {
  const iter1 = i1[Symbol.iterator]();
  const iter2 = i2[Symbol.iterator]();

  let val1 = iter1.next();
  let val2 = iter2.next();

  while (true) {
    //Find arr1 next element
    while (val1.done !== true) {
      if (!iterableFilter(val1.value)) {
        val1 = iter1.next();
      } else {
        break;
      }
    }

    //Find arr2 next element
    while (val2.done !== true) {
      if (!iterableFilter(val2.value)) {
        val2 = iter2.next();
      } else {
        break;
      }
    }

    if (
      (val1.done === true && val2.done !== true) ||
      (val2.done === true && val1.done !== true)
    ) {
      //One of the iterators is done
      return false;
    }

    if (val1.done === true && val2.done === true) {
      //both are done
      return true;
    }

    if (!coreValueEquals(val1.value, val2.value, options)) {
      return false;
    }
    val1 = iter1.next();
    val2 = iter2.next();
  }
}

function setLongMatch(
  s1: Set<CoreValue>,
  s2: Set<CoreValue>,
  options?: EqualOptions,
) {
  let matchCount = 0;
  const iterableFilter = options && options.iterableFilter;
  for (const v1 of s1) {
    if (iterableFilter && !iterableFilter(v1)) {
      continue;
    }

    let foundMatch = false;
    for (const v2 of s2) {
      if (coreValueEquals(v1, v2, options)) {
        foundMatch = true;
        break;
      }
    }
    // If v1 is not in s2, our sets differ
    if (!foundMatch) {
      return -1;
    }
    matchCount++;
  }

  return matchCount;
}

export interface EqualOptions extends CoreOptions {}

export function coreValueEquals(
  e1: CoreValue | object,
  e2: CoreValue | object,
  options?: EqualOptions,
): boolean {
  if (e1 === e2) {
    return true;
  }

  const t1 = getCoreTypeOrUndef(e1 as CoreValue);
  const t2 = getCoreTypeOrUndef(e2 as CoreValue);

  if (t1 === undefined || t2 === undefined) {
    return e1 === e2;
  }

  if (t1 !== t2) {
    return false;
  }

  switch (t1) {
    case CoreType.String:
    case CoreType.Boolean:
    case CoreType.Null:
    case CoreType.Undefined:
      return e1 === e2;

    case CoreType.Number:
      return numbersEqual(e1 as number, e2 as number);

    case CoreType.Date:
      return numbersEqual((e1 as Date).getTime(), (e2 as Date).getTime());

    case CoreType.Array: {
      const arr1 = e1 as ReadonlyCoreArray;
      const arr2 = e2 as ReadonlyCoreArray;

      const iterableFilter = options && options.iterableFilter;
      if (iterableFilter) {
        return coreIterableEquals(arr1, arr2, iterableFilter, options);
      }

      if (arr1.length !== arr2.length) {
        return false;
      }

      for (let i = 0; i < arr1.length; ++i) {
        if (!coreValueEquals(arr1[i], arr2[i], options)) {
          return false;
        }
      }

      return true;
    }

    case CoreType.Set: {
      const s1 = e1 as Set<CoreValue>;
      const s2 = e2 as Set<CoreValue>;

      const iterableFilter = options && options.iterableFilter;
      if (iterableFilter === undefined && s1.size !== s2.size) {
        return false;
      }

      // Shortcut: Linear scan of pointer inequality
      if (SetUtils.equals(s1, s2, iterableFilter)) {
        return true;
      }
      // Pointer mismatch. Must fall back to N^2 deep equality.
      // WARNING: We assume distinct values as per the normal definition of a
      // Set.
      const matchCount = setLongMatch(s1, s2, options);
      if (matchCount === -1) {
        return false;
      }

      if (iterableFilter && s2.size > matchCount) {
        if (setLongMatch(s2, s1, options) === -1) {
          return false;
        }
      }
      // All values matched. Sets are definitely equal
      return true;
    }

    case CoreType.Object: {
      const obj1 = e1 as ReadonlyCoreObject;
      const obj2 = e2 as ReadonlyCoreObject;
      for (const k in obj1) {
        if (
          obj1.hasOwnProperty(k) &&
          (options === undefined ||
            options.objectFilterFields === undefined ||
            options.objectFilterFields(k, obj1)) &&
          (!obj2.hasOwnProperty(k) ||
            !coreValueEquals(obj1[k], obj2[k], options))
        ) {
          return false;
        }
      }
      for (const k in obj2) {
        if (
          obj2.hasOwnProperty(k) &&
          (options === undefined ||
            options.objectFilterFields === undefined ||
            options.objectFilterFields(k, obj1)) &&
          !obj1.hasOwnProperty(k)
        ) {
          return false;
        }
      }
      return true;
    }

    case CoreType.Dictionary:
      return dictEquals(
        e1 as Dictionary<CoreKey, CoreValue>,
        e2 as Dictionary<CoreKey, CoreValue>,
      );

    case CoreType.Generator: {
      const g1 = e1 as Generator<CoreValue>;
      const g2 = e2 as Generator<CoreValue>;

      const iterableFilter = options && options.iterableFilter;
      if (iterableFilter) {
        return coreIterableEquals(g1, g2, iterableFilter, options);
      }

      while (true) {
        const v1 = g1.next();
        const v2 = g2.next();
        if (v1.done !== v2.done) {
          return false;
        }
        if (v1.done) {
          return true;
        }
        if (!coreValueEquals(v1.value, v2.value, options)) {
          return false;
        }
      }
    }

    case CoreType.ClassObject: {
      if (isEquatable(e1) && e1.constructor === e2?.constructor) {
        return e1.isEqual(e2);
      }

      if (isComparable(e1) && e1.constructor === e2?.constructor) {
        return e1.compare(e2) === 0;
      }

      return e1 === e2;
    }
  }
}
