import * as ArrayUtils from './array.ts';

export function shallowEqual(a: any, b: any): boolean {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    if (!a && !b) {
      return true;
    }
    return false;
  }

  for (let key of Object.keys(a)) {
    if (a[key] !== b[key]) {
      return false;
    }
  }

  for (let key of Object.keys(b)) {
    if (a[key] !== b[key]) {
      return false;
    }
  }

  return true;
}

export function numbersEqual(n1: number, n2: number): boolean {
  return Math.abs(n1 - n2) < Number.EPSILON;
}

export function mapsEqual<K, V>(m1: Map<K, V>, m2: Map<K, V>): boolean {
  if (m1 === m2) {
    return true;
  }
  if (Boolean(m1) !== Boolean(m2)) {
    return false;
  }
  if (!m1) {
    return true;
  }
  if (m1.size !== m2.size) {
    return false;
  }
  for (const [key, value] of m1) {
    if (!deepEqual(value, m2.get(key))) {
      return false;
    }
  }
  return true;
}

export function objectsEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) {
    return true;
  }

  if (!obj1 !== !obj2) {
    return false;
  }
  if (!obj1) {
    return true;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const k of keys1) {
    if (!deepEqual(obj1[k], obj2[k])) {
      return false;
    }
  }

  return true;
}

export function setsEqual<T>(s1: Set<T>, s2: Set<T>): boolean {
  if (Boolean(s1) !== Boolean(s2)) {
    return false;
  }
  if (s1.size !== s2.size) {
    return false;
  }
  const s2Copy = new Set(s2);
  for (const v1 of s1) {
    let match = undefined;
    for (const v2 of s2Copy) {
      if (deepEqual(v1, v2)) {
        match = v2;
        break;
      }
    }
    // No match found. Exit early
    if (match === undefined) {
      return false;
    } else {
      // Match found. Skip it in the next iteration
      s2Copy.delete(match);
    }
  }
  return true;
}

export function deepEqual(a: any, b: any): boolean {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    if (!a && !b) {
      return true;
    }
    return false;
  }

  if (isNumber(a) && isNumber(b)) {
    return numbersEqual(a, b);
  }

  if (isMapLike(a) && isMapLike(b)) {
    return mapsEqual(a, b);
  }

  if (isArray(a) && isArray(b)) {
    return ArrayUtils.equal(a, b, (x, y) => deepEqual(x, y));
  }

  if (isObject(a) && isObject(b)) {
    return objectsEqual(a, b);
  }

  if (a instanceof Set && b instanceof Set) {
    return setsEqual(a, b);
  }

  return false;
}

export function isMapLike(v: any): boolean {
  return v instanceof Map || Boolean(v.__IS_MAP_OBJ);
}

export function isString(v: any): v is string {
  return typeof v === 'string' || v instanceof String;
}

export function isNumber(v: any): v is number {
  return typeof v === 'number' || v instanceof Number;
}

export function isObject(v: any): v is any {
  return (
    v &&
    typeof v === 'object' &&
    Object.getPrototypeOf(v).constructor === Object
  );
}

export function isArray<T>(v: any): v is T[] {
  return v instanceof Array;
}

export function isBoolean(v: any): v is boolean {
  return v === true || v === false;
}

export function isUndefined<T>(v: T | undefined): v is undefined {
  return typeof v === 'undefined';
}

export function isDefined<T>(v: T): boolean {
  return !isUndefined(v);
}

export function isNoValue(v: any): v is null | undefined {
  return v === null || isUndefined(v);
}

export function isImmutable(v: any): boolean {
  return isString(v) || isNumber(v) || isBoolean(v) || isNoValue(v);
}

export function isFunction(v: any): v is Function {
  return typeof v === 'function';
}

export function isEmptyObject(obj: any): boolean {
  for (const k in obj) {
    if (obj.hasOwnProperty(k)) {
      return false;
    }
  }
  return true;
}

export function isGenerator<T = unknown, TReturn = any, TNext = unknown>(
  obj: any
): obj is Generator<T, TReturn, TNext> {
  return (
    !isNoValue(obj) &&
    typeof obj.next === 'function' &&
    typeof obj.throw === 'function' &&
    typeof obj.return === 'function'
  );
}
