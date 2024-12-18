import { EventDocumentChanged, Repository } from './repo.ts';
import { Item } from '../cfds/base/item.ts';
import { Commit } from './commit.ts';
import { Emitter } from '../base/emitter.ts';
import { NextEventLoopCycleTimer } from '../base/timer.ts';
import { md51 } from '../external/md5.ts';
import { Schema } from '../cfds/base/schema.ts';
import { BloomFilter } from '../base/bloom.ts';
import { GoatDB } from '../db/db.ts';
import { ReadonlyJSONValue } from '../base/interfaces.ts';

const BLOOM_FPR = 0.01;

export type Entry<S extends Schema = Schema> = [
  key: string | null,
  item: Item<S>,
];
export type PredicateInfo<S extends Schema, CTX> = {
  key: string;
  item: Item<S>;
  ctx: CTX;
};
export type Predicate<S extends Schema, CTX extends ReadonlyJSONValue> = (
  info: PredicateInfo<S, CTX>,
) => boolean;

export type SortInfo<S extends Schema, CTX> = {
  left: Item<S>;
  right: Item<S>;
  keyLeft: string;
  keyRight: string;
  ctx: CTX;
};
export type SortDescriptor<S extends Schema, CTX> = (
  info: SortInfo<S, CTX>,
) => number;
export type QuerySource<IS extends Schema = Schema, OS extends IS = IS> =
  | Repository
  | Query<IS, OS, ReadonlyJSONValue>
  | string;

export type QueryConfig<
  IS extends Schema,
  OS extends IS,
  CTX extends ReadonlyJSONValue,
> = {
  db: GoatDB;
  source: QuerySource<IS, OS>;
  predicate?: Predicate<IS, CTX>;
  sortDescriptor?: SortDescriptor<OS, CTX>;
  scheme?: IS;
  id?: string;
  ctx?: CTX;
};

export type QueryEvent = EventDocumentChanged | 'LoadingFinished' | 'Closed';

export class Query<
  IS extends Schema,
  OS extends IS,
  CTX extends ReadonlyJSONValue,
