import { JSONObject, ReadonlyJSONValue } from '../base/interfaces.ts';
import { Query } from './query.ts';
import { Repository, RepoStorage, MemRepoStorage } from './repo.ts';
import { SimpleTimer, Timer } from '../base/timer.ts';
import { kSecondMs } from '../base/date.ts';
import { Schema } from '../cfds/base/schema.ts';

const QUERY_CACHE_VERSION = 1;

export interface QueryCache {
  readonly age: number;
  // readonly filter: BloomFilter;
  readonly results: string[];
}

export interface EncodedQueryCache extends JSONObject {
  age: number;
  results: string[];
}

export interface EncodedRepoCache extends JSONObject {
  version: typeof QUERY_CACHE_VERSION;
  queries: Record<string, EncodedQueryCache>;
}

export interface QueryPersistanceStorage {
  load(repoId: string): Promise<EncodedRepoCache | undefined>;
  store(repoId: string, value: EncodedRepoCache): Promise<boolean>;
}

export class QueryPersistence {
  private readonly _queries: Map<
    string,
    Set<Query<Schema, Schema, ReadonlyJSONValue>>
  >;
  private readonly _persistedGeneration: Map<
    Query<Schema, Schema, ReadonlyJSONValue>,
    number
  >;
  private readonly _cachedDataForRepo: Map<string, Map<string, QueryCache>>;
  private readonly _flushTimer: Timer;
  private readonly _loadingPromises: Map<
    string,
    Promise<Map<string, QueryCache>>
  >;
  private readonly _flushPromises: Map<string, Promise<void>>;

  constructor(readonly storage?: QueryPersistanceStorage) {
    this._queries = new Map();
    this._persistedGeneration = new Map();
    this._cachedDataForRepo = new Map();
    this._flushTimer = new SimpleTimer(
      5 * kSecondMs,
      false,
      () => this.flushAll(),
      'Query Persistance Flush',
    ).schedule();
    this._loadingPromises = new Map();
    this._flushPromises = new Map();
  }

  start(): void {
    this._flushTimer.schedule();
  }

  close(): void {
    this._flushTimer.unschedule();
  }

  register(query: Query<Schema, Schema, ReadonlyJSONValue>): void {
    let set = this._queries.get(query.repo.path);
    if (!set) {
      set = new Set();
      this._queries.set(query.repo.path, set);
    }
    set.add(query);
    this.flush(query.repo.path);
  }

  unregister(query: Query<Schema, Schema, ReadonlyJSONValue>): void {
    const set = this._queries.get(query.repo.path);
    if (set) {
      set.delete(query);
      if (set.size === 0) {
        this._queries.delete(query.repo.path);
        this._persistedGeneration.delete(query);
      }
    }
  }

  async get(repoId: string, queryId?: string): Promise<QueryCache | undefined> {
    repoId = Repository.normalizePath(repoId);
    let map = this._cachedDataForRepo.get(repoId);
    if (!map) {
      map = await this.loadCacheForRepo(repoId);
      this._cachedDataForRepo.set(repoId, map || new Map());
    }

    return queryId ? map?.get(queryId) : undefined;
  }

  private loadCacheForRepo(repoId: string): Promise<Map<string, QueryCache>> {
    let promise = this._loadingPromises.get(repoId);
    if (!promise) {
      promise = this._loadCacheForRepoImpl(repoId);
      this._loadingPromises.set(repoId, promise);
      promise.finally(() => {
        if (this._loadingPromises.get(repoId) === promise) {
          this._loadingPromises.delete(repoId);
        }
      });
    }
    return promise;
  }

  private async _loadCacheForRepoImpl(
    repoId: string,
  ): Promise<Map<string, QueryCache>> {
    repoId = Repository.normalizePath(repoId);
    const json = await this.storage?.load(repoId);
    if (json?.version !== QUERY_CACHE_VERSION) {
      return new Map();
    }
    const map = new Map();
    for (const queryId in json.queries) {
      map.set(queryId, json.queries[queryId]);
    }
    return map;
  }

  private async flushAll(): Promise<void> {
    for (const repoId of this._queries.keys()) {
      await this.flush(repoId);
    }
  }

  flush(repoId: string): Promise<void> {
    repoId = Repository.normalizePath(repoId);
    let promise = this._flushPromises.get(repoId);
    if (!promise) {
      promise = this._flushImpl(repoId);
      this._flushPromises.set(repoId, promise);
    }
    return promise;
  }

  private async _flushImpl(repoId: string): Promise<void> {
    if (!this.storage) {
      return;
    }
    repoId = Repository.normalizePath(repoId);
    let changed = false;
    const queries = this._queries.get(repoId) || [];
    for (const q of queries) {
      const prevGen = this._persistedGeneration.get(q) || 0;
      if (prevGen !== q.age) {
        changed = true;
        break;
      }
    }
    if (!changed) {
      return;
    }
    const repoCache: EncodedRepoCache = {
      version: QUERY_CACHE_VERSION,
      queries: {},
    };
    for (const q of queries) {
      repoCache.queries[q.id] = {
        age: q.age,
        results: Array.from(q.keys()),
      };
    }
    this._cachedDataForRepo.delete(repoId);
    await this.storage.store(repoId, repoCache);
    this._flushPromises.delete(repoId);
  }
}
