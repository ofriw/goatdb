import {
  StringStrategy,
  WasmMemoryCopyStrategy,
} from './string-strategy/index.ts';
// @deno-types="https://raw.githubusercontent.com/DefinitelyTyped/DefinitelyTyped/master/types/emscripten/index.d.ts"
import { encodeBase64 } from 'std/encoding/base64.ts';
import type { EmscriptenModule } from 'https://raw.githubusercontent.com/DefinitelyTyped/DefinitelyTyped/master/types/emscripten/index.d.ts';

interface BloomFilterModule extends EmscriptenModule {
  ccall: <R = number | string | boolean | void>(
    ident: string,
    returnType: string,
    argTypes: string[],
    args: (number | string | boolean)[]
  ) => R;
  cwrap: <R = number, A extends any[] = (number | string | boolean)[]>(
    ident: string,
    returnType: string,
    argTypes: string[]
  ) => (...args: A) => R;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPU8: Uint8Array;
  UTF8ToString: (ptr: number) => string;
}

declare global {
  let Module: BloomFilterModule;
}

let moduleLoadPromise: Promise<void>;

export function initializeModule(): Promise<void> {
  if (!moduleLoadPromise) {
    moduleLoadPromise = (async () => {
      // const wasmUrl =
      //   self.Deno === undefined
      //     ? new URL('/__system_assets/bloom_filter.wasm', self.location.href)
      //     : new URL(
      //         '../assets/__system_assets/bloom_filter.wasm',
      //         import.meta.url
      //       );
      // const jsUrl =
      //   self.Deno === undefined
      //     ? new URL('/__system_assets/bloom_filter.js', self.location.href)
      //     : new URL(
      //         '../assets/__system_assets/bloom_filter.js',
      //         import.meta.url
      //       );

      const wasmUrl = new URL('./bloom_filter.wasm', import.meta.url);
      const jsUrl = new URL('./bloom_filter.js', import.meta.url);

      const wasmResponse = await fetch(wasmUrl);
      const wasmBinary = await wasmResponse.arrayBuffer();

      const jsResponse = await fetch(jsUrl);
      const moduleScript = await jsResponse.text();

      return new Promise<void>((resolve) => {
        const localModule = {
          wasmBinary,
          onRuntimeInitialized: () => {
            (globalThis as any).Module = localModule;
            resolve();
          },
        };

        const runScript = new Function('Module', moduleScript);
        runScript(localModule);
      });
    })();
  }
  return moduleLoadPromise;
}

export class BloomFilter {
  private ptr: number;
  private size: number;
  private static stringStrategy: StringStrategy = new WasmMemoryCopyStrategy();

  static setStringStrategy(strategy: StringStrategy): void {
    this.stringStrategy = strategy;
    if (Module) {
      strategy.initialize(Module as EmscriptenModule);
    }
  }

  private static create_bloom_filter: (
    size: number,
    fpr: number,
    maxHashes: number
  ) => number;

  private static add_to_filter2: (
    ptr: number,
    strPtr: number,
    strLen: number
  ) => void;

  private static check_in_filter: (
    ptr: number,
    strPtr: number,
    strLen: number
  ) => number;

  private static create_bloom_filter_from_data: (data: number) => number;
  private static delete_bloom_filter: (ptr: number) => void;
  private static get_bloom_filter_pointer: (ptr: number) => number;
  private static get_bloom_filter_size: (ptr: number) => number;
  private static get_bloom_filter_number_of_hashes: (ptr: number) => number;

  static async initNativeFunctions(): Promise<void> {
    if (!this.create_bloom_filter) {
      await initializeModule();

      this.stringStrategy.initialize(Module as EmscriptenModule);

      this.create_bloom_filter = Module.cwrap('createBloomFilter', 'number', [
        'number',
        'number',
        'number',
      ]);

      this.create_bloom_filter_from_data = Module.cwrap(
        'createBloomFilterFromData',
        'number',
        ['number']
      );

      this.add_to_filter2 = Module.cwrap('addToFilter2', 'void', [
        'number',
        'number',
        'number',
      ]);

      this.check_in_filter = Module.cwrap('checkInFilter', 'number', [
        'number',
        'number',
        'number',
      ]);

      this.delete_bloom_filter = Module.cwrap('deleteBloomFilter', 'void', [
        'number',
      ]);

      this.get_bloom_filter_pointer = Module.cwrap(
        'getBloomFilterPointer',
        'number',
        ['number']
      );

      this.get_bloom_filter_size = Module.cwrap(
        'getBloomFilterSize',
        'number',
        ['number']
      );

      this.get_bloom_filter_number_of_hashes = Module.cwrap(
        'getBloomFilterNumberOfHashes',
        'number',
        ['number']
      );
    }
  }

  constructor({
    size,
    fpr,
    maxHashes = 0,
  }: {
    size: number;
    fpr: number;
    maxHashes?: number;
  }) {
    if (fpr <= 0 || fpr >= 1) {
      throw new Error('FPR must be between 0 and 1');
    }
    this.ptr = BloomFilter.create_bloom_filter(size, fpr, maxHashes);
    if (this.ptr === 0) {
      throw new Error('Failed to create BloomFilter');
    }
    this.size = BloomFilter.get_bloom_filter_size(this.ptr);
  }

  add(value: string): void {
    if (!value) {
      throw new Error('Value cannot be empty');
    }

    const { ptr, length } = BloomFilter.stringStrategy.writeString(value);
    try {
      BloomFilter.add_to_filter2(this.ptr, ptr, length);
    } finally {
      BloomFilter.stringStrategy.free(ptr);
    }
  }

  has(value: string): boolean {
    if (!value) {
      throw new Error('Value cannot be empty');
    }

    const { ptr, length } = BloomFilter.stringStrategy.writeString(value);
    try {
      return BloomFilter.check_in_filter(this.ptr, ptr, length) !== 0;
    } finally {
      BloomFilter.stringStrategy.free(ptr);
    }
  }

  serialize(): string {
    const ptr = BloomFilter.get_bloom_filter_pointer(this.ptr);
    if (!ptr) {
      throw new Error('Failed to get bloom filter pointer');
    }

    const data = new Uint8Array(Module.HEAPU8.buffer, ptr, this.size);
    return encodeBase64(data);
  }

  static deserialize(b64: string): BloomFilter {
    if (!b64) {
      throw new Error('Base64 string cannot be empty');
    }

    const binaryString = atob(b64);
    const { ptr: tempPtr, length } =
      this.stringStrategy.writeString(binaryString);

    try {
      const filterPtr = this.create_bloom_filter_from_data(tempPtr);
      if (filterPtr === 0) {
        throw new Error('Failed to create BloomFilter from data');
      }

      const filter: BloomFilter = Object.create(BloomFilter.prototype);
      filter.ptr = filterPtr;
      filter.size = this.get_bloom_filter_size(filterPtr);

      return filter;
    } finally {
      this.stringStrategy.free(tempPtr);
    }
  }

  delete(): void {
    if (this.ptr !== 0) {
      BloomFilter.delete_bloom_filter(this.ptr);
      this.ptr = 0;
    }
  }

  getSize(): number {
    return BloomFilter.get_bloom_filter_size(this.ptr);
  }

  getNumberOfHashes(): number {
    return BloomFilter.get_bloom_filter_number_of_hashes(this.ptr);
  }
}
