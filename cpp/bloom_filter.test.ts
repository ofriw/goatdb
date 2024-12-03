import { BloomFilter } from './bloom_filter.ts';

Deno.test('BloomFilter - Basic Functionality', async () => {
  await BloomFilter.initNativeFunctions();
  const filter = new BloomFilter({ size: 1000, fpr: 0.01 });
  filter.add('apple');
  filter.add('banana');
  filter.add('orange');

  if (!filter.has('apple')) {
    throw new Error("Filter should contain 'apple'");
  }
  if (!filter.has('banana')) {
    throw new Error("Filter should contain 'banana'");
  }
  if (!filter.has('orange')) {
    throw new Error("Filter should contain 'orange'");
  }
  if (filter.has('grape')) {
    throw new Error("Filter should NOT contain 'grape'");
  }
  filter.delete();
});

Deno.test('BloomFilter - Serialization and Deserialization', async () => {
  await BloomFilter.initNativeFunctions();

  const originalFilter = new BloomFilter({ size: 1000, fpr: 0.01 });
  originalFilter.add('apple');
  originalFilter.add('banana');
  originalFilter.add('orange');

  const serialized = originalFilter.serialize();
  const deserializedFilter = BloomFilter.deserialize(serialized);

  originalFilter.delete();

  if (!deserializedFilter.has('apple')) {
    throw new Error("Deserialized filter should contain 'apple'");
  }
  if (!deserializedFilter.has('banana')) {
    throw new Error("Deserialized filter should contain 'banana'");
  }
  if (!deserializedFilter.has('orange')) {
    throw new Error("Deserialized filter should contain 'orange'");
  }
  if (deserializedFilter.has('grape')) {
    throw new Error("Deserialized filter should NOT contain 'grape'");
  }
  deserializedFilter.delete();
});

Deno.test(
  'BloomFilter - Empty Filter Serialization and Deserialization',
  async () => {
    await BloomFilter.initNativeFunctions();
    const originalFilter = new BloomFilter({ size: 1000, fpr: 0.01 });
    const serialized = originalFilter.serialize();
    const deserializedFilter = BloomFilter.deserialize(serialized);
    if (deserializedFilter.has('apple')) {
      throw new Error("Deserialized empty filter should NOT contain 'apple'");
    }
    if (deserializedFilter.has('banana')) {
      throw new Error("Deserialized empty filter should NOT contain 'banana'");
    }
  }
);

Deno.test(
  'BloomFilter - Serialization and Deserialization with Large Data',
  async () => {
    await BloomFilter.initNativeFunctions();
    const originalFilter = new BloomFilter({ size: 10000, fpr: 0.01 });
    for (let i = 0; i < 1000; i++) {
      originalFilter.add(`element-${i}`);
    }
    const serialized = originalFilter.serialize();
    const deserializedFilter = BloomFilter.deserialize(serialized);
    for (let i = 0; i < 1000; i++) {
      if (!deserializedFilter.has(`element-${i}`)) {
        throw new Error(`Deserialized filter should contain 'element-${i}'`);
      }
    }
    if (deserializedFilter.has('element-1001')) {
      throw new Error("Deserialized filter should NOT contain 'element-1001'");
    }
  }
);

Deno.test('BloomFilter - False Positive Rate Validation', async () => {
  await BloomFilter.initNativeFunctions();
  const filter = new BloomFilter({ size: 100000, fpr: 0.01 });
  for (let i = 0; i < 100; i++) {
    filter.add(`element-${i}`);
  }
  let falsePositives = 0;
  for (let i = 100; i < 100000; i++) {
    if (filter.has(`element-${i}`)) {
      falsePositives++;
    }
  }
  const expectedFPR = 0.01;
  const actualFPR = falsePositives / 9900;
  console.log('FPR - ', falsePositives);
  if (actualFPR > expectedFPR * 2) {
    throw new Error(`False positive rate too high: ${actualFPR}`);
  }
});
