import { assert } from '../../base/error.ts';
import {
  DecodedValue,
  Decoder,
  ReadonlyDecodedArray,
  ReadonlyDecodedObject,
} from '../../base/core-types/encoding/index.ts';
import {
  Scheme,
  SchemeDataType,
  SchemeGetFieldDef,
  SchemeGetFields,
  SchemeGetRequiredFields,
} from './scheme.ts';
import {
  getTypeOperations,
  SerializeValueTypeOptions,
  valueTypeEquals,
  ValueTypeOptions,
} from './types/index.ts';
import { Change, EncodedChange } from '../change/index.ts';
import { decodeChange } from '../change/decode.ts';
import { CoreObject, CoreValue, Encoder } from '../../base/core-types/index.ts';
import { log } from '../../logging/log.ts';

export function isValidData<S extends Scheme = Scheme>(
  scheme: S,
  data: SchemeDataType<S>,
) {
  // Check missing required fields
  for (const field of SchemeGetRequiredFields(scheme)) {
    if (!Object.hasOwn(data, field)) {
      return [false, `Missing required field "${field}"`];
    }
  }
  // Make sure all fields have their correct types and sane values
  for (const key in data) {
    const def = SchemeGetFieldDef(scheme, key);
    if (!def) {
      return [false, `Unknown field ${key}`];
    }
    const typeOP = getTypeOperations(def.type);
    if (!typeOP.validate(data[key])) {
      return [false, `Invalid value for field "${key}". Expected ${def.type}`];
    }
  }
  return [true, ''];
}

export function serialize<S extends Scheme>(
  encoder: Encoder,
  scheme: Scheme,
  data: SchemeDataType<S>,
  options: SerializeValueTypeOptions = {},
  overrides: {
    [key: string]: (
      encoder: Encoder,
      key: string,
      value: CoreValue,
      options: SerializeValueTypeOptions,
    ) => void;
  } = {},
): void {
  if (!data) {
    return;
  }
  for (const key in data) {
    const def = SchemeGetFieldDef(scheme, key);
    assert(def !== undefined, `Unknown field ${key}`);
    const type = def.type;
    if (overrides[type]) {
      try {
        overrides[type](encoder, key, data[key], options);
        continue;
      } catch (e) {
        log({
          severity: 'INFO',
          error: 'SerializeError',
          trace: e.stack,
          message: e.message,
          key: key,
          valueType: type,
        });
      }
    }

    if (data[key] === undefined) {
      continue;
    }
    const typeOP = getTypeOperations(type);
    typeOP.serialize(key, data[key], encoder, options);
  }
}

export function deserialize<S extends Scheme>(
  decoder: Decoder,
  scheme: S,
  options: ValueTypeOptions = {},
  overrides: {
    [key: string]: (
      value: DecodedValue,
      options: ValueTypeOptions,
    ) => CoreValue;
  } = {},
): SchemeDataType<S> {
  const data: CoreObject = {};

  for (const [key, def] of SchemeGetFields(scheme)) {
    assert(def !== undefined, `Unknown field ${key}`);
    const type = def.type;

    const decValue = decoder.get(key);
    if (decValue === undefined) continue;

    if (overrides[type]) {
      try {
        const value = overrides[type](decValue, options);
        if (value !== undefined) {
          data[key] = value;
        }
        continue;
      } catch (e) {
        log({
          severity: 'INFO',
          error: 'SerializeError',
          trace: e.stack,
          message: e.message,
          key,
          valueType: type,
        });
      }
    }

    const typeOP = getTypeOperations(type);
    const value = typeOP.deserialize(decValue, options);
    if (value !== undefined) {
      data[key] = value;
    }
  }

  return data as SchemeDataType<S>;
}

export function equals<S extends Scheme>(
  scheme: S,
  data1: SchemeDataType<S>,
  data2: SchemeDataType<S>,
  options: ValueTypeOptions = {},
): boolean {
  if (!data1 && !data2) {
    return true;
  }
  if (!data1 && data2) {
    return false;
  }
  if (data1 && !data2) {
    return false;
  }

  for (const [key, def] of SchemeGetFields(scheme)) {
    if (!valueTypeEquals(def.type, data1[key], data2[key], options)) {
      return false;
    }
  }

  return true;
}

export function clone<S extends Scheme>(
  scheme: S,
  data: SchemeDataType<S>,
  onlyFields?: (keyof SchemeDataType<S>)[],
): SchemeDataType<S> {
  const result: CoreObject = {};
  for (const key of Object.keys(data)) {
    const def = SchemeGetFieldDef(scheme, key);
    if (!def) {
      continue;
    }
    const type = def.type;
    if (onlyFields && !onlyFields.includes(key)) {
      continue;
    }
    const value = data[key];
    if (value === undefined) {
      result[key] = value;
      continue;
    }
    const typeOP = getTypeOperations(type);
    result[key] = typeOP.clone(value);
  }
  return result as SchemeDataType<S>;
}

