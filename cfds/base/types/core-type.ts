import { IValueTypeOperations, ValueType, ValueTypeOptions } from './index.ts';
import { DecodedValue } from '../../../base/core-types/encoding/index.ts';
import { Change, EncodedChange } from '../../change/index.ts';
import { FieldChange } from '../../change/field-change.ts';
import {
  ConcreteCoreValue,
  CoreType,
  coreValueClone,
  coreValueEquals,
  Encoder,
  getCoreTypeOrUndef,
} from '../../../base/core-types/index.ts';

export abstract class CoreTypeOperations<
  TValue extends ConcreteCoreValue = ConcreteCoreValue
> implements IValueTypeOperations<TValue>
{
  private _coreType: CoreType;
  private _valueType: ValueType;

  constructor(encType: CoreType, valueType: ValueType) {
    this._coreType = encType;
    this._valueType = valueType;
  }

  get valueType() {
    return this._valueType;
  }

  normalize(value: TValue): TValue {
    return value;
  }

  fillRefs(refs: Set<string>, value: TValue): void {}

  validate(value: any): boolean {
    return getCoreTypeOrUndef(value) === this._coreType;
  }

  equals(val1: TValue, val2: TValue, options?: ValueTypeOptions): boolean {
    return coreValueEquals(val1, val2);
  }

  clone(value: TValue) {
    return coreValueClone(value);
  }

  serialize(
    key: string,
    value: TValue,
    encoder: Encoder,
    options?: ValueTypeOptions
  ): void {
    encoder.set(key, value);
  }

  deserialize(value: DecodedValue, options?: ValueTypeOptions) {
    return value as TValue;
  }

  valueAddedDiff(
    value2: TValue,
    options?: ValueTypeOptions
  ): undefined | Change<EncodedChange> | Change<EncodedChange>[] {
    return FieldChange.insert(value2, this._valueType);
  }

  valueRemovedDiff(
    value1: TValue,
    options?: ValueTypeOptions
  ): undefined | Change<EncodedChange> | Change<EncodedChange>[] {
    return FieldChange.delete(value1, this._valueType);
  }

  needGC(value: TValue): boolean {
    return false;
  }

  gc(value: TValue): TValue | undefined {
    return undefined;
  }

  rewriteRefs(
    keyMapping: Map<string, string>,
    value: TValue,
    deleteRefs?: Set<string>
  ): TValue | undefined {
    if (deleteRefs && deleteRefs.has(value as string)) {
      return undefined;
    }
    return (keyMapping.get(value as string) as TValue) || value;
  }

  abstract valueChangedDiff(
    value1: TValue,
    value2: TValue,
    options?: ValueTypeOptions
  ): Change<EncodedChange> | Change<EncodedChange>[] | undefined;

  abstract patch(
    curValue: TValue | undefined,
    changes: Change<EncodedChange>[],
    options?: ValueTypeOptions
  ): TValue | undefined;

  abstract isEmpty(value: TValue): boolean;
}
