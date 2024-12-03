import {
  getTypeOperationsByValue,
  IValueTypeOperations,
  ValueTypeOptions,
} from './index.ts';
import { Change, EncodedChange } from '../../change/index.ts';
import { CoreValue } from '../../../base/core-types/index.ts';

export function diff(
  value1: CoreValue,
  value2: CoreValue,
  typeOP?: IValueTypeOperations,
  options: ValueTypeOptions = {}
): undefined | Change<EncodedChange> | Change<EncodedChange>[] {
  if (value1 === undefined && value2 === undefined) return;

  const lTypeOP = typeOP || getTypeOperationsByValue(value1);

  if (value1 === undefined && value2 !== undefined) {
    //New Value
    return lTypeOP.valueAddedDiff(value2, options);
  } else if (value1 !== undefined && value2 === undefined) {
    //Value Removed
    return lTypeOP.valueRemovedDiff(value1, options);
  } else {
    //Value Changed
    return lTypeOP.valueChangedDiff(value1, value2, options);
  }
}

export function patch(
  value: CoreValue,
  changes: Change<EncodedChange>[],
  typeOP?: IValueTypeOperations,
  options: ValueTypeOptions = {}
): CoreValue {
  const lTypeOP = typeOP || getTypeOperationsByValue(value);
  const newValue = lTypeOP.patch(value, changes, options);

  return newValue;
}

export function concatChanges(
  changes1: undefined | Change<EncodedChange> | Change<EncodedChange>[],
  changes2: undefined | Change<EncodedChange> | Change<EncodedChange>[]
): Change<EncodedChange>[] {
  const result: Change<EncodedChange>[] = [];
  if (changes1) {
    if (Array.isArray(changes1)) {
      for (const c of changes1) {
        result.push(c);
      }
    } else {
      result.push(changes1);
    }
  }

  if (changes2) {
    if (Array.isArray(changes2)) {
      for (const c of changes2) {
        result.push(c);
      }
    } else {
      result.push(changes2);
    }
  }

  return result;
}
