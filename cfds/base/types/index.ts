import { DecodedValue } from '../../../base/core-types/encoding/index.ts';
import { Change, EncodedChange } from '../../change/index.ts';
import { MapTypeOperations } from './map-type.ts';
import { PrimitiveTypeOperations } from './primitive-type.ts';
import { SetTypeOperations } from './set-type.ts';
import { StringTypeOperations } from './string-type.ts';
import { RichText3TypeOperations } from './richtext3-type.ts';
import {
  CoreType,
  CoreValue,
  Encoder,
} from '../../../base/core-types/index.ts';
import { DateTypeOperations } from './date-type.ts';
import { ChecksumEncoderOpts } from '../../../base/core-types/encoding/checksum.ts';

export type ValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'set'
  | 'map'
  | 'richtext';

export interface ValueTypeOptions {
  local?: boolean;
  byCharacter?: boolean;
}

export interface SerializeValueTypeOptions extends ChecksumEncoderOpts {
  local?: boolean;
  flatRep?: boolean;
}

export interface IValueTypeOperations<T extends CoreValue = CoreValue> {
  get valueType(): ValueType;

  clone(value: T): T;

  equals(val1: T, val2: T, options?: ValueTypeOptions): boolean;

  validate(value: CoreValue): boolean;

  serialize(
    key: string,
    value: T,
    encoder: Encoder,
    options?: SerializeValueTypeOptions,
  ): void;

  deserialize(value: DecodedValue, options?: ValueTypeOptions): T;

  /**
   * value for data1 is undefined, value2 should be added by diff
   * @param value2
   * @param type
   * @param options
   */
  valueAddedDiff(
    value2: T,
    options?: ValueTypeOptions,
  ): undefined | Change<EncodedChange> | Change<EncodedChange>[];

  /**
   * value for data2 is undefined, value1 should be deleted by diff
   * @param value1
   * @param type
   * @param options
   */
  valueRemovedDiff(
    value1: T,
    options?: ValueTypeOptions,
  ): undefined | Change<EncodedChange> | Change<EncodedChange>[];

  valueChangedDiff(
    value1: T,
    value2: T,
    options?: ValueTypeOptions,
  ): undefined | Change<EncodedChange> | Change<EncodedChange>[];

  patch(
    curValue: T | undefined,
    changes: Change<EncodedChange>[],
    options?: ValueTypeOptions,
  ): T | undefined;

  fillRefs(refs: Set<string>, value: T): void;

  normalize(value: T): T;

  isEmpty(value: T): boolean;

  needGC(value: T): boolean;
  gc(value: T): T | undefined;

  rewriteRefs(
    keyMapping: Map<string, string>,
    value: T,
    deleteRefs?: Set<string>,
  ): T | undefined;
}

const registeredTypeOperations: Record<
  string,
  IValueTypeOperations<CoreValue>
> = {};

export function getTypeOperations<T extends CoreValue>(
  type: ValueType,
): IValueTypeOperations<T> {
  const op = registeredTypeOperations[type];
  if (op === undefined) {
    throw new Error(`type operations for: ${type} has not been implemented`);
  }
  return op as IValueTypeOperations<T>;
}

export function getTypeOperationsByValue<T extends CoreValue>(
  value: T,
): IValueTypeOperations<T> {
  for (const typeOP of Object.values(registeredTypeOperations)) {
    if (typeOP.validate(value)) {
      return typeOP as IValueTypeOperations<T>;
    }
  }

  throw new Error(`getTypeOperationsByValue failed for: ${value}`);
}

registerTypeOperations();
function registerType<T extends CoreValue>(op: IValueTypeOperations<T>): void {
  registeredTypeOperations[op.valueType] =
    op as IValueTypeOperations<CoreValue>;
}

function registerTypeOperations(): void {
  if (Object.entries(registeredTypeOperations).length === 0) {
    registerType(new StringTypeOperations(CoreType.String, 'string'));
    registerType(new PrimitiveTypeOperations(CoreType.Number, 'number'));
    registerType(new PrimitiveTypeOperations(CoreType.Boolean, 'boolean'));
    registerType(new DateTypeOperations());
    registerType(new SetTypeOperations(false, 'set'));
    // registerType(new SetTypeOperations(false, 'stringset'));
    // registerType(new SetTypeOperations(false, 'refset'));
    registerType(new MapTypeOperations(false, 'map'));
    // registerType(new MapTypeOperations(false, 'refmap'));
    registerType(new RichText3TypeOperations());

    //Add Types Here
  }
}

export function valueTypeEquals<TValue>(
  type: ValueType,
  value1: TValue | undefined,
  value2: TValue | undefined,
  options?: ValueTypeOptions,
) {
  if (value1 === undefined && value2 !== undefined) {
    return false;
  }
  if (value1 !== undefined && value2 === undefined) {
    return false;
  }
  if (value1 === undefined && value2 === undefined) {
    return true;
  }
  const typeOP = getTypeOperations(type);
  return typeOP.equals(value1 as CoreValue, value2 as CoreValue, options);
}
