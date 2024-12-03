import { notReached } from '../error.ts';
import { Dictionary } from '../collections/dict.ts';
import {
  CoreKey,
  CoreObject,
  CoreType,
  CoreValue,
  CoreValueCloneOpts,
  ReadonlyCoreArray,
} from './base.ts';
import { getCoreType, isClonable } from './utils.ts';

export function coreValueClone<T extends CoreValue>(
  e: T,
  opts?: CoreValueCloneOpts
): T {
  return internalCoreValueClone(e, undefined, opts);
}

export function coreObjectClone<T extends Object>(
  obj: T,
  opts?: CoreValueCloneOpts
) {
  return internalCoreValueClone(obj as any, undefined, opts);
}

function internalCoreValueClone<T extends CoreValue>(
  e: T,
  objectsCache: Map<CoreObject, CoreObject> | undefined,
  opts?: CoreValueCloneOpts
): T {
  switch (getCoreType(e)) {
    case CoreType.String:
    case CoreType.Number:
    case CoreType.Boolean:
    case CoreType.Null:
    case CoreType.Undefined:
      return e;

    case CoreType.Date:
      return new Date((e as Date).getTime()) as T;

    case CoreType.Array: {
      let arr = e as ReadonlyCoreArray;
      if (opts !== undefined && opts.iterableFilter !== undefined) {
        arr = arr.filter(opts.iterableFilter);
      }
      return arr.map((v) => internalCoreValueClone(v, objectsCache, opts)) as T;
    }

    case CoreType.Set: {
      const set = e as Set<CoreValue>;
      const result = new Set<CoreValue>();
      for (const v of set) {
        if (opts !== undefined && opts.iterableFilter !== undefined) {
          if (!opts.iterableFilter(v)) continue;
        }
        result.add(internalCoreValueClone(v, objectsCache, opts));
      }
      return result as T;
    }

    case CoreType.Object: {
      if (objectsCache === undefined)
        objectsCache = new Map<CoreObject, CoreObject>();
      const obj = e as { [key: string]: CoreValue };
      const cached = objectsCache.get(obj);
      if (cached !== undefined) return cached as T;

      if (opts && opts.objectOverride) {
        const [result, newObj] = opts.objectOverride(obj);
        if (result) {
          objectsCache.set(obj, newObj as CoreObject);
          return newObj as T;
        }
      }

      const result: { [key: string]: CoreValue } = {};
      for (const k in obj) {
        if (
          obj.hasOwnProperty(k) &&
          (opts === undefined ||
            opts.objectFilterFields === undefined ||
            opts.objectFilterFields(k, obj))
        ) {
          if (opts !== undefined && opts.fieldCloneOverride !== undefined) {
            result[k] = opts.fieldCloneOverride(obj, k, opts);
          } else {
            result[k] = internalCoreValueClone(obj[k], objectsCache, opts);
          }
        }
      }

      objectsCache.set(obj, result);

      return result as T;
    }

    case CoreType.Dictionary: {
      const newMap = new Map<CoreKey, CoreValue>();
      for (const [k, v] of e as Dictionary<CoreKey, CoreValue>) {
        if (opts !== undefined && opts.fieldCloneOverride !== undefined) {
          newMap.set(k, opts.fieldCloneOverride(e as Dictionary, k, opts));
        } else {
          newMap.set(k, internalCoreValueClone(v, objectsCache, opts));
        }
      }
      return newMap as unknown as T;
    }

    case CoreType.Generator: {
      const arr: CoreValue[] = [];
      for (const item of e as Generator<CoreValue>) {
        if (opts !== undefined && opts.iterableFilter !== undefined) {
          if (opts.iterableFilter(item)) {
            arr.push(internalCoreValueClone(item, objectsCache, opts));
          }
        } else {
          arr.push(internalCoreValueClone(item, objectsCache, opts));
        }
      }

      return arr as T;
    }

    case CoreType.ClassObject:
      if (isClonable(e)) {
        return e.clone(opts) as T;
      }
      if (opts && opts.notClonableExt) {
        const fRes = opts.notClonableExt(e as Object);
        if (fRes !== undefined) return fRes as T;
      }
      throw new Error(`${e?.constructor.name} must be Clonable`);

    default:
      notReached('clone failed');
  }
}
