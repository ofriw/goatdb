// @deno-types="https://raw.githubusercontent.com/DefinitelyTyped/DefinitelyTyped/master/types/emscripten/index.d.ts"
import { encodeBase64 } from 'std/encoding/base64.ts';
import type { EmscriptenModule } from 'https://raw.githubusercontent.com/DefinitelyTyped/DefinitelyTyped/master/types/emscripten/index.d.ts';

interface BloomFilterModule extends EmscriptenModule {
  ccall: <R = number | string | boolean | void>(
    ident: string,
    returnType: string,
    argTypes: string[],
    args: (number | string | boolean)[],
  ) => R;
  cwrap: <R = number, A extends any[] = (number | string | boolean)[]>(
    ident: string,
    returnType: string,
    argTypes: string[],
  ) => (...args: A) => R;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPU8: Uint8Array;
  HEAPU32: Uint32Array;
  UTF8ToString: (ptr: number) => string;
}

declare global {
  let Module: BloomFilterModule;
}

let moduleLoadPromise: Promise<void>;

function initializeModule(): Promise<void> {
  if (!moduleLoadPromise) {
    moduleLoadPromise = (async () => {
      const wasmUrl =
        self.Deno === undefined
          ? new URL('/__system_assets/bloom_filter.wasm', self.location.href)
          : new URL(
              '../assets/__system_assets/bloom_filter.wasm',
              import.meta.url,
            );
      const jsUrl =
        self.Deno === undefined
          ? new URL('/__system_assets/bloom_filter.js', self.location.href)
          : new URL(
              '../assets/__system_assets/bloom_filter.js',
              import.meta.url,
            );

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

  private static create_bloom_filter: (
    size: number,
    fpr: number,
    _ptr: number,
  ) => number;
  private static add_to_filter: (ptr: number, str: string) => void;
  private static check_in_filter: (ptr: number, str: string) => number;
  private static delete_bloom_filter: (ptr: number) => void;
  private static _malloc: (size: number) => number;
  private static _free: (ptr: number) => void;
  private static HEAPU8: Uint8Array;
  private static HEAPU32: Uint32Array;
  private static get_bloom_filter_pointer: (ptr: number) => number;
  private static create_bloom_filter_from_data: (data: number) => number;
  private static get_bloom_filter_size: (data: number) => number;
  private static get_bloom_filter_number_of_hashes: (data: number) => number;

  static async initNativeFunctions(): Promise<void> {
    if (!this.create_bloom_filter) {
      await initializeModule();
      this.create_bloom_filter = Module.cwrap('createBloomFilter', 'number', [
        'number',
        'number',
        'number',
      ]);
      this.create_bloom_filter_from_data = Module.cwrap(
        'createBloomFilterFromData',
        'number',
        ['number'],
      );
      this.add_to_filter = Module.cwrap('addToFilter', 'void', [
        'number',
        'string',
      ]);
      this.check_in_filter = Module.cwrap('checkInFilter', 'number', [
        'number',
        'string',
      ]);
      this.delete_bloom_filter = Module.cwrap('deleteBloomFilter', 'void', [
        'number',
      ]);
      this.get_bloom_filter_pointer = Module.cwrap(
        'getBloomFilterPointer',
        'number',
        ['number'],
      );
      this.get_bloom_filter_size = Module.cwrap(
        'getBloomFilterSize',
        'number',
        ['number'],
      );
      this.get_bloom_filter_number_of_hashes = Module.cwrap(
        'getBloomFilterNumberOfHashes',
        'number',
        ['number'],
      );
      this._malloc = Module._malloc;
      this._free = Module._free;
      this.HEAPU8 = Module.HEAPU8;
      this.HEAPU32 = Module.HEAPU32;
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
    BloomFilter.add_to_filter(this.ptr, value);
  }

  has(value: string): boolean {
    return BloomFilter.check_in_filter(this.ptr, value) !== 0;
  }

  delete(): void {
    if (this.ptr !== 0) {
      console.log(`Deleting BloomFilter with ptr: ${this.ptr}`);
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

  serialize(): string {
    const ptr = BloomFilter.get_bloom_filter_pointer(this.ptr);
    //Uint8Array as a View: This does not copy the data; it simply references the memory at ptr
    const data = new Uint8Array(Module.HEAPU8.buffer, ptr, this.size);
    return encodeBase64(data);
  }

  static deserialize(b64: string): BloomFilter {
    const binaryString = atob(b64);
    const len = binaryString.length;
    const ptr = Module._malloc(len);

    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    Module.HEAPU8.set(bytes, ptr);

    const filterPtr = this.create_bloom_filter_from_data(ptr);

    if (filterPtr === 0) {
      throw new Error(
        `Failed to create BloomFilter from data with pointer ${ptr}`,
      );
    }

    const filter: BloomFilter = Object.create(BloomFilter.prototype);
    filter.ptr = filterPtr;
    filter.size = this.get_bloom_filter_size(filterPtr);

    return filter;
  }
}
