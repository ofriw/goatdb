import { uniqueId } from './common.ts';
import { BloomFilter } from './bloom.ts';
import { randomInt } from './math.ts';

function test(testSize: number): void {
  const values: string[] = [];
  for (let i = 0; i < testSize; ++i) {
    values.push(uniqueId());
  }
  const checkCount = 2 * Math.ceil(Math.log2(testSize) / Math.log2(4));
  let hitCount = 0;
  const testValue = uniqueId();
  for (let i = 0; i < checkCount; ++i) {
    const filter = new BloomFilter({ size: testSize * 1.1, fpr: 0.25 });
    filter.add(values);
    const salt: string[] = [];
    for (let j = 0; j < testSize * 0.1; ++j) {
      const v = uniqueId();
      salt.push(v);
      filter.add(v);
    }
    if (filter.has(values[randomInt(0, salt.length)])) {
      // if (filter.has(testValue)) {
      ++hitCount;
    }
  }
  console.log(`Hit rate: ${hitCount}/${checkCount}`);
}

test(1000);
