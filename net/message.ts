import { BloomFilter } from '../base/bloom.ts';
import { uniqueId } from '../base/common.ts';
import { CoreValue, Encodable, Encoder } from '../base/core-types/base.ts';
import {
  JSONCyclicalDecoder,
  JSONCyclicalEncoder,
} from '../base/core-types/encoding/json.ts';
import {
  ConstructorDecoderConfig,
  Decodable,
  DecodedValue,
  Decoder,
  ReadonlyDecodedArray,
} from '../base/core-types/encoding/types.ts';
import { isDecoderConfig } from '../base/core-types/encoding/utils.ts';
import { CoroutineScheduler, SchedulerPriority } from '../base/coroutine.ts';
import { ReadonlyJSONObject } from '../base/interfaces.ts';
import { VersionNumber } from '../base/version-number.ts';
import { SchemaManager } from '../cfds/base/schema.ts';
import { NormalizedLogEntry } from '../logging/entry.ts';
import { Commit } from '../repo/commit.ts';
import { getGoatConfig } from '../server/config.ts';

export const K_DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * An initial configuration needed to instantiate a new SyncMessage instance.
 */
export interface SyncMessageConfig {
  /**
   * A bloom filter holding a record of all value IDs this peer has persisted.
   */
  filter: BloomFilter;
  /**
   * The number of entries the peer which constructed this message, had at the
   * time of construction.
   */
  size: number;
  /**
   * The organization id which limits the scope of this message.
   */
  orgId: string;
  /**
   * An array of values that the other side is suspected to be missing.
   */
  values?: Commit[];
  /**
   * A list of identifiers for which the sender was denied access.
   */
  accessDenied?: Iterable<string>;
  /**
   * The protocol used by the sender. If not provided, will use whatever the
   * current build is.
   */
  buildVersion?: VersionNumber;
}

export interface SyncMessageDecoderConfig extends ConstructorDecoderConfig {
  orgId: string;
}

/**
 * The Ovvio sync protocol is stateless, peer-to-peer (fully symmetric),
 * lockless, and works on any collection of append-only unordered items.
 *
 * NOTE: In a future version we may remove the append-only restriction but for
 *       now it's not useful for our specific use case.
 *
 * The protocol works as follows:
 * 1. Peer A scans its local collection in a single pass.
 *    For every encountered entry, it records the entry's unique ID in a bloom
 *    filter. Once completed, A sends the resulting filter to peer B.
 *
 * 2. Peer B receives A's filter. It then does a similar local scan of its local
 *    collection, recording IDs in a new bloom filter exactly like step 1.
 *    For every encountered ID, B also checks if it exists in the filter just
 *    received from A. B notes any entries A does not have (no false negatives
 *    in bloom filters), and sends them to A alongside its locally computed
 *    filter.
 *
 * 3. The cycle repeats indefinitely. As long as both peers continue to
 *    randomly choose their the bloom filter's hash functions, eventually both
 *    collections will end up in sync.
 *
 * To control the work the protocol does, we take into account a few different
 * parameters:
 *
 * - The size difference between the collection of two peers (how much entries
 *   do we need to push). Typically we'll be handling one of two extremes:
 *   either the entire collection needs to be copied (server crash, user log
 *   in, etc), or just a few specific entries (realtime collaboration).
 *
 * - The desired duration it'll take for both parties to reach consistency
 *   (equal collections). This varies widely if we're a client-to-server
 *   connection or server-to-server connection.
 *
 * - The frequency in which we run the sync loop. This is dynamic in two
 *   dimensions: First is a variable desired frequency. The desired frequency
 *   changes as a function of activity. Second is the actual time it took to
 *   send the message. We measure the cycle time and take it into account in
 *   the next cycle.
 *
 * The result of all of these inputs ends as the desired accuracy for the bloom
 * filter that a peer constructs in each cycle. The more entries we need to move
 * faster, we need a higher accuracy filter. On the other hand, less entries
 * spread over more time allow us to aggressively reduce the filter's accuracy
 * and our resource consumption (network and disk).
 *
 * Finally, the protocol is aware that entries have a timestamp to them. Thus,
 * both peers may agree on a specific time frame to sync. At the time of this
 * writing the implementation allows for a TTL specification thus keeping the
 * sync size in check. In the future we may also customize the "now" date,
 * effectively providing a rolling time frame sync window.
 */
