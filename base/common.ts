import { ReadonlyJSONObject, ReadonlyJSONValue } from './interfaces.ts';

// export type ValueOf<T, K extends keyof T> = T[K];

export function cartesianProduct<T>(...allEntries: T[][]): T[][] {
  return allEntries.reduce<T[][]>(
    (results, entries) =>
      results
        .map((result) => entries.map((entry) => result.concat([entry])))
        .reduce((subResults, result) => subResults.concat(result), []),
    [[]],
  );
}

export function count<T = unknown>(iter: Iterable<T>): number {
  let count = 0;
  for (const _ of iter) {
    ++count;
  }
  return count;
}

export function uniqueId(length = 24): string {
  // Alphanumeric characters
  // const chars =
  //   'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  // We're using lowercase characters only to be URL friendly. At the time of
  // this writing (15/11/23), Deno enforces the entire URL to lowercase.
  // To compensate for the reduced space, we've increased the default length
  // from 20 to 24.
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let autoId = '';
  for (let i = 0; i < length; i++) {
    autoId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return autoId;
}

export function prettyJSON(o: ReadonlyJSONValue): string {
  if ((o as any).toJSON instanceof Function) {
    o = ((o as any).toJSON as () => ReadonlyJSONObject)();
  }
  return JSON.stringify(o, null, 2);
}

export function* keysOf<T extends Record<string, unknown>>(
  obj: T,
): Generator<string> {
  for (const k in obj) {
    // deno-lint-ignore no-prototype-builtins
    if (obj.hasOwnProperty(k)) {
      yield k;
    }
  }
}

export function allKeysOf<T extends Record<never, never>>(obj: T): (keyof T)[] {
  return Object.keys(obj) as (keyof T)[];
}

export function* unionIter<T>(...args: Iterable<T>[]): Iterable<T> {
  for (const iter of args) {
    for (const v of iter) {
      yield v;
    }
  }
}

export function newInstance<T = any>(instance: any, ...args: any[]): T {
  return new (instance.constructor as any)(...args) as T;
}

export function* mapIterable<IT, OT = IT>(
  input: Iterable<IT>,
  mapper: (v: IT, idx: number) => OT,
): Iterable<OT> {
  let i = 0;
  for (const v of input) {
    yield mapper(v, i);
    ++i;
  }
}

export function* filterIterable<IT>(
  input: Iterable<IT>,
  filter: (v: IT) => boolean,
): Iterable<IT> {
  for (const v of input) {
    if (filter(v)) {
      yield v;
    }
  }
}

export function runGC(): void {
  const gc = (self as any).gc;
  if (typeof gc === 'function') {
    gc();
  }
}

export function isBrowser(): boolean {
  return typeof self.Deno === 'undefined';
}
