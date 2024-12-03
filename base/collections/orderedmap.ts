import { Dictionary } from './dict.ts';
import { assert } from '../error.ts';

export class MutationError extends Error {
  constructor() {
    super('OrderedMap mutated during iteration');
  }
}

class OrderedMapState<K, V> {
  public _map: Dictionary<K, Link<K, V>>;
  public _head: Link<K, V>;
  public _tail: Link<K, V>;
  public _mutationsCount: number;

  constructor(dictInst?: Dictionary) {
    this._map = dictInst || new Map();
    this._head = new Link();
    this._tail = new Link();
    this._head.next = this._tail;
    this._tail.prev = this._head;
    this._mutationsCount = 0;
  }
}

/**
 * A hash table glued with a doubly linked list. Used to build caches, etc.
 * See storage.js for usage. Unless otherwise noted, all ops are O(1).
 */
export class OrderedMap<K = any, V = any> implements Dictionary<K, V> {
  private _state: OrderedMapState<K, V>;

  constructor(dictInst?: Dictionary) {
    if (dictInst !== undefined) {
      dictInst.clear();
    }
    this._state = new OrderedMapState(dictInst);
  }

  get size(): number {
    return this._state._map.size;
  }

  get startKey(): K | undefined {
    return this._state._head.next?.key;
  }

  get endKey(): K | undefined {
    return this._state._tail.prev?.key;
  }

  /**
   * Add a key with no value (undefined value), if the key doesn't already
   * exist. If it does exist, this method does nothing. New keys are added
   * at the end.
   */
  add(key: K): void {
    this._addImpl(key);
  }

  /**
   * Set the value for a given key, adding it if needed.
   * New keys are added at the end.
   */
  set(key: K, value: V): void {
    this._addImpl(key).value = value;
  }

  _addImpl(key: K): Link<K, V> {
    let link = this._state._map.get(key);
    if (link !== undefined) {
      return link;
    }
    link = new Link();
    link.key = key;
    this._state._tail.insertBefore(link);
    this._state._map.set(key, link);
    ++this._state._mutationsCount;
    assert(this._state._head.length === this._state._map.size + 2);
    return link;
  }

  /**
   * Move a key to the end of the list. Does nothing if the key doesn't exist.
   */
  moveToEnd(key: K): void {
    const link = this._state._map.get(key);
    if (!link) {
      return;
    }
    this._state._tail.insertBefore(link);
    ++this._state._mutationsCount;
    assert(this._state._head.length === this._state._map.size + 2);
  }

  /**
   * Move a key to the start of the list. Does nothing if the key doesn't exist.
   */
  moveToStart(key: K): void {
    const link = this._state._map.get(key);
    if (!link) {
      return;
    }
    this._state._head.insertAfter(link);
    ++this._state._mutationsCount;
    assert(this._state._head.length === this._state._map.size + 2);
  }

  next(key: K): K | undefined {
    const link = this._state._map.get(key);
    if (link === undefined) {
      return undefined;
    }
    if (link.next !== this._state._tail) {
      return link.next!.key;
    }
    return undefined;
  }

  prev(key: K): K | undefined {
    const link = this._state._map.get(key);
    if (link === undefined) {
      return undefined;
    }
    if (link.prev !== this._state._head) {
      return link.prev!.key;
    }
    return undefined;
  }

  /**
   * Returns whether the given key exists in the collection. Note that a key
   * may exist with an undefined value. Use this method rather than get() to
   * distinguish the two cases.
   */
  has(key: K): boolean {
    return this._state._map.has(key);
  }

  /**
   * Removes the given key and its associated value from the collection.
   * Does nothing if the key doesn't exist.
   */
  delete(key: K): boolean {
    const link = this._state._map.get(key);
    if (!link) {
      return false;
    }
    link.detach();
    this._state._map.delete(key);
    ++this._state._mutationsCount;
    assert(this._state._head.length === this._state._map.size + 2);
    return true;
  }

  /**
   * Returns the value for the given key or undefined if the key doesn't exist.
   */
  get(key: K): V | undefined {
    const link = this._state._map.get(key);
    return link?.value;
  }