export function diff<S extends Scheme>(
  scheme: S,
  data1: SchemeDataType<S>,
  data2: SchemeDataType<S>,
  options: ValueTypeOptions = {},
): DataChanges {
  const changes: DataChanges = {};

  const addChanges = (
    field: string,
    fChanges: undefined | Change<EncodedChange> | Change<EncodedChange>[],
  ) => {
    if (fChanges === undefined) return;

    if (Array.isArray(fChanges)) {
      if (fChanges.length === 0) return;
    } else {
      fChanges = [fChanges];
    }
    for (const change of fChanges) {
      if (changes[field] === undefined) changes[field] = [];
      changes[field].push(change);
    }
  };

  for (const [key, def] of SchemeGetFields(scheme)) {
    if (!def) {
      continue;
    }

    const value1 = data1[key];
    const value2 = data2[key];

    if (value1 === undefined && value2 === undefined) continue;

    const typeOP = getTypeOperations(def.type);

    let fChanges: undefined | Change<EncodedChange> | Change<EncodedChange>[];
    if (value1 === undefined && value2 !== undefined) {
      //New Value
      fChanges = typeOP.valueAddedDiff(value2, options);
    } else if (value1 !== undefined && value2 === undefined) {
      //Value Removed
      fChanges = typeOP.valueRemovedDiff(value1, options);
    } else {
      //Value Changed
      fChanges = typeOP.valueChangedDiff(value1, value2, options);
    }

    addChanges(key, fChanges);
  }

  return changes;
}

export function patch<S extends Scheme>(
  scheme: S,
  data: SchemeDataType<S>,
  changes: DataChanges,
  options: ValueTypeOptions = {},
): SchemeDataType<S> {
  for (const field in changes) {
    const def = SchemeGetFieldDef(scheme, field);
    if (!def) {
      continue;
    }
    const type = def.type;
    const typeOP = getTypeOperations(type);
    const newValue = typeOP.patch(data[field], changes[field], options);

    if (newValue === undefined) {
      delete data[field];
    } else {
      (data as CoreObject)[field] = newValue;
    }
  }
  return data;
}

export function normalize<S extends Scheme>(
  scheme: S,
  data: SchemeDataType<S>,
): void {
  for (const [key, def] of SchemeGetFields(scheme)) {
    let value: CoreValue = data[key];

    const typeOP = getTypeOperations(def.type);

    if (value !== undefined && typeOP.isEmpty(value)) {
      value = undefined;
    }

    if (value === undefined && def.default) {
      value = def.default(data);
    }
    if (value !== undefined) {
      (data as CoreObject)[key] = typeOP.normalize(value);
    } else {
      delete data[key];
    }
  }
}

export function diffKeys<S extends Scheme>(
  scheme: S,
  data1: SchemeDataType<S>,
  data2: SchemeDataType<S>,
  options: ValueTypeOptions = {},
): string[] {
  const result = new Set<string>();

  for (const key of Object.keys(data1)) {
    if (SchemeGetFieldDef(scheme, key) && !Object.hasOwn(data2, key)) {
      //Key not found in data2
      result.add(key);
    }
  }

  for (const key of Object.keys(data2)) {
    const def = SchemeGetFieldDef(scheme, key);
    if (!def) {
      continue;
    }
    if (!Object.hasOwn(data1, key)) {
      //Key not found in data1
      result.add(key);
      continue;
    }

    const typeOP = getTypeOperations(def.type);
    if (!typeOP.equals(data1[key], data2[key], options)) {
      //Key found in both, but is not equal
      result.add(key);
    }
  }
  return Array.from(result);
}

export interface DataChanges extends CoreObject {
  [key: string]: Change<EncodedChange>[];
}

export interface DecodedDataChange extends ReadonlyDecodedObject {
  [key: string]: Decoder[];
}

export function decodedDataChanges(dec: DecodedDataChange): DataChanges {
  const changes: DataChanges = {};

  for (const key in dec) {
    changes[key] = (dec[key] as ReadonlyDecodedArray).map((v) =>
      decodeChange(v as Decoder),
    );
  }

  return changes;
}

export function concatChanges(
  changes1: DataChanges,
  changes2: DataChanges,
): DataChanges {
  const changes: DataChanges = {};

  const addChanges = (fromChanges: DataChanges) => {
    for (const key in fromChanges) {
      if (changes[key] === undefined) {
        changes[key] = [];
      }
      changes[key].push(...fromChanges[key]);
    }
  };

  addChanges(changes1);
  addChanges(changes2);

  return changes;
}

export function anyChanges(changes: DataChanges): boolean {
  for (const key in changes) {
    if (changes[key] !== undefined && changes[key].length > 0) {
      return true;
    }
  }
  return false;
}
