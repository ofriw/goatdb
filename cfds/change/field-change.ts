import { assert } from '../../base/error.ts';
import { JSONValue } from '../../base/interfaces.ts';
import {
  getTypeOperations,
  ValueType,
  valueTypeEquals,
} from '../base/types/index.ts';
import {
  ConstructorDecoderConfig,
  isDecoderConfig,
} from '../../base/core-types/encoding/index.ts';
import {
  Change,
  ChangeType,
  ChangeValueConfig,
  EncodedChange,
} from './index.ts';
import {
  CoreValue,
  coreValueClone,
  Encoder,
} from '../../base/core-types/index.ts';

export enum FieldOperation {
  Insert = 1,
  Delete = -1,
}

interface EncodedFieldChange extends EncodedChange {
  operation: FieldOperation;
  value: JSONValue;
  vType: ValueType;
}

export interface FieldChangeConfig<TValue extends CoreValue>
  extends ChangeValueConfig {
  operation: FieldOperation;
  value: TValue;
  valueType: ValueType;
}

export class FieldChange<
  TValue extends CoreValue
> extends Change<EncodedFieldChange> {
  readonly operation: FieldOperation;
  readonly value: TValue;
  readonly valueType: ValueType;

  constructor(
    config:
      | FieldChangeConfig<TValue>
      | ConstructorDecoderConfig<EncodedFieldChange>
  ) {
    super(config);

    if (isDecoderConfig(config)) {
      const decoder = config.decoder;

      this.operation = decoder.get<number>('operation')!;

      this.valueType = decoder.get('vType')! as ValueType;
      const typeOP = getTypeOperations(this.valueType);
      this.value = typeOP.deserialize(decoder.get('value'));
    } else {
      this.operation = config.operation;
      this.valueType = coreValueClone(config.valueType);

      const typeOP = getTypeOperations(this.valueType);
      assert(
        typeOP.validate(config.value),
        `Invalid Field value for type: ${this.valueType}`
      );
      this.value = config.value;
    }
  }

  clone<T extends Change<EncodedFieldChange>>(): T {
    return new FieldChange<TValue>({
      operation: this.operation,
      value: this.value,
      valueType: this.valueType,
    }) as unknown as T;
  }

  getType(): ChangeType {
    return 'fd';
  }

  isEqual(other: FieldChange<TValue>): boolean {
    if (this.constructor !== other.constructor) {
      return false;
    }
    if (this.operation !== other.operation) {
      return false;
    }
    if (this.valueType !== other.valueType) {
      return false;
    }
    return valueTypeEquals(this.valueType, this.value, other.value);
  }

  serialize(
    encoder: Encoder<keyof EncodedFieldChange, CoreValue>,
    _options?: unknown
  ): void {
    super.serialize(encoder, _options);

    encoder.set('operation', this.operation);
    encoder.set('vType', this.valueType);

    const typeOP = getTypeOperations(this.valueType);
    typeOP.serialize('value', this.value, encoder);
  }

  static insert<TValue extends CoreValue>(value: TValue, valueType: ValueType) {
    return new FieldChange<TValue>({
      operation: FieldOperation.Insert,
      value,
      valueType,
    });
  }

  static delete<TValue extends CoreValue>(value: TValue, valueType: ValueType) {
    return new FieldChange<TValue>({
      operation: FieldOperation.Delete,
      value,
      valueType,
    });
  }
}
