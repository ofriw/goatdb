import { valueTypeEquals, ValueTypeOptions } from './index.ts';
import { CoreTypeOperations } from './core-type.ts';
import { Change, EncodedChange } from '../../change/index.ts';
import { FieldChange, FieldOperation } from '../../change/field-change.ts';
import { ConcreteCoreValue } from '../../../base/core-types/index.ts';

export class PrimitiveTypeOperations<
  TValue extends ConcreteCoreValue
> extends CoreTypeOperations<TValue> {
  patch(
    curValue: TValue | undefined,
    changes: Change<EncodedChange>[],
    options?: ValueTypeOptions
  ): TValue | undefined {
    for (const change of changes) {
      if (change instanceof FieldChange) {
        if (change.operation === FieldOperation.Insert) {
          curValue = change.value;
        } else if (change.operation === FieldOperation.Delete) {
          curValue = valueTypeEquals(change.valueType, curValue, change.value)
            ? undefined
            : curValue;
        }
      }
    }

    return curValue;
  }

  valueChangedDiff(value1: TValue, value2: TValue, options?: ValueTypeOptions) {
    if (!this.equals(value1!, value2!, options)) {
      return FieldChange.insert(value2, this.valueType);
    }
  }

  isEmpty(value: TValue) {
    return false;
  }
}
