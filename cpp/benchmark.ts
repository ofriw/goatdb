import { BloomFilter } from './bloom_filter.ts';

interface BenchmarkResults {
  insertionTime: number;
  positiveQueryTime: number;
  negativeQueryTime: number;
  falsePositiveRate: number;
  itemsPerSecond: number;
  memoryUsage: number;
}

interface TestConfig {
  name: string;
  size: number;
  fpr: number;
  maxHashes?: number;
}

async function runBenchmark() {
  // Initialize
  console.log('Initializing BloomFilter...');
  await BloomFilter.initNativeFunctions();

  // Test configurations
  const configs: TestConfig[] = [
    { name: 'Small', size: 10_000, fpr: 0.01 },
    { name: 'Medium', size: 100_000, fpr: 0.01 },
    { name: 'Large', size: 1_000_000, fpr: 0.01 },
  ];

  for (const config of configs) {
    console.log(`\n=== Running benchmark: ${config.name} ===`);
    console.log(`Configuration: size=${config.size}, fpr=${config.fpr}`);

    const results = await benchmarkConfiguration(config);
    printResults(config, results);
  }
}

async function benchmarkConfiguration(
  config: TestConfig
): Promise<BenchmarkResults> {
  const filter = new BloomFilter(config);
  const testData = generateTestData(config.size);
  const results = {
    insertionTime: 0,
    positiveQueryTime: 0,
    negativeQueryTime: 0,
    falsePositiveRate: 0,
    itemsPerSecond: 0,
    memoryUsage: 0,
  };

  try {
    // Test Insertion
    console.log(`\nInserting ${config.size} items...`);
    const insertStart = performance.now();
    for (const item of testData.items) {
      filter.add(item);
    }
    results.insertionTime = performance.now() - insertStart;
    results.itemsPerSecond = (config.size / results.insertionTime) * 1000;

    // Test Positive Queries (items that exist)
    console.log('Testing positive queries...');
    const posQueryStart = performance.now();
    let found = 0;
    for (const item of testData.items) {
      if (filter.has(item)) found++;
    }
    results.positiveQueryTime = performance.now() - posQueryStart;
    const truePositiveRate = found / config.size;
    console.log(`True Positive Rate: ${(truePositiveRate * 100).toFixed(2)}%`);

    // Test Negative Queries (items that don't exist)
    console.log('Testing negative queries...');
    const negQueryStart = performance.now();
    let falsePositives = 0;
    for (const item of testData.nonExistingItems) {
      if (filter.has(item)) falsePositives++;
    }
    results.negativeQueryTime = performance.now() - negQueryStart;
    results.falsePositiveRate =
      falsePositives / testData.nonExistingItems.length;

    // Calculate memory usage
    results.memoryUsage = filter.getSize();

    return results;
  } finally {
    filter.delete();
  }
}

function generateTestData(size: number) {
  console.log('Generating test data...');

  // Generate existing items
  const items = new Array(size);
  for (let i = 0; i < size; i++) {
    items[i] = `test-item-${i}-${Math.random().toString(36).substring(7)}`;
  }

  // Generate non-existing items
  const nonExistingItems = new Array(size);
  for (let i = 0; i < size; i++) {
    nonExistingItems[i] = `non-existing-${i}-${Math.random()
      .toString(36)
      .substring(7)}`;
  }

  return { items, nonExistingItems };
}

function printResults(config: TestConfig, results: BenchmarkResults) {
  console.log('\nBenchmark Results:');
  console.log('==================');
  console.log(`Configuration: ${config.name}`);
  console.log(`Filter Size: ${config.size} items`);
  console.log(`Target FPR: ${config.fpr}`);
  console.log('\nPerformance Metrics:');
  console.log(`- Insertion Time: ${results.insertionTime.toFixed(2)}ms`);
  console.log(
    `- Items per Second: ${Math.round(results.itemsPerSecond).toLocaleString()}`
  );
  console.log(
    `- Average Insert Time per Item: ${(
      results.insertionTime / config.size
    ).toFixed(3)}ms`
  );
  console.log(
    `- Positive Query Time: ${results.positiveQueryTime.toFixed(2)}ms`
  );
  console.log(
    `- Negative Query Time: ${results.negativeQueryTime.toFixed(2)}ms`
  );
  console.log(
    `- Actual False Positive Rate: ${(results.falsePositiveRate * 100).toFixed(
      4
    )}%`
  );
  console.log(
    `- Memory Usage: ${(results.memoryUsage / 1024 / 1024).toFixed(2)} MB`
  );
}

// Run benchmark with error handling
console.log('=== Starting Bloom Filter Benchmark ===\n');
runBenchmark()
  .then(() => console.log('\n=== Benchmark completed successfully ==='))
  .catch((error) => {
    console.error('\nBenchmark failed:', error);
    Deno.exit(1);
  });
