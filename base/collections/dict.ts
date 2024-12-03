import { HashMap } from './hash-map.ts';

export interface ReadonlyDict<K = any, V = any> extends Iterable<[K, V]> {
  readonly size: number;
  get(key: K): V | undefined;
  has(key: K): boolean;

  entries(): Iterable<[K, V]>;
  keys(): Iterable<K>;
  values(): Iterable<V>;
}

export interface Dictionary<K = any, V = any> extends ReadonlyDict<K, V> {
  set(key: K, value: V): void;
  delete(key: K): boolean;
  clear(): void;
}

export interface PrimitiveMap<T = any> {
  [k: string]: T;
}

export function dictToPrimitive<K, T>(
  map: Dictionary<K, T> | undefined,
): PrimitiveMap {
  const result: PrimitiveMap = {};
  if (map === undefined || map.size <= 0) {
    return result;
  }
  for (const k of map.keys()) {
    result[String(k)] = map.get(k);
  }
  return result;
}

export function dictFromPrimitive<T>(
  map: PrimitiveMap<T>,
): Dictionary<string, T> {
  return new Map(Object.entries(map));
}

export function dictEquals<K, T>(
  dic1: Dictionary<K, T>,
  dic2: Dictionary<K, T>,
  comparer: (v1: T, v2: T) => boolean = (v1, v2) => v1 === v2,
) {
  if (dic1.size !== dic2.size) return false;

  for (const [key, value1] of dic1) {
    const value2 = dic2.get(key);
    if (value2 === undefined) {
      return false;
    }

    if (!comparer(value1, value2)) {
      return false;
    }
  }

  return true;
}

export function isDictionary<K, V>(val: any): val is Dictionary<K, V> {
  return val instanceof Map || val instanceof HashMap;
}

export function convertDictionaryToObject(dict: Dictionary<string, string>): {
  [key: string]: string;
} {
  const obj: { [key: string]: string } = {};

  for (const [key, value] of dict.entries()) {
    obj[key as string] = value;
  }

  return obj;
}
