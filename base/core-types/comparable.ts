import { notReached } from '../error.ts';
import { compareStrings } from '../string.ts';
import { CoreOptions, CoreType, CoreValue } from './base.ts';
import { encodableValueHash } from './encoding/hash.ts';
import { Comparable } from './index.ts';
import { getCoreType, isEquatable, isComparable } from './utils.ts';

export const MinComparableValue = {};
export const MaxComparableValue = {};

export interface CompareOptions extends CoreOptions {
  extendFunc?: (v1: CoreValue, v2: CoreValue) => number | undefined;
}

/**
 * WARNING: passing a Set/Dictionary/Object with a class: the class must be serializable.
 * @param v1
 * @param v2
 * @param options
 * @returns
 */
export function coreValueCompare(
  v1: CoreValue,
  v2: CoreValue,
  options?: CompareOptions,
): number {
  if (v1 === v2) return 0;
  if (v1 === MinComparableValue) {
    if (v2 === MinComparableValue) {
      //Both are min
      return 0;
    }
    //v1 is always smaller
    return -1;
  }
  if (v2 === MinComparableValue) {
    return 1;
  }
  if (v1 === MaxComparableValue) {
    if (v2 === MaxComparableValue) {
      //Both are max
      return 0;
    }
    //v1 is always bigger
    return 1;
  }
  if (v2 === MaxComparableValue) {
    return -1;
  }

  if (v1 === undefined && v2 !== undefined) {
    return -1;
  }
  if (v1 !== undefined && v2 === undefined) {
    return 1;
  }

  if (v1 === null && v2 !== null) {
    return -1;
  }
  if (v1 !== null && v2 === null) {
    return 1;
  }

  if (options?.extendFunc) {
    const extRes = options.extendFunc(v1, v2);
    if (extRes !== undefined) return extRes;
  }

  const type1 = getCoreType(v1 as CoreValue);
  let type2: CoreType | undefined;
  switch (type1) {
    case CoreType.Null:
      if (v2 === null) return 0;
      break;
    case CoreType.Undefined:
      if (v2 === undefined) return 0;
      break;
    case CoreType.Boolean:
    case CoreType.Date:
    case CoreType.Number:
    case CoreType.String:
      type2 = getCoreType(v2 as CoreValue);
      if (type1 === type2) {
        return compareStrings(v1 as string, v2 as string);
      }
      break;

    case CoreType.Array:
    case CoreType.Generator:
      type2 = getCoreType(v2 as CoreValue);
      if (type2 === CoreType.Array || type2 === CoreType.Generator) {
        return coreIterableCompare(
          v1 as Iterable<CoreValue>,
          v2 as Iterable<CoreValue>,
          options,
        );
      }
      break;
    case CoreType.ClassObject: {
      if (
        isComparable(v1) &&
        isComparable(v2) &&
        objectsShareAncestorClass(v1, v2)
      ) {
        // if (v1.constructor === v2?.constructor) {
        //   return v1.compare(v2);
        // }
        // if (v2 instanceof v1.constructor) {
        //   return v1.compare(v2);
        // } else if (v1 instanceof v2!.constructor) {
        //   return -1 * (v2 as Comparable).compare(v1);
        // }
        return v1.compare(v2);
      }

      if (isEquatable(v1) && v1.constructor === v2?.constructor) {
        if (v1.isEqual(v2)) return 0;
      }

      // debugger;
      notReached(
        `Incomparable classes ${v1?.constructor.name} and ${v2?.constructor.name}`,
      );
      break;
    }
  }

  const hash1 = encodableValueHash(v1 as CoreValue, options);
  const hash2 = encodableValueHash(v2 as CoreValue, options);
  if (hash1 > hash2) {
    return 1;
  }
  if (hash1 < hash2) {
    return -1;
  }
  return 0;
}

function coreIterableCompare(
  i1: Iterable<CoreValue>,
  i2: Iterable<CoreValue>,
  options?: CompareOptions,
): number {
  const iter1 = i1[Symbol.iterator]();
  const iter2 = i2[Symbol.iterator]();

  let val1 = iter1.next();
  let val2 = iter2.next();

  const iterableFilter = options && options.iterableFilter;

  while (true) {
    //Find arr1 next element
    if (iterableFilter) {
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
    }

    if (val1.done === true && val2.done !== true) {
      //i1 has less elements
      return -1;
    }

    if (val1.done !== true && val2.done === true) {
      //i1 has more elements
      return 1;
    }

    if (val1.done === true && val2.done === true) {
      //both are done
      return 0;
    }

    const cmp = coreValueCompare(val1.value, val2.value, options);
    if (cmp !== 0) {
      return cmp;
    }

    val1 = iter1.next();
    val2 = iter2.next();
  }
}

export function objectsShareAncestorClass(obj1: any, obj2: any): boolean {
  if (typeof obj1 !== 'object' && typeof obj2 !== 'object') {
    return false;
  }
  const obj1Constructors = [];
  for (
    let parent = obj1.constructor;
    parent.constructor !== Object;
    parent = Object.getPrototypeOf(parent)
  ) {
    obj1Constructors.push(parent);
  }

  for (
    let parent = obj2.constructor;
    parent.constructor !== Object;
    parent = Object.getPrototypeOf(parent)
  ) {
    if (obj1Constructors.includes(parent)) {
      return true;
    }
  }
  return false;
}
