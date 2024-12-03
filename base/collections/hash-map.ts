import { Dictionary } from './dict.ts';

export interface HashFunction<V> {
  (value: V): string;
}

export interface EqualFunction<V> {
  (v1: V, v2: V): boolean;
}

export interface CloneFunction<V> {
  (v: V): V;
}

function _noClone<T>(v: T): T {
  return v;
}

/**
 * A set implementation with a user-provided hash and equality functions.
 *
 * The API is consistent with Set so HashSet can be used as a drop-in
 * replacement.
 */
export class HashSet<V> implements Iterable<V> {
  private readonly _map: Map<string, V[]>;
  private readonly _hashFunc: HashFunction<V>;
  private readonly _equalFunc: EqualFunction<V>;
  private readonly _cloneFunc: CloneFunction<V>;

  /**
   * Initializes a new HashSet instance.
   *
   * @param hash The hash function to use for set values.
   *
   * @param eq An equality check function. If two values are deemed equal by
   *           this function, then they must also have an equal hash value.
   *
   * @param clone An optional clone function. If provided, values are first
   *              cloned when added to the set, then the clone is added rather
   *              than the original value.
   */
  constructor(
    hash: HashFunction<V>,
    eq: EqualFunction<V>,
    clone?: CloneFunction<V>,
  ) {
    this._map = new Map();
    this._hashFunc = hash;
    this._equalFunc = eq;
    this._cloneFunc = clone || _noClone;
  }

  get size(): number {
    return this._map.size;
  }

  add(v: V): boolean {
    const key = this._hashFunc(v);
    const map = this._map;
    let values = map.get(key);

    // No entry for this hash. Create it and insert.
    if (values === undefined) {
      values = [this._cloneFunc(v)];
      map.set(key, values);
      return true;
    }

    // Entry exists. Check if v already exists
    const eq = this._equalFunc;
    for (const candidate of values) {
      if (eq(candidate, v)) {
        return false;
      }
    }

    // If we got this far, v doesn't exist in the current list of values
    values.push(this._cloneFunc(v));
    return true;
  }

  delete(v: V): boolean {
    const key = this._hashFunc(v);
    const map = this._map;
    const values = map.get(key);

    // Nothing to do if entry doesn't exist
    if (values === undefined) {
      return false;
    }

    // Search for an equal value
    const eq = this._equalFunc;
    const len = values.length;
    for (let i = 0; i < len; ++i) {
      if (eq(values[i], v)) {
        if (values.length === 1) {
          map.delete(key);
        } else {
          values.splice(i, 1);
        }
        return true;
      }
    }

    // No match found
    return false;
  }

  clear(): void {
    this._map.clear();
  }

  get(v: V): V | undefined {
    const key = this._hashFunc(v);
    const map = this._map;
    const values = map.get(key);

    // Entry doesn't exist
    if (values === undefined) {
      return undefined;
    }

    // Entry exists. Search for a matching value.
    const eq = this._equalFunc;
    for (const candidate of values) {
      if (eq(candidate, v)) {
        return candidate;
      }
    }

    // No match found
    return undefined;
  }

  has(v: V): boolean {
    const key = this._hashFunc(v);
    const map = this._map;
    const values = map.get(key);

    // Entry doesn't exist
    if (values === undefined) {
      return false;
    }

    // Entry exists. Search for a matching value.
    const eq = this._equalFunc;
    for (const candidate of values) {
      if (eq(candidate, v)) {
        return true;
      }
    }

    // No match found
    return false;
  }

  *values(): Generator<V> {
    for (const arr of this._map.values()) {
      for (const v of arr) {
        // Guard against mutations during iteration
        if (this.has(v)) {
          yield v;
        }
      }
    }
  }

  [Symbol.iterator](): Iterator<V> {
    return this.values();
  }
}

interface MapEntry<K, V> {
  key: K;
  value?: V;
}

/**
 * A hash map implementation that allows user-provided hash and equality
 * functions. It's built on top the HashSet above and supports similar features.
 *
 * The API is consistent with Map so HashMap can be used as a drop-in
 * replacement.
 */
export class HashMap<K, V> implements Dictionary<K, V> {
  private _set: HashSet<MapEntry<K, V>>;

  constructor(
    hash: HashFunction<K>,
    eq: EqualFunction<K>,
    clone?: CloneFunction<K>,
  ) {
    let entryClone: CloneFunction<MapEntry<K, V>> | undefined;
    if (clone !== undefined) {
      entryClone = (entry) => {
        const result: MapEntry<K, V> = { key: clone(entry.key) };
        if (entry.value !== undefined) {
          result.value = entry.value;
        }
        return result;
      };
    }
    this._set = new HashSet(
      (entry) => hash(entry.key),
      (e1, e2) => eq(e1.key, e2.key),
      entryClone,
    );
  }

  get size(): number {
    return this._set.size;
  }

  get(key: K): V | undefined {
    return this._set.get({ key })?.value;
  }

  has(key: K): boolean {
    return this._set.has({ key });
  }

  *entries(): Generator<[K, V]> {
    for (const e of this._set) {
      yield [e.key, e.value!];
    }
  }

  *keys(): Generator<K> {
    for (const e of this._set) {
      yield e.key;
    }
  }

  *values(): Generator<V> {
    for (const e of this._set) {
      yield e.value!;
    }
  }

  [Symbol.iterator](): Iterator<[K, V]> {
    return this.entries();
  }

  set(key: K, value: V): void {
    let e = this._set.get({ key });
    if (e === undefined) {
      e = { key, value };
      this._set.add(e);
    } else {
      e.value = value;
    }
  }

  delete(key: K): boolean {
    return this._set.delete({ key });
  }

  clear(): void {
    this._set.clear();
  }
}
