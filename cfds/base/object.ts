import { assert } from '../../base/error.ts';
import {
  DecodedValue,
  Decoder,
  ReadonlyDecodedArray,
  ReadonlyDecodedObject,
} from '../../base/core-types/encoding/index.ts';
import {
  Schema,
  SchemaDataType,
  SchemaGetFieldDef,
  SchemaGetFields,
  SchemaGetRequiredFields,
} from './schema.ts';
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

export function isValidData<S extends Schema = Schema>(
  scheme: S,
  data: SchemaDataType<S>,
) {
  // Check missing required fields
  for (const field of SchemaGetRequiredFields(scheme)) {
    if (!Object.hasOwn(data, field)) {
      return [false, `Missing required field "${field}"`];
    }
  }
  // Make sure all fields have their correct types and sane values
  for (const key in data) {
    const def = SchemaGetFieldDef(scheme, key);
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

export function serialize<S extends Schema>(
  encoder: Encoder,
  scheme: Schema,
  data: SchemaDataType<S>,
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
    const def = SchemaGetFieldDef(scheme, key);
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

export function deserialize<S extends Schema>(
  decoder: Decoder,
  scheme: S,
  options: ValueTypeOptions = {},
  overrides: {
    [key: string]: (
      value: DecodedValue,
      options: ValueTypeOptions,
    ) => CoreValue;
  } = {},
): SchemaDataType<S> {
  const data: CoreObject = {};

  for (const [key, def] of SchemaGetFields(scheme)) {
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

  return data as SchemaDataType<S>;
}

export function equals<S extends Schema>(
  scheme: S,
  data1: SchemaDataType<S>,
  data2: SchemaDataType<S>,
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

  for (const [key, def] of SchemaGetFields(scheme)) {
    if (!valueTypeEquals(def.type, data1[key], data2[key], options)) {
      return false;
    }
  }

  return true;
}

export function clone<S extends Schema>(
  scheme: S,
  data: SchemaDataType<S>,
  onlyFields?: (keyof SchemaDataType<S>)[],
): SchemaDataType<S> {
  const result: CoreObject = {};
  for (const key of Object.keys(data)) {
    const def = SchemaGetFieldDef(scheme, key);
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
  return result as SchemaDataType<S>;
}

export function diff<S extends Schema>(
  scheme: S,
  data1: SchemaDataType<S>,
  data2: SchemaDataType<S>,
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

  for (const [key, def] of SchemaGetFields(scheme)) {
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

export function patch<S extends Schema>(
  scheme: S,
  data: SchemaDataType<S>,
  changes: DataChanges,
  options: ValueTypeOptions = {},
): SchemaDataType<S> {
  for (const field in changes) {
    const def = SchemaGetFieldDef(scheme, field);
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

export function normalize<S extends Schema>(
  scheme: S,
  data: SchemaDataType<S>,
): void {
  for (const [key, def] of SchemaGetFields(scheme)) {
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

export function diffKeys<S extends Schema>(
  scheme: S,
  data1: SchemaDataType<S>,
  data2: SchemaDataType<S>,
  options: ValueTypeOptions = {},
): string[] {
  const result = new Set<string>();

  for (const key of Object.keys(data1)) {
    if (SchemaGetFieldDef(scheme, key) && !Object.hasOwn(data2, key)) {
      //Key not found in data2
      result.add(key);
    }
  }

  for (const key of Object.keys(data2)) {
    const def = SchemaGetFieldDef(scheme, key);
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
