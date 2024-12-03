import {
  JSONObject,
  JSONValue,
  ReadonlyJSONObject,
  ReadonlyJSONValue,
} from '../../interfaces.ts';
import { isObject } from '../../comparisons.ts';
import { Dictionary } from '../../collections/dict.ts';
import { coreValueClone } from '../clone.ts';
import {
  CoreKey,
  CoreOptions,
  CoreType,
  CoreValue,
  Encoder,
  ReadonlyCoreArray,
  ReadonlyCoreObject,
} from '../base.ts';
import { getCoreType } from '../utils.ts';

class RefSet {
  private _firstSet?: Set<CoreValue>;
  private _secondSet?: Set<CoreValue>;

  get refValues(): Iterable<CoreValue> {
    return this._secondSet ? this._secondSet : [];
  }

  get hasMultiRef() {
    return this._secondSet !== undefined && this._secondSet.size > 0;
  }

  set(val: CoreValue) {
    if (this._firstSet === undefined) this._firstSet = new Set<CoreValue>();
    if (!this._firstSet.has(val)) {
      this._firstSet.add(val);
      return;
    }

    if (this._secondSet === undefined) this._secondSet = new Set<CoreValue>();
    this._secondSet.add(val);
  }
}

export abstract class BaseCyclicalEncoder<
  R extends JSONValue,
  T,
  OT extends CoreOptions = CoreOptions
> implements Encoder<string, CoreValue, T, OT>
{
  set(key: string, value: CoreValue, options?: OT): void {
    // TODO(ofri): Properly handle Encodable instances as values
    if (isObject(value)) {
      const refSet = new RefSet();
      this.fillRefs(refSet, value, options);
      if (refSet.hasMultiRef) {
        const refsMap = new Map<CoreValue, R>();

        let refId = this.initRefId;
        for (const ref of refSet.refValues) {
          refsMap.set(ref, refId);
          refId = this.nextRefId(refId);
        }

        const refData = coreValueClone(value, {
          objectOverride: (obj: any) => {
            const refId = refsMap.get(obj as CoreValue);
            if (refId !== undefined) {
              return [true, this.convertRef(refId, options) as any];
            }
            return [false, undefined];
          },
          objectFilterFields: options?.objectFilterFields,
          iterableFilter: options?.iterableFilter,
        });

        value = {
          __r: this.convertRefsMap(refsMap, options),
          __d: refData as CoreValue,
        };
      }
    }

    this.encoder.set(key, value, options);
  }

  private fillRefs(set: RefSet, value: CoreValue, options?: OT) {
    const type = getCoreType(value);
    switch (type) {
      case CoreType.Array:
      case CoreType.Set:
        for (const item of value as ReadonlyCoreArray) {
          const iterableFilter = options && options.iterableFilter;
          if (iterableFilter) {
            if (!iterableFilter(item)) continue;
          }
          this.fillRefs(set, item, options);
        }
        break;
      case CoreType.Dictionary:
        for (const [_, v] of value as Dictionary<CoreKey, CoreValue>) {
          this.fillRefs(set, v);
        }
        break;
      case CoreType.Object:
        if (!isEncodedRef(value as ReadonlyJSONValue)) {
          set.set(value);
          for (const [k, v] of Object.entries(value as ReadonlyCoreObject)) {
            this.fillRefs(set, v);
          }
        }
        break;
    }
  }

  abstract get encoder(): Encoder<string, CoreValue, T, OT>;
  abstract get initRefId(): R;
  abstract nextRefId(prev: R): R;
  abstract convertRef(refId: R, options?: OT): T;
  abstract convertRefsMap(map: Map<CoreValue, R>, options?: OT): CoreValue;

  getOutput(): T {
    return this.encoder.getOutput();
  }
  abstract newEncoder(): Encoder<string, CoreValue, T, OT>;
}

export interface EncodedRef extends ReadonlyJSONObject {
  readonly __rId: number;
}

export function isEncodedRef(v: CoreValue): v is EncodedRef {
  if (getCoreType(v) === CoreType.Object) {
    const obj = v as ReadonlyJSONObject;
    if (typeof obj.__rId === 'number') {
      return true;
    }
  }
  return false;
}

export interface EncodedRefObject extends ReadonlyJSONObject {
  readonly __r: JSONObject[];
  readonly __d: JSONObject;
}

export function isEncodedRefObject(
  v: ReadonlyJSONValue
): v is EncodedRefObject {
  if (getCoreType(v) === CoreType.Object) {
    const obj = v as ReadonlyJSONObject;
    if (
      getCoreType(obj.__r) === CoreType.Array &&
      getCoreType(obj.__d) === CoreType.Object
    ) {
      return true;
    }
  }
  return false;
}
