export interface StringStrategy {
  writeString(str: string): { ptr: number; length: number };
  readString(ptr: number, length: number): string;
  free(ptr: number): void;
  initialize(module: EmscriptenModule): void;
}

export class WasmMemoryCopyStrategy implements StringStrategy {
  private static heap: Uint8Array;
  private static encoder = new TextEncoder();
  private static decoder = new TextDecoder();

  initialize(module: EmscriptenModule): void {
    WasmMemoryCopyStrategy.heap = module.HEAPU8;
  }

  writeString(str: string): { ptr: number; length: number } {
    const encoded = WasmMemoryCopyStrategy.encoder.encode(str);
    const ptr = Module._malloc(encoded.length);

    if (ptr === 0) {
      throw new Error('Failed to allocate memory');
    }

    WasmMemoryCopyStrategy.heap.set(encoded, ptr);
    return { ptr, length: encoded.length };
  }

  readString(ptr: number, length: number): string {
    const view = new Uint8Array(
      WasmMemoryCopyStrategy.heap.buffer,
      ptr,
      length
    );
    return WasmMemoryCopyStrategy.decoder.decode(view);
  }

  free(ptr: number): void {
    Module._free(ptr);
  }
}

// Future strategy for JS String Builtins (placeholder)
export class JSStringBuiltinStrategy implements StringStrategy {
  initialize(module: EmscriptenModule): void {
    // Will be implemented when JS String Builtins are available
  }

  writeString(str: string): { ptr: number; length: number } {
    throw new Error('JS String Builtin strategy not implemented yet');
  }

  readString(ptr: number, length: number): string {
    throw new Error('JS String Builtin strategy not implemented yet');
  }

  free(ptr: number): void {}
}
