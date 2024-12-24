import { encodeBase64 } from 'std/encoding/base64.ts';
import { assert } from './error.ts';
import { MurmurHash3 } from './hash.ts';
import { CoreValue, Encodable, Encoder } from './core-types/base.ts';
import {
  ConstructorDecoderConfig,
  Decodable,
  DecodedValue,
  Decoder,
  isDecoderConfig,
} from './core-types/encoding/index.ts';
import { ReadonlyJSONObject } from './interfaces.ts';
import { allocateBuffer, cacheBufferForReuse } from './buffer.ts';
import { decodeBase64 } from './buffer.ts';

/**
 * A buffer that provides access to single bits by index.
 * Designed as storage for BloomFilter.
 */
class BitField {
  private _byteSize: number;
  private _buffer: Uint8Array;

  constructor(sizeOrBuff: number | Uint8Array) {
    if (typeof sizeOrBuff === 'number') {
      this._byteSize = Math.ceil(sizeOrBuff / 8);
      this._buffer = allocateBuffer(this._byteSize);
    } else {
      this._byteSize = sizeOrBuff.byteLength;
      this._buffer = sizeOrBuff;
    }
  }

  get buffer(): Uint8Array {
    return this._buffer.subarray(0, this._byteSize);
  }

  set buffer(buf: Uint8Array) {
    cacheBufferForReuse(this._buffer);
    this._buffer = buf;
    this._byteSize = buf.byteLength;
  }

  get bitSize() {
    return this.byteSize * 8;
  }

  get byteSize() {
    return this._byteSize;
  }

  get(idx: number): boolean {
    const byteOffset = idx >> 3; // floor(idx / 8)
    const bitMask = 1 << idx % 8;
    return (this._buffer[byteOffset] & bitMask) !== 0;
  }

  set(idx: number, value: boolean): void {
    const byteOffset = idx >> 3; // floor(idx / 8)
    const bitMask = 1 << idx % 8;
    const buf = this._buffer;
    if (value) {
      buf[byteOffset] = buf[byteOffset] | bitMask;
    } else {
      buf[byteOffset] = buf[byteOffset] & ~bitMask;
    }
  }

  clear(): void {
    this.buffer.fill(0);
  }
  reuse(): void {
    cacheBufferForReuse(this._buffer);
  }
}

export interface BloomFilterOptions {
  // Expected number of items
  size: number;
  // 0-1, false-positive rate (e.g. 0.01 = 1%, meaning 1 of every 100 true
  // membership test will actually be false).
  fpr?: number;
  // Number of total bits in filter. Leave undefined for optimal value
  m?: number;
  // Number of hash functions. Leave undefined for optimal value
  k?: number;
  // If k is left undefined, you may provide a max number of hashes
  maxHashes?: number;
}

export interface EncodedBloomFilter extends ReadonlyJSONObject {
  d: string; // BitField instance encoded as Base64
  s: number[]; // An array of hash seeds
}

export interface BloomFilterDecoderConfig
  extends ConstructorDecoderConfig<EncodedBloomFilter> {
  readonly?: boolean;
}

/**
 * A simple Bloom Filter implementation using MurmurHash3.
 */
export class BloomFilter implements Encodable, Decodable {
  private _filter!: BitField;
  private _hashes: MurmurHash3[];
  constructor(options: BloomFilterOptions | BloomFilterDecoderConfig) {
    console.log('JavaScript!');

    if (isDecoderConfig(options)) {
      // this._filter = new BitField(1);
      this._hashes = [];
      this.deserialize(options.decoder);
    } else {
      const { fpr, maxHashes } = options;
      const size = Math.max(1, options.size);
      let { m, k } = options;
      if (m === undefined) {
        assert(fpr !== undefined);
        m = Math.ceil(
          (size * Math.log(fpr!)) / Math.log(1 / Math.pow(2, Math.log(2)))
        );
      }
      if (k === undefined) {
        k = (m / size) * Math.log(2);
      }

      if (maxHashes !== undefined) {
        k = Math.min(k, maxHashes);
      }

      this._filter = new BitField(m);
      this._hashes = [];
      for (let i = 0; i < k; ++i) {
        this._hashes.push(new MurmurHash3());
      }
    }
  }

  /**
   * Returns the number of bytes the filter occupies.
   */
  get byteSize() {
    return this._filter.byteSize;
  }

  fillRate(): number {
    const filter = this._filter;
    let count = 0;
    for (let i = 0; i < filter.bitSize; ++i) {
      if (filter.get(i)) {
        ++count;
      }
    }
    return count / filter.bitSize;
  }

  /**
   * Adds a value to the filter
   */
  add(values: string | Iterable<string>): void {
    if (typeof values === 'string') {
      values = [values];
    }
    for (const val of values) {
      const buf = this._filter;
      const size = buf.bitSize;
      for (const h of this._hashes) {
        h.hash(val);
        const v = h.result();
        buf.set(v % size, true);
        h.reset();
      }
    }
  }

  /**
   * Returns whether the key exists or not in the filter.
   */
  has(value: string): boolean {
    const buf = this._filter;
    const size = buf.bitSize;
    for (const h of this._hashes) {
      h.hash(value);
      const v = h.result();
      h.reset();
      if (!buf.get(v % size)) {
        return false;
      }
    }
    return true;
  }

  clear(): BloomFilter {
    this._filter.clear();
    for (const hash of this._hashes) {
      hash.resetSeed();
    }
    return this;
  }

  serialize(
    encoder: Encoder<string, CoreValue, unknown, unknown>,
    _options?: unknown
  ): void {
    encoder.set('d', encodeBase64(this._filter.buffer));
    encoder.set(
      's',
      this._hashes.map((h) => h.seed)
    );
  }

  deserialize(
    decoder: Decoder<string, DecodedValue>,
    _options?: unknown
  ): void {
    if (!this._filter) {
      this._filter = new BitField(decodeBase64(decoder.get('d')!, true));
    } else {
      this._filter.buffer = decodeBase64(decoder.get('d')!, true);
    }
    this._hashes = decoder
      .get<number[]>('s')!
      .map((seed) => new MurmurHash3(seed));
  }

  reuse(): void {
    this._filter.reuse();
  }
}