> extends Emitter<QueryEvent> {
  readonly id: string;
  readonly db: GoatDB;
  readonly context: CTX;
  readonly scheme?: IS;
  private readonly source: QuerySource<IS, OS>;
  private _predicateInfo?: PredicateInfo<IS, CTX>;
  private readonly predicate: Predicate<IS, CTX>;
  private _sortInfo?: SortInfo<OS, CTX>;
  private readonly sortDescriptor: SortDescriptor<OS, CTX> | undefined;
  private readonly _headIdForKey: Map<string, string>; // Key -> Commit ID
  private readonly _tempRecordForKey: Map<string, Item<OS>>;
  private readonly _includedKeys: string[];
  private _loadingFinished = false;
  private _scanTimeMs = 0;
  private _bloomFilter: BloomFilter;
  private _bloomFilterSize: number;
  private _bloomFilterCount = 0;
  private _bloomFilterDeleteCount = 0;
  private _age = 0;
  private _sourceListenerCleanup?: () => void;
  private _closed = false;
  private _cachedResults: { key: string; item: Item<OS> }[] | undefined;
  private _cachedResultsAge = 0;
  private _loading: boolean = true;

  // static open<
  //   IS extends Scheme = Scheme,
  //   OS extends IS = IS,
  //   ST extends RepoStorage<ST> = MemRepoStorage,
  // >(config: QueryConfig<IS, OS, ST>): Query<IS, OS, ST> {
  //   let id = config.id;
  //   if (!id) {
  //     id = md51(
  //       config.predicate.toString() + config.sortDescriptor?.toString(),
  //     );
  //   }
  //   let q = this._openQueries.get(id);
  //   if (!q) {
  //     q = new this(config) as unknown as Query;
  //     this._openQueries.set(id, q);
  //   }
  //   return q as unknown as Query<IS, OS, ST>;
  // }

  constructor({
    db,
    id,
    source,
    predicate,
    sortDescriptor,
    ctx,
    scheme,
  }: QueryConfig<IS, OS, CTX>) {
    super();
    this.db = db;
    if (!predicate) {
      predicate = () => true;
    }
    this.id = id || generateQueryId(predicate, sortDescriptor, ctx, scheme?.ns);
    this.context = ctx as CTX;
    this.source = source;
    this.scheme = scheme;
    this.predicate = predicate;
    this.sortDescriptor = sortDescriptor;
    this._headIdForKey = new Map();
    this._tempRecordForKey = new Map();
    // this._includedKeys = new Set();
    this._includedKeys = [];
    this._bloomFilterSize = 1024;
    this._bloomFilter = new BloomFilter({
      size: this._bloomFilterSize,
      fpr: BLOOM_FPR,
      maxHashes: 2,
    });
  }

  get repo(): Repository {
    if (typeof this.source === 'string') {
      return this.db.getRepository(this.source)!;
    }
    return this.source instanceof Repository ? this.source : this.source.repo;
  }

  get count(): number {
    return this._includedKeys.length;
  }

  get scanTimeMs(): number {
    return this._scanTimeMs;
  }

  get bloomFilter(): BloomFilter {
    return this._bloomFilter;
  }

  get age(): number {
    return this._age;
  }

  get loading(): boolean {
    return this._loading;
  }

  has(key: string): boolean {
    if (!this._bloomFilter.has(key)) {
      return false;
    }
    return this._includedKeys.includes(key);
  }

  keys(): Iterable<string> {
    return this._includedKeys;
  }

  results(): readonly { key: string; item: Item<OS> }[] {
    if (!this._cachedResults || this._cachedResultsAge !== this.age) {
      this._cachedResults = [];
      this._cachedResultsAge = this.age;
      for (const k of this._includedKeys) {
        this._cachedResults.push({ key: k, item: this.valueForKey(k) });
      }
      if (this.sortDescriptor) {
        this._cachedResults.sort((e1, e2) => {
          if (!this._sortInfo) {
            this._sortInfo = {
              keyLeft: e1.key,
              left: e1.item,
              keyRight: e2.key,
              right: e2.item,
              ctx: this.context,
            };
          } else {
            this._sortInfo.keyLeft = e1.key;
            this._sortInfo.left = e1.item;
            this._sortInfo.keyRight = e2.key;
            this._sortInfo.right = e2.item;
            this._sortInfo.ctx = this.context;
          }
          return this.sortDescriptor!(this._sortInfo);
        });
      }
      Object.freeze(this._cachedResults);
    }
    return this._cachedResults;
  }

  valueForKey(key: string): Item<OS> {
    const head = this._headIdForKey.get(key);
    return ((head && this.repo.recordForCommit(head)) ||
      this._tempRecordForKey.get(key))!;
  }

  *entries(): Generator<Entry<OS>> {
    for (const key of this._includedKeys) {
      yield [key, this.valueForKey(key)!];
    }
  }

  onResultsChanged(handler: () => void): () => void {
    this.attach('DocumentChanged', () => {
      handler();
    });
    return () => {
      this.detach('DocumentChanged', handler);
    };
  }

  onLoadingFinished(handler: () => void): () => void {
    if (this._loadingFinished) {
      return NextEventLoopCycleTimer.run(handler);
    }
    return this.once('LoadingFinished', () => {
      handler();
    });
  }

  loadingFinished(): Promise<true> {
    let resolve;
    const result = new Promise<true>((res, rej) => {
      resolve = res;
    });
    this.onLoadingFinished(() => resolve!(true));
    return result;
  }

  protected async resume(): Promise<void> {
    super.resume();
    if (!this._closed) {
      if (typeof this.source === 'string') {
        await this.db.open(this.source);
      }
      this.scanRepo();
      if (!this._sourceListenerCleanup) {
        this._sourceListenerCleanup = (
          (typeof this.source === 'string'
            ? this.repo
            : this.source) as Emitter<EventDocumentChanged>
        ).attach('DocumentChanged', (key: string) =>
          this.onNewCommit(this.repo.headForKey(key)!),
        );
      }
    }
  }

  close(): void {
    if (!this._closed) {
      this.emit('Closed');
      this.repo.db.queryPersistence?.unregister(
        this as unknown as Query<Schema, Schema, ReadonlyJSONValue>,
      );
      if (this._sourceListenerCleanup) {
        this._sourceListenerCleanup();
        this._sourceListenerCleanup = undefined;
      }
      // if (Query._openQueries.get(this.id) === (this as unknown as Query)) {
      //   Query._openQueries.delete(this.id);
      // }
    }
  }

  protected suspend(): void {
    if (!this._closed) {
      this.repo.db.queryPersistence?.unregister(
        this as unknown as Query<Schema, Schema, ReadonlyJSONValue>,
      );
      this._sourceListenerCleanup!();
      this._sourceListenerCleanup = undefined;
    }
    super.suspend();
  }

  private addKeyToResults(key: string, currentDoc: Item<IS>): void {
    // Remove any previous entry, to account for order changes
    // if (this._bloomFilter.has(key)) {
    //   const idx = this._includedKeys.indexOf(key);
    //   if (idx >= 0) {
    //     this._includedKeys.splice(idx, 1);
    //   }
    // }
    // Insert to the results set
    if (this.has(key)) {
      return;
    }
    this._includedKeys.push(key);
    // Rebuild bloom filter if it became too big, to maintain its FPR
    if (++this._bloomFilterCount >= this._bloomFilterSize) {
      this._rebuildBloomFilter();
    } else {
      this._bloomFilter.add(key);
    }
    // Report this change downstream
    this.emit('DocumentChanged', key, currentDoc);
  }

  private handleDocChange(
    key: string,
    prevDoc: Item<IS> | undefined,
    currentDoc: Item<IS>,
    head?: Commit,
  ): void {
    if (!prevDoc?.isEqual(currentDoc)) {
      if (head) {
        this._headIdForKey.set(key, head.id);
      } else {
        this._headIdForKey.delete(key);
      }
      this._tempRecordForKey.delete(key);
      if (!currentDoc.isDeleted) {
        if (!this._predicateInfo) {
          this._predicateInfo = { key, item: currentDoc, ctx: this.context };
        } else {
          this._predicateInfo.key = key;
          this._predicateInfo.item = currentDoc;
          this._predicateInfo.ctx = this.context;
        }
        if (
          (!this.scheme || this.scheme.ns === currentDoc.scheme.ns) &&
          this.predicate(this._predicateInfo!)
        ) {
          this.addKeyToResults(key, currentDoc);
        } else if (this._bloomFilter.has(key)) {
          const idx = this._includedKeys.indexOf(key);
          if (idx >= 0) {
            this._includedKeys.splice(idx, 1);
            // If the number of removed items gets above the desired threshold,
            // rebuild our filter to maintain a reasonable FPR
            if (
              ++this._bloomFilterDeleteCount >=
              this._bloomFilterCount * 0.1
            ) {
              this._rebuildBloomFilter();
            }
            this.emit('DocumentChanged', key, currentDoc);
          }
        }
      }
    }
  }

  private onNewCommit(commit: Commit): void {
    const repo = this.repo;
    const key = commit.key;
    const prevHeadId = this._headIdForKey.get(key);
    debugger;
    const currentHead = repo.headForKey(key);
    if (currentHead && prevHeadId !== currentHead?.id) {
      const prevDoc = prevHeadId
        ? repo.recordForCommit(prevHeadId)
        : Item.nullItem();
      const currentDoc = currentHead
        ? repo.recordForCommit(currentHead)
        : Item.nullItem();
      this.handleDocChange(
        key,
        prevDoc as unknown as Item<IS>,
        currentDoc as unknown as Item<IS>,
        currentHead,
      );
    }
    this._age = Math.max(this._age, commit.age || 0);
  }

  private async scanRepo(): Promise<void> {
    const startTime = performance.now();
    const repo = this.repo;
    const cache = await repo.db.queryPersistence?.get(repo.id, this.id);
    // let ageChange = 0;
    let skipped = 0;
    let total = 0;
    let maxAge = 0;
    // const ages = new Set<number>();
    const cachedKeys = new Set(cache?.results || []);
    for (const key of (typeof this.source === 'string'
      ? repo
      : this.source
    ).keys()) {
      ++total;
      if (!this.isActive) {
        break;
      }
      const commitAge = repo.storage.ageForKey[key] || 0;
      // if (commitAge > (cache?.age || 0)) {
      //   ++ageChange;
      // }
      // assert(!ages.has(commitAge));
      // ages.add(commitAge);
      if (commitAge > maxAge) {
        maxAge = commitAge;
      }
      if (cache && commitAge <= cache.age) {
        if (cachedKeys.has(key)) {
          const head = repo.headForKey(key);
          if (head) {
            this._headIdForKey.set(key, head.id);
            this.addKeyToResults(key, repo.valueForKey<IS>(key)![0]);
          }
        }
        ++skipped;
        continue;
      }
      const head = repo.headForKey(key)!;
      if (head) {
        this.onNewCommit(head);
      }
    }
    if (this.isActive) {
      this._scanTimeMs = performance.now() - startTime;
      this._age = Math.max(this._age, maxAge);
      if (!this._loadingFinished) {
        this._loadingFinished = true;
        this.repo.db.queryPersistence?.register(
          this as unknown as Query<Schema, Schema, ReadonlyJSONValue>,
        );
        await this.repo.db.queryPersistence?.flush(this.id);
        this._loading = false;
        this.emit('LoadingFinished');
      }
    }
    // console.log(
    //   `Age change = ${ageChange.toLocaleString()}, Skipped ${skipped.toLocaleString()}, Total ${total.toLocaleString()}`,
    // );
  }

  private _rebuildBloomFilter(): void {
    // Since bloom filters are so cheap, we use an order of magnitude increments
    // in size, to minimize allocation overhead
    this._bloomFilterSize *= 10;
    this._bloomFilter = new BloomFilter({
      size: this._bloomFilterSize,
      fpr: BLOOM_FPR,
      maxHashes: 2,
    });
    // Reset the counter before re-adding all keys
    this._bloomFilterCount = 0;
    for (const key of this.keys()) {
      this._bloomFilter.add(key);
      ++this._bloomFilterCount;
    }
    // The new filter doesn't include all previously deleted keys, thus we
    // can safely reset the delete count
    this._bloomFilterDeleteCount = 0;
  }
}

const gGeneratedQueryIds = new Map<string, string>();

function generateQueryId<
  IS extends Schema = Schema,
  OS extends IS = IS,
  CTX extends ReadonlyJSONValue = ReadonlyJSONValue,
>(
  predicate: Predicate<IS, CTX>,
  sortDescriptor?: SortDescriptor<OS, CTX>,
  ctx?: CTX,
  ns?: string | null,
): string {
  const key =
    predicate.toString() +
    sortDescriptor?.toString() +
    JSON.stringify(ctx) +
    ns;
  let hash = gGeneratedQueryIds.get(key);
  if (!hash) {
    hash = md51(key);
    gGeneratedQueryIds.set(key, hash);
  }
  return hash;
}
