import { isGenerator, isObject } from '../../comparisons.ts';
import {
  JSONArray,
  JSONObject,
  JSONValue,
  ReadonlyJSONArray,
  ReadonlyJSONObject,
  ReadonlyJSONValue,
} from '../../interfaces.ts';
import { serializeDate } from '../../date.ts';
import {
  Dictionary,
  dictToPrimitive,
  isDictionary,
} from '../../collections/dict.ts';
import {
  CoreKey,
  CoreOptions,
  CoreType,
  CoreValue,
  Encodable,
  Encoder,
  IterableFilterFunc,
  ObjFieldsFilterFunc,
  ReadonlyCoreArray,
  ReadonlyCoreObject,
} from '../base.ts';
import { getCoreType, isEncodable } from '../utils.ts';

export abstract class BaseEncoder<
  PT extends CoreValue,
  T extends PT,
  OT extends CoreOptions,
> implements Encoder<string, CoreValue, T, OT>
{
  readonly objectFilterFields: ObjFieldsFilterFunc;
  readonly iterableFilter?: IterableFilterFunc;

  constructor(opts?: OT) {
    this.objectFilterFields = opts?.objectFilterFields || (() => true);
    this.iterableFilter = opts?.iterableFilter;
  }

  abstract getOutput(): T;
  abstract newEncoder(): BaseEncoder<PT, T, OT>;

  protected abstract setPrimitive(key: string, value: PT, options?: OT): void;

  set(key: CoreKey, value: CoreValue, options?: OT): void {
    if (value === undefined) {
      return;
    }

    this.setPrimitive(
      this.convertKey(key),
      this.convertValue(value, options),
      options,
    );
  }

  protected abstract isNativeValue(value: CoreValue, options?: OT): value is PT;

  protected convertKey(key: CoreKey): string {
    return typeof key === 'string' ? key : String(key);
  }

  convertValue(value: CoreValue, options?: OT): PT {
    if (this.isNativeValue(value, options)) {
      return value as PT;
    }

    const type = getCoreType(value);

    switch (type) {
      case CoreType.String:
        return this.convertString(value as string, options);

      case CoreType.Number:
        return this.convertNumber(value as number, options);

      case CoreType.Boolean:
        return this.convertBoolean(value as boolean, options);

      case CoreType.Null:
        return this.convertNull(options);

      case CoreType.Undefined:
        return this.convertUndefined(options);

      case CoreType.Date:
        return this.convertDate(value as Date, options);

      case CoreType.Array:
        return this.convertArray(value as ReadonlyCoreArray, options);

      case CoreType.Set:
        return this.convertSet(value as Set<CoreValue>, options);

      case CoreType.Object:
        return this.convertObject(value as ReadonlyCoreObject, options);

      case CoreType.ClassObject:
        if (isEncodable(value)) {
          return this.convertEncodable(
            value as Encodable<CoreKey, CoreValue>,
            options,
          );
        }
        throw new Error(`${value?.constructor.name} must implement Encodable`);

      case CoreType.Dictionary:
        return this.convertDictionary(
          value as Dictionary<CoreKey, CoreValue>,
          options,
        );

      case CoreType.Generator:
        return this.convertGenerator(value as Generator<CoreValue>, options);
    }
  }

  protected abstract convertString(str: string, options?: OT): PT;
  protected abstract convertNumber(n: number, options?: OT): PT;
  protected abstract convertBoolean(b: boolean, options?: OT): PT;
  protected abstract convertNull(options?: OT): PT;
  protected abstract convertUndefined(options?: OT): PT;
  protected abstract convertDate(date: Date, options?: OT): PT;
  protected abstract convertArray(arr: ReadonlyCoreArray, options?: OT): PT;
  protected abstract convertSet(set: Set<CoreValue>, options?: OT): PT;
  protected abstract convertObject(obj: ReadonlyCoreObject, options?: OT): PT;
  protected abstract convertEncodable(
    value: Encodable<string, CoreValue>,
    options?: OT,
  ): PT;
  protected abstract convertDictionary(
    value: Dictionary<CoreKey, CoreValue>,
    options?: OT,
  ): PT;

  protected abstract convertGenerator(
    g: Generator<CoreValue>,
    options?: OT,
  ): PT;
}

export interface EncodedSet extends ReadonlyJSONObject {
  readonly __t: 'S';
  readonly __v: ReadonlyJSONArray;
}

export interface EncodedDate extends ReadonlyJSONObject {
  readonly __t: 'D';
  readonly __v: number;
}

export interface EncodedEncodable extends ReadonlyJSONObject {
  readonly __t: 'E';
  readonly __v: ReadonlyJSONValue;
}

export type EncodedJSONValue = EncodedSet | EncodedDate | EncodedEncodable;

export function isEncodedSet(v: ReadonlyJSONValue): v is EncodedSet {
  if (getCoreType(v) === CoreType.Object) {
    const obj = v as ReadonlyJSONObject;
    if (obj.__t === 'S' && obj.__v instanceof Array) {
      return true;
    }
  }
  return false;
}

export function isEncodedDate(v: ReadonlyJSONValue): v is EncodedDate {
  if (getCoreType(v) === CoreType.Object) {
    const obj = v as ReadonlyJSONObject;
    if (obj.__t === 'D' && typeof obj.__v === 'number') {
      return true;
    }
  }
  return false;
}

export function isEncodedEncodable(
  v: ReadonlyJSONValue,
): v is EncodedEncodable {
  if (getCoreType(v) === CoreType.Object) {
    const obj = v as ReadonlyJSONObject;
    if (obj.__t === 'E' && getCoreType(obj.__v) === CoreType.Object) {
      return true;
    }
  }
  return false;
}