export class SyncMessage implements Encodable, Decodable {
  readonly orgId: string;
  readonly schemaManager: SchemaManager;
  private _buildVersion!: VersionNumber;
  private _filter!: BloomFilter;
  private _size!: number;
  private _values!: Commit[];
  private _accessDenied?: string[];

  constructor(
    config: SyncMessageDecoderConfig | SyncMessageConfig,
    schemaManager: SchemaManager,
  ) {
    this.schemaManager = schemaManager;
    if (isDecoderConfig(config)) {
      this.orgId = config.orgId;
      this.deserialize(config.decoder);
    } else {
      this._filter = config.filter;
      this._size = config.size;
      this.orgId = config.orgId;
      this._values = config.values || [];
      if (config.accessDenied) {
        this._accessDenied = Array.from(config.accessDenied);
      }
      this._buildVersion = config.buildVersion || getGoatConfig().version;
    }
  }

  get buildVersion(): VersionNumber {
    return this._buildVersion;
  }

  get filter(): BloomFilter {
    return this._filter;
  }

  get size(): number {
    return this._size;
  }

  get values(): Commit[] {
    return this._values;
  }

  protected set values(v: Commit[]) {
    this._values = v;
  }

  get accessDenied(): string[] {
    return this._accessDenied || [];
  }

  serialize(
    encoder: Encoder<string, CoreValue, CoreValue, unknown>,
    _options?: unknown,
  ): void {
    encoder.set('ver', this.buildVersion);
    encoder.set('f', this.filter);
    encoder.set('s', this.size);
    encoder.set(
      'c',
      (this.values as Commit[]).map((c) => c.toJS()),
    );
    if (this.accessDenied) {
      encoder.set('ad', this.accessDenied);
    }
  }

  deserialize(
    decoder: Decoder<string, DecodedValue>,
    _options?: unknown,
  ): void {
    this._buildVersion = decoder.get<VersionNumber>('ver')!;
    if (!this._filter) {
      this._filter = new BloomFilter({ size: 1, fpr: 0.5 });
    }
    const filterDecoder = decoder.getDecoder('f');
    this._filter.deserialize(filterDecoder);
    if (filterDecoder instanceof JSONCyclicalDecoder) {
      filterDecoder.finalize();
    }
    this._size = decoder.get<number>('s')!;
    this._accessDenied = decoder.get('ad', []);
    const values: Commit[] = [];
    for (const obj of decoder.get<ReadonlyDecodedArray>('c', [])!) {
      try {
        values.push(
          Commit.fromJS(
            this.orgId,
            obj as ReadonlyJSONObject,
            this.schemaManager,
          ),
        );
      } catch (e: unknown) {}
    }
    this._values = values;
  }

  static async decodeAsync(
    decoderConfig: SyncMessageDecoderConfig,
    schemaManager: SchemaManager,
  ): Promise<SyncMessage> {
    const decoder: Decoder<string, DecodedValue> = decoderConfig.decoder;
    const buildVersion = decoder.get<VersionNumber>('ver')!;
    const filter = new BloomFilter({ size: 1, fpr: 0.5 });
    const filterDecoder = decoder.getDecoder('f');
    filter.deserialize(filterDecoder);
    if (filterDecoder instanceof JSONCyclicalDecoder) {
      filterDecoder.finalize();
    }
    const size = decoder.get<number>('s')!;
    const accessDenied = decoder.get('ad', []);
    const values: Commit[] | undefined = !decoder.has('c')
      ? undefined
      : await CoroutineScheduler.sharedScheduler().map(
          decoder.get<ReadonlyDecodedArray>('c', [])!,
          (obj) =>
            Commit.fromJS(
              decoderConfig.orgId,
              obj as ReadonlyJSONObject,
              schemaManager,
            ),
          SchedulerPriority.Normal,
          'SyncMessageDecode',
          true,
        );
    return new this(
      {
        filter,
        size,
        orgId: decoderConfig.orgId,
        values,
        accessDenied,
        buildVersion,
      },
      schemaManager,
    );
  }

