import { deserializeDate } from '../../../base/date.ts';
import { ValueTypeOptions } from './index.ts';
import { CoreType } from '../../../base/core-types/index.ts';
import { DecodedValue } from '../../../base/core-types/encoding/index.ts';
import { PrimitiveTypeOperations } from './primitive-type.ts';

export class DateTypeOperations extends PrimitiveTypeOperations<Date> {
  constructor() {
    super(CoreType.Date, 'date');
  }

  deserialize(value: DecodedValue, options?: ValueTypeOptions) {
    const date = super.deserialize(value, options);
    if (typeof date === 'number') {
      return deserializeDate(date);
    }
    return date;
  }
}