export abstract class JSONBaseEncoder<
  T extends ReadonlyJSONValue,
  OT extends CoreOptions = CoreOptions,
> extends BaseEncoder<ReadonlyJSONValue, T, OT> {
  abstract getOutput(): T;
  abstract newEncoder(): JSONBaseEncoder<T, OT>;

  protected abstract setPrimitive(
    key: string,
    value: ReadonlyJSONValue,
    options?: OT,
  ): void;

  set(key: string, value: CoreValue, options?: OT): void {
    if (value === undefined) {
      return;
    }
    this.setPrimitive(
      key,
      this.isNativeValue(value, options)
        ? value
        : this.convertValue(value, options),
      options,
    );
  }

  protected isNativeValue(
    value: CoreValue,
    options?: OT,
  ): value is ReadonlyJSONValue {
    if (value === undefined || value === null) {
      return true;
    }

    const iterableFilter = options?.iterableFilter || this.iterableFilter;
    if (isEncodable<Encodable<string, CoreValue>>(value)) {
      // Encodable
      return false;
    } else if (value instanceof Array) {
      // Array
      for (const v of value) {
        if (iterableFilter) {
          if (!iterableFilter(v)) return false;
        }
        if (!this.isNativeValue(v, options)) {
          return false;
        }
      }
    } else if (value instanceof Set) {
      // Set
      return false;
    } else if (value instanceof Date) {
      // Date
      return false;
    } else if (isDictionary(value)) {
      return false;
    } else if (isObject(value)) {
      // Object
      const obj: ReadonlyCoreObject = value as ReadonlyCoreObject;

      const keyFilter = options?.objectFilterFields || this.objectFilterFields;
      for (const k in obj) {
        if (obj.hasOwnProperty(k)) {
          if (keyFilter && !keyFilter(k, obj)) {
            return false;
          }
          if (!this.isNativeValue(obj[k], options)) {
            return false;
          }
        }
      }
    } else if (isGenerator(value)) {
      return false;
    }
    // Everything else
    return true;
  }

  protected convertEncodable(
    value: Encodable<string, CoreValue>,
    options?: OT,
  ): EncodedEncodable {
    const encoder = this.newEncoder();
    value.serialize(encoder, options);
    return {
      __t: 'E',
      __v: encoder.getOutput(),
    };
  }

  private convertIterableWithFilter(
    iterable: Iterable<CoreValue>,
    iterableFilter: IterableFilterFunc,
    options?: OT,
  ) {
    const result: JSONValue[] = [];
    for (const item of iterable) {
      if (iterableFilter(item)) {
        result.push(this.convertValue(item, options));
      }
    }
    return result;
  }

  protected convertArray(
    arr: ReadonlyCoreArray,
    options?: OT,
  ): ReadonlyJSONValue {
    if (arr.length === 0) {
      return [];
    }
    const iterableFilter = options?.iterableFilter || this.iterableFilter;
    if (iterableFilter) {
      return this.convertIterableWithFilter(arr, iterableFilter, options);
    }

    const result = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      result[i] = this.convertValue(arr[i], options);
    }
    return result;
  }

  // Default implementation returns EncodedSet
  protected convertSet(set: Set<CoreValue>, options?: OT): EncodedSet {
    const iterableFilter = options?.iterableFilter || this.iterableFilter;
    if (iterableFilter) {
      const arr = this.convertIterableWithFilter(set, iterableFilter, options);

      return {
        __t: 'S',
        __v: arr as ReadonlyJSONArray,
      };
    }

    const arr: JSONArray = new Array(set.size);
    let i = 0;

    for (const v of set) {
      arr[i] = this.convertValue(v, options);
      i++;
    }
    return {
      __t: 'S',
      __v: arr as ReadonlyJSONArray,
    };
  }

  protected convertObject(
    obj: ReadonlyCoreObject,
    options?: OT,
  ): ReadonlyJSONObject {
    const result: JSONObject = {};
    const keyFilter = options?.objectFilterFields || this.objectFilterFields;
    for (const [k, v] of Object.entries(obj)) {
      if (keyFilter(k, obj)) {
        result[k] = this.convertValue(v, options);
      }
    }
    return result;
  }

  protected convertNumber(n: number, _options?: OT): ReadonlyJSONValue {
    return n;
  }

  protected convertString(str: string, _options?: OT): ReadonlyJSONValue {
    return str;
  }

  protected convertBoolean(b: boolean, _options?: OT): ReadonlyJSONValue {
    return b;
  }

  protected convertNull(_options?: OT): ReadonlyJSONValue {
    return null;
  }

  protected convertUndefined(_options?: OT): ReadonlyJSONValue {
    return null;
  }

  protected convertDate(date: Date, _options?: OT): EncodedDate {
    return {
      __t: 'D',
      __v: serializeDate(date),
    };
  }

  protected convertDictionary(
    value: Dictionary<CoreKey, CoreValue>,
    _options?: OT,
  ) {
    return dictToPrimitive(value);
  }

  protected convertGenerator(g: Generator<CoreValue>, options?: OT) {
    const iterableFilter = options?.iterableFilter || this.iterableFilter;
    if (iterableFilter) {
      return this.convertIterableWithFilter(g, iterableFilter, options);
    }

    const arr: JSONArray = [];
    for (const v of g) {
      arr.push(this.convertValue(v, options));
    }
    return arr;
  }
}
