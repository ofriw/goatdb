import { isGenerator } from '../comparisons.ts';
import { notReached } from '../error.ts';
import { isDictionary } from '../collections/dict.ts';
import {
  Clonable,
  Comparable,
  CoreClassObject,
  CoreType,
  CoreValue,
  Encodable,
  Equatable,
  ReadonlyCoreObject,
} from './base.ts';

export function getCoreTypeOrUndef(value: any): CoreType | undefined {
  if (value === undefined) {
    return CoreType.Undefined;
  }

  if (value === null) {
    return CoreType.Null;
  }

  if (typeof value === 'string') {
    return CoreType.String;
  }

  if (typeof value === 'number') {
    return CoreType.Number;
  }

  if (typeof value === 'boolean') {
    return CoreType.Boolean;
  }

  if (value instanceof Date) {
    return CoreType.Date;
  }

  if (value instanceof Array) {
    return CoreType.Array;
  }

  if (value instanceof Set) {
    return CoreType.Set;
  }

  if (isDictionary(value)) {
    return CoreType.Dictionary;
  }

  if (isGenerator(value)) {
    return CoreType.Generator;
  }

  if (typeof value === 'object') {
    return Object.getPrototypeOf(value).constructor === Object
      ? CoreType.Object
      : CoreType.ClassObject;
  }
}

export function getCoreType(value: CoreValue): CoreType {
  const type = getCoreTypeOrUndef(value);
  return type !== undefined ? type : notReached('Unsupported value type');
}

export function isCoreClassObject(v: any): v is CoreClassObject {
  return isClonable(v) || isComparable(v) || isEquatable(v) || isEncodable(v);
}

export function isClonable(v: any): v is Clonable {
  return v !== undefined && typeof v.clone === 'function';
}

export function isComparable(v: any): v is Comparable {
  return v !== undefined && typeof v.compare === 'function';
}

export function isEquatable(v: any): v is Equatable {
  return v !== undefined && typeof v.isEqual === 'function';
}

export function isEncodable<T extends Encodable<any, any>>(v: any): v is T {
  if (v === undefined) {
    return false;
  }
  return v.serialize !== undefined;
}

export function isReadonlyCoreObject(v: any): v is ReadonlyCoreObject {
  return getCoreTypeOrUndef(v) === CoreType.Object;
}