  static build(
    peerFilter: BloomFilter | undefined,
    values: Iterable<[id: string, value: Commit]>,
    localSize: number,
    peerSize: number,
    expectedSyncCycles: number,
    orgId: string,
    schemaManager: SchemaManager,
    includeMissing = true,
    lowAccuracy = false,
  ): SyncMessage {
    const numberOfEntries = Math.max(1, localSize, peerSize);
    // To calculate the desired False-Positive-Rate (fpr), we use the following
    // approximation: 2log[fpr](numberOfEntries) = expectedSyncCycles
    // This appears to hold well in practice, while producing compact enough
    // filters.
    //
    // 2log[fpr](N) = C =>
    // log[fpr](N) = 0.5 * C =>
    // fpr ^ 0.5C = N =>
    // fpr = sqr[0.5C](N) =>
    // fpr = N ^ (1 / 0.5C)
    //
    // Note that the resulting FPR is a ratio rather than a fraction, so the
    // final value is 1 / fpr.
    //
    // Finally, a bloom filter with fpr >= 0.5 isn't very useful (more than 50%
    // false positives), so we cap the computed value at 0.5.
    const fpr = lowAccuracy
      ? 0.5
      : Math.min(
          0.5,
          1 / Math.pow(numberOfEntries, 1 / (0.5 * expectedSyncCycles)),
        );
    const localFilter = new BloomFilter({
      size: numberOfEntries,
      fpr,
    });
    const missingPeerValues: Commit[] = [];
    if (peerFilter && includeMissing) {
      localSize = 0;
      for (const [id, v] of values) {
        localFilter.add(id);
        ++localSize;
        if (!peerFilter.has(id)) {
          missingPeerValues.push(v);
        }
      }
    }
    return new this(
      {
        filter: localFilter,
        size: localSize,
        orgId,
        values: missingPeerValues,
      },
      schemaManager,
    );
  }

  static async buildAsync(
    peerFilter: BloomFilter | undefined,
    values: Iterable<[id: string, value: Commit]>,
    localSize: number,
    peerSize: number,
    expectedSyncCycles: number,
    orgId: string,
    schemaManager: SchemaManager,
    includeMissing = true,
    lowAccuracy = false,
  ): Promise<SyncMessage> {
    const numberOfEntries = Math.max(1, localSize, peerSize);
    // To calculate the desired False-Positive-Rate (fpr), we use the following
    // approximation: 2log[fpr](numberOfEntries) = expectedSyncCycles
    // This appears to hold well in practice, while producing compact enough
    // filters.
    //
    // 2log[fpr](N) = C =>
    // log[fpr](N) = 0.5 * C =>
    // fpr ^ 0.5C = N =>
    // fpr = sqr[0.5C](N) =>
    // fpr = N ^ (1 / 0.5C)
    //
    // Note that the resulting FPR is a ratio rather than a fraction, so the
    // final value is 1 / fpr.
    //
    // Finally, a bloom filter with fpr >= 0.5 isn't very useful (more than 50%
    // false positives), so we cap the computed value at 0.5.
    const fpr = lowAccuracy
      ? 0.5
      : Math.min(
          0.5,
          1 / Math.pow(numberOfEntries, 1 / (0.5 * expectedSyncCycles)),
        );
    const localFilter = new BloomFilter({
      size: numberOfEntries,
      fpr,
    });
    const missingPeerValues: Commit[] = [];
    if (peerFilter && includeMissing) {
      localSize = 0;
      await CoroutineScheduler.sharedScheduler().forEach(values, ([id, v]) => {
        localFilter.add(id);
        ++localSize;
        if (!peerFilter.has(id)) {
          missingPeerValues.push(v);
        }
      });
    }
    return new this(
      {
        filter: localFilter,
        size: localSize,
        orgId,
        values: missingPeerValues,
      },
      schemaManager,
    );
  }
}

export function generateSessionId(userId: string): string {
  return `${userId}/${uniqueId()}`;
}
