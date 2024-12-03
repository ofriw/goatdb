import { ValueType, ValueTypeOptions } from './index.ts';
import {
  dictFromPrimitive,
  Dictionary,
  PrimitiveMap,
} from '../../../base/collections/dict.ts';
import { DecodedValue } from '../../../base/core-types/encoding/index.ts';
import { Change, EncodedChange } from '../../change/index.ts';
import { CoreTypeOperations } from './core-type.ts';
import { FieldChange, FieldOperation } from '../../change/field-change.ts';
import {
  ConcreteCoreValue,
  CoreKey,
  CoreType,
  coreValueEquals,
} from '../../../base/core-types/index.ts';

export class MapTypeOperations extends CoreTypeOperations<
  Dictionary<CoreKey, ConcreteCoreValue>
> {
  constructor(readonly isRef: boolean, valueType: ValueType) {
    super(CoreType.Dictionary, valueType);
  }

  patch(
    curValue: Dictionary<CoreKey, ConcreteCoreValue> | undefined,
    changes: Change<EncodedChange>[],
    options?: ValueTypeOptions
  ) {
    for (const change of changes) {
      if (change instanceof FieldChange) {
        if (change.operation === FieldOperation.Insert) {
          curValue = this.patchInsert(curValue, change);
        } else if (change.operation === FieldOperation.Delete) {
          curValue = this.patchDelete(curValue, change);
        }
      }
    }
    return curValue;
  }

  private patchInsert(
    curMap: Dictionary<CoreKey, ConcreteCoreValue> | undefined,
    change: FieldChange<Dictionary<CoreKey, ConcreteCoreValue>>
  ) {
    if (!curMap) {
      curMap = this.createMap();
    }

    for (const [k, v] of change.value) {
      curMap.set(k, v);
    }
    return curMap;
  }

  private patchDelete(
    curMap: Dictionary<CoreKey, ConcreteCoreValue> | undefined,
    change: FieldChange<Dictionary<CoreKey, ConcreteCoreValue>>
  ) {
    if (curMap === undefined) return curMap;

    for (const [k, v] of change.value) {
      const curValue = curMap.get(k);
      if (coreValueEquals(curValue, v)) {
        curMap.delete(k);
      }
    }
    if (!curMap.size) {
      return undefined;
    }

    return curMap;
  }

  valueChangedDiff(
    map1: Dictionary<CoreKey, ConcreteCoreValue>,
    map2: Dictionary<CoreKey, ConcreteCoreValue>,
    options?: ValueTypeOptions
  ) {
    map1 = map1 || this.createMap();
    map2 = map2 || this.createMap();

    const insertMap = this.createMap();
    const deleteMap = this.createMap();

    for (const [key, value1] of map1) {
      if (!map2.has(key)) {
        deleteMap.set(key, value1);
        continue;
      }
      if (!coreValueEquals(value1, map2.get(key))) {
        insertMap.set(key, map2.get(key));
      }
    }

    for (const [key, value2] of map2) {
      if (!map1.has(key)) {
        insertMap.set(key, value2);
      }
    }

    if (insertMap.size === 0 && deleteMap.size === 0) return;

    const changes: Change<EncodedChange>[] = [];
    if (insertMap.size > 0) {
      changes.push(FieldChange.insert(insertMap, this.valueType));
    }

    if (deleteMap.size > 0) {
      changes.push(FieldChange.delete(deleteMap, this.valueType));
    }
    return changes;
  }

  deserialize(value: DecodedValue, options?: ValueTypeOptions) {
    const prim = value as PrimitiveMap;

    const dict = dictFromPrimitive(prim);
    const newMap = this.createMap();

    for (const [k, v] of dict) {
      newMap.set(k, v);
    }
    return newMap;
  }

  isEmpty(value: Dictionary<CoreKey, ConcreteCoreValue>) {
    return value.size === 0;
  }

  private createMap(): Dictionary {
    return new Map();
  }

  gc(
    value: Dictionary<CoreKey, ConcreteCoreValue>
  ): Dictionary<CoreKey, ConcreteCoreValue> | undefined {
    return undefined;
  }

  fillRefs(
    refs: Set<string>,
    dict: Dictionary<ConcreteCoreValue, ConcreteCoreValue>
  ): void {
    if (this.isRef && dict !== undefined) {
      for (const [key, value] of dict) {
        if (typeof key === 'string') {
          refs.add(key);
        }
        if (typeof value === 'string') {
          refs.add(value);
        }
      }
    }
  }

  rewriteRefs(
    keyMapping: Map<string, string>,
    dict: Dictionary<string, ConcreteCoreValue>,
    deleteRefs?: Set<string>
  ): Dictionary<string, ConcreteCoreValue> {
    if (!this.isRef) {
      return dict;
    }
    const result = new Map<string, ConcreteCoreValue>();
    for (const [key, value] of dict) {
      if (deleteRefs?.has(key) || deleteRefs?.has(value as string)) {
        continue;
      }
      result.set(
        keyMapping.get(key as string) || key,
        keyMapping.get(value as string) || value
      );
    }
    return result;
  }
}