  clear(): void {
    this._state._map.clear();
    this._state._head.next = this._state._tail;
    this._state._tail.prev = this._state._head;
  }

  /**
   * Returns an iterator over the keys in the collection. Keys are returned
   * by their internal order.
   * Any attempt to mutate the collection during iteration will cause the
   * iterator to throw a MutationError.
   */
  keysIter(): Iterable<K> {
    return this.keys();
  }

  keys(): Iterable<K> {
    return new OrderedMapIter<K, V>(this._state, true, false) as Iterable<K>;
  }

  values(): Iterable<V> {
    return new OrderedMapIter<K, V>(this._state, false, true) as Iterable<V>;
  }

  /**
   * Returns an iterator over the keys and values in the collection.
   * Entries are returned by their internal order.
   * Any attempt to mutate the collection during iteration will cause the
   * iterator to throw a MutationError.
   */
  entries(): Iterable<[K, V]> {
    return new OrderedMapIter(this._state, true, true) as Iterable<[K, V]>;
  }

  [Symbol.iterator](): Iterator<[K, V]> {
    return new OrderedMapIter(this._state, true, true) as Iterator<[K, V]>;
  }
}

/**
 * A crude doubly linked list. Enjoy.
 */
class Link<K, V> {
  public next: Link<K, V> | undefined;
  public prev: Link<K, V> | undefined;
  public key: K | undefined;
  public value: V | undefined;

  detach() {
    this._validateLinks();
    if (this.next) {
      this.next.prev = this.prev;
    }
    if (this.prev) {
      this.prev.next = this.next;
    }
    this.next = undefined;
    this.prev = undefined;
  }

  _validateLinks() {
    if (this.next) {
      assert(this.next.prev === this);
    }
    if (this.prev) {
      assert(this.prev.next === this);
    }
  }

  insertAfter(next: Link<K, V>): void {
    assert(next !== this);
    next.detach();
    next.prev = this;
    next.next = this.next;
    if (this.next !== undefined) {
      this.next.prev = next;
    }
    this.next = next;
    this._validateLinks();
    next._validateLinks();
    next.prev._validateLinks();
  }

  insertBefore(prev: Link<K, V>): void {
    assert(prev !== this);
    prev.detach();
    prev.next = this;
    prev.prev = this.prev;
    if (this.prev !== undefined) {
      this.prev.next = prev;
    }
    this.prev = prev;
    this._validateLinks();
    prev._validateLinks();
    prev.next._validateLinks();
  }

  get length() {
    let count = 1;
    for (let node: Link<K, V> = this; node.next; node = node.next) {
      ++count;
    }
    return count;
  }
}

class OrderedMapIter<K, V> {
  private readonly _state: OrderedMapState<K, V>;
  private readonly _mutationsCount: number;
  private readonly _includeKeys: boolean;
  private readonly _includeValues: boolean;
  private _nextLink: Link<K, V>;

  constructor(
    state: OrderedMapState<K, V>,
    includeKeys: boolean,
    includeValues: boolean
  ) {
    this._state = state;
    this._mutationsCount = state._mutationsCount;
    this._nextLink = state._head;
    this._includeKeys = includeKeys;
    this._includeValues = includeValues;
  }

  next(): {
    done: boolean;
    value?: K | V | [K | undefined, V | undefined] | undefined;
  } {
    if (this._state._mutationsCount !== this._mutationsCount) {
      throw new MutationError();
    }
    const probablyLink = this._nextLink.next;
    assert(probablyLink !== undefined);
    const link = probablyLink!;
    this._nextLink = link;
    if (link === this._state._tail) {
      return { done: true };
    }
    let v: K | V | [K | undefined, V | undefined] | undefined;
    const linkValue = this._state._map.get(link.key!)?.value;
    if (this._includeKeys) {
      v = this._includeValues ? [link.key!, linkValue] : link.key!;
    } else {
      v = linkValue;
    }
    return {
      done: false,
      value: v,
    };
  }

  [Symbol.iterator]() {
    return this;
  }
}
