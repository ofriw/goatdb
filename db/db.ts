import * as path from 'std/path/mod.ts';
import { TrustPool } from './session.ts';
import { Repository, RepositoryConfig } from '../repo/repo.ts';
import { DBSettingsProvider } from './settings/settings.ts';
import { FileSettings } from './settings/file.ts';
import { IDBSettings } from './settings/idb.ts';
import { Commit } from '../repo/commit.ts';
import { RepoClient } from '../net/client.ts';
import { kSyncConfigClient, kSyncConfigServer } from '../net/sync-scheduler.ts';
import { SyncScheduler } from '../net/sync-scheduler.ts';
import { QueryPersistence } from '../repo/query-persistance.ts';
import { RepositoryPersistance } from './persistance/repo.ts';
import { QueryPersistenceFile } from './persistance/query-file.ts';
import { ManagedItem } from './managed-item.ts';
import { Scheme } from '../cfds/base/scheme.ts';
import {
  itemPathGetPart,
  itemPathGetRepoId,
  itemPathNormalize,
  ItemPathPart,
} from './path.ts';
import { isBrowser } from '../base/common.ts';
import { SchemeDataType } from '../cfds/base/scheme.ts';
import { Item } from '../cfds/base/item.ts';
import { SimpleTimer, Timer } from '../base/timer.ts';
import {
  JSONLogFile,
  JSONLogFileAppend,
  JSONLogFileClose,
  JSONLogFileFlush,
  JSONLogFileOpen,
  JSONLogFileScan,
  JSONLogFileStartCursor,
  startJSONLogWorkerIfNeeded,
} from '../base/json-log/json-log.ts';
import {
  ReadonlyJSONArray,
  ReadonlyJSONObject,
  ReadonlyJSONValue,
} from '../base/interfaces.ts';
import { BloomFilter } from '../cpp/bloom_filter.ts';
import { MemRepoStorage } from '../repo/repo.ts';
import { QueryConfig, Query } from '../repo/query.ts';
import { md51 } from '../external/md5.ts';

export interface DBConfig {
  path: string;
  orgId?: string;
  peers?: string | Iterable<string>;
}

export type OpenOptions = Omit<RepositoryConfig, 'storage'>;

startJSONLogWorkerIfNeeded();

export class GoatDB {
  readonly orgId: string;
  readonly path: string;
  readonly queryPersistence?: QueryPersistence;
  private readonly _settingsProvider: DBSettingsProvider;
  private readonly _repositories: Map<string, Repository>;
  private readonly _openPromises: Map<string, Promise<Repository>>;
  private readonly _files: Map<string, JSONLogFile>;
  private readonly _peerURLs: string[] | undefined;
  private readonly _peers: Map<string, RepoClient[]> | undefined;
  private readonly _items: Map<string, ManagedItem>;
  private readonly _openQueries = new Map<
    string,
    Query<Scheme, Scheme, ReadonlyJSONValue>
  >();
  private _trustPool: TrustPool | undefined;
  private _syncSchedulers: SyncScheduler[] | undefined;

  constructor(config: DBConfig) {
    this.path = config.path;
    this._settingsProvider =
      typeof self.Deno === 'undefined'
        ? new IDBSettings()
        : new FileSettings(this.path);
    this.orgId = config?.orgId || 'localhost';
    this._repositories = new Map();
    this._openPromises = new Map();
    this._files = new Map();
    this._items = new Map();
    this._openQueries = new Map();
    if (config?.peers !== undefined) {
      this._peerURLs =
        typeof config.peers === 'string'
          ? [config.peers]
          : Array.from(new Set(config.peers));
      this._peers = new Map();
    }
    if (this.path) {
      this.queryPersistence = new QueryPersistence(
        new QueryPersistenceFile(this.path),
      );
    }
  }

  /**
   * Opens the given repository, loading all its items to memory.
   * This method does nothing if the repository is already open.
   *
   * @param path The path to the given repository.
   * @param opts Configuration options when opening this repository.
   */
  open(path: string, opts?: OpenOptions): Promise<Repository> {
    path = itemPathNormalize(path);
    const repoId = itemPathGetRepoId(path);
    if (this._repositories.has(repoId)) {
      return Promise.resolve(this._repositories.get(repoId)!);
    }
    let result = this._openPromises.get(repoId);
    if (!result) {
      result = this._openImpl(repoId, opts).finally(() => {
        if (this._openPromises.get(repoId) === result) {
          this._openPromises.delete(repoId);
        }
      });
      this._openPromises.set(repoId, result);
    }
    return result;
  }

  /**
   * Closes a repository, flushing any pending writes to disk before releasing
   * all memory associated with this repository.
   *
   * This method does nothing if the repository isn't currently loaded.
   *
   * @param path Path to the desired repository.
   */
  async close(path: string): Promise<void> {
    path = itemPathNormalize(path);
    const repoId = itemPathGetRepoId(path);
    if (this._openPromises.has(repoId)) {
      await this._openPromises.get(repoId);
    }
    const repo = this.getRepository(repoId);
    if (!repo) {
      return;
    }
    await this.flush(path);
    for (const client of this._peers?.get(repoId) || []) {
      client.close();
    }
    this._peers?.delete(repoId);
    const fileEntry = this._files.get(repoId);
    if (fileEntry) {
      await JSONLogFileClose(fileEntry);
    }
    this._files.delete(repoId);
    repo.detachAll();
    this._repositories.delete(repoId);
  }

  /**
   * Access an item at the given path. An item's path is typically at the
   * following format:
   * /<data type>/<repo id>/<item key>
   *
   * NOTE: If the item's repository haven't been opened yet, it'll be opened in
   * the background. While open is progressing, the returned item will
   * initially have a NULL scheme, and once open completes it'll be converted
   * to the correct scheme if available. Typically it's easier to first
   * explicitly open the repository before accessing any of its items.
   *
   * @param pathComps A full path or path components.
   * @returns A managed item that tracks both local and remote edits.
   */
  item<S extends Scheme>(...pathComps: string[]): ManagedItem<S> {
    const path = itemPathNormalize(pathComps.join('/'));
    let item = this._items.get(path);
    if (!item) {
      item = new ManagedItem(this, path);
      this._items.set(path, item);
    } else {
      item.rebase();
    }
    return item as unknown as ManagedItem<S>;
  }

  /**
   * Explicitly create an item, loading its repository if needed. Use this
   * method for bulk load operations where you want to be notified after the
   * write completes.
   *
   * NOTE: This method uses a different internal path than the Item based API,
   * and is much more efficient for bulk creations.
   *
   * @param path The path for the item to create.
   * @param scheme The scheme to create the item with.
   * @param data The initial data for the item.
   */
  async create<S extends Scheme>(
    path: string,
    scheme: S,
    data: SchemeDataType<S>,
  ): Promise<void> {
    const repo = await this.open(path);
    await repo.setValueForKey(
      itemPathGetPart(path, ItemPathPart.Item),
      new Item<S>({
        scheme,
        data,
      }),
      undefined,
    );
  }

  /**
   * Returns the number of items at the specified path, or -1 if the path
   * doesn't exist.
   *
   * NOTE: Currently only paths to repositories are supported.
   *
   * @param path The full path to count.
   * @returns The number of items found or -1.
   */
  count(path: string): number {
    path = itemPathNormalize(path);
    const repoId = itemPathGetRepoId(path);
    return this.getRepository(repoId)?.storage.numberOfKeys() || -1;
  }

  /**
   * Returns the keys at the specified path.
   *
   * NOTE: Currently only paths to repositories are supported.
   *
   * @param path Full path to a repository.
   * @returns The keys at the specified path.
   */
  keys(path: string): Iterable<string> {
    path = itemPathNormalize(path);
    const repoId = itemPathGetRepoId(path);
    return this.getRepository(repoId)?.keys() || [];
  }

  /**
   * Open a new query or access an already open one.
   * @param config
   * @returns
   */
  query<IS extends Scheme, CTX extends ReadonlyJSONValue, OS extends IS = IS>(
    config: Omit<QueryConfig<IS, OS, CTX>, 'db'>,
  ): Query<IS, OS, CTX> {
    let id = config.id;
    if (!id) {
      id = md51(
        config.predicate.toString() + config.sortDescriptor?.toString(),
      );
    }
    let q = this._openQueries.get(id);
    if (!q) {
      q = new Query({ ...config, db: this }) as unknown as Query<
        Scheme,
        Scheme,
        ReadonlyJSONValue
      >;
      q.once('Closed', () => {
        if (this._openQueries.get(q!.id) === q) {
          this._openQueries.delete(q!.id);
        }
      });
      this._openQueries.set(id, q);
    }
    return q as unknown as Query<IS, OS, CTX>;
  }

  async getTrustPool(): Promise<TrustPool> {
    if (!this._trustPool) {
      await this._settingsProvider.load();
      const settings = this._settingsProvider.settings;
      this._trustPool = new TrustPool(
        this.orgId,
        settings.currentSession,
        settings.roots,
        settings.trustedSessions,
      );
      if (this._peerURLs) {
        const syncConfig = isBrowser() ? kSyncConfigClient : kSyncConfigServer;
        this._syncSchedulers = this._peerURLs.map(
          (url) =>
            new SyncScheduler(url, syncConfig, this._trustPool!, this.orgId),
        );
      }
    }
    return this._trustPool;
  }

  private async _openImpl(
    repoId: string,
    opts?: OpenOptions,
  ): Promise<Repository> {
    await BloomFilter.initNativeFunctions();
    repoId = Repository.normalizeId(repoId);
    const repo = new Repository(this, repoId, await this.getTrustPool(), opts);
    this._repositories.set(repoId, repo);
    const file = await JSONLogFileOpen(
      path.join(this.path, relativePathForRepo(repoId)),
      true,
    );
    // const commitIds = new Set<string>();
    this._files.set(repoId, file);
    repo.mute();
    this.queryPersistence?.get(repoId);
    const cursor = await JSONLogFileStartCursor(file);
    let done = false;
    let nextPromise = JSONLogFileScan(cursor);
    do {
      let entries: readonly ReadonlyJSONObject[];
      [entries, done] = await nextPromise;
      nextPromise = JSONLogFileScan(cursor);
      // [entries, done] = await JSONLogFileScan(cursor);
      const commits = Commit.fromJSArr(this.orgId, entries);
      // for (const c of commits) {
      //   commitIds.add(c.id);
      // }
      await repo.persistVerifiedCommits(commits);
    } while (!done);
    // Pre-assemble all commit graphs
    // for (const k of repo.keys()) {
    //   repo.valueForKey(k);
    // }
    repo.unmute();
    repo.attach('NewCommitSync', async (c: Commit) => {
      // if (!commitIds.has(c.id)) {
      JSONLogFileAppend(file, [c.toJS()]);
      // commitIds.add(c.id);
      // }
    });
    if (this._syncSchedulers) {
      const clients: RepoClient[] = [];
      for (const scheduler of this._syncSchedulers) {
        const c = new RepoClient(
          repo,
          repoId,
          scheduler.syncConfig,
          scheduler,
          this.orgId,
        );
        clients.push(c);
        c.ready = true;
        c.startSyncing();
      }
      this._peers!.set(repoId, clients);
    }
    return repo;
  }

  getRepository(id: string): Repository | undefined {
    return this._repositories.get(Repository.normalizeId(id));
  }

  flush(path: string): Promise<void> {
    path = itemPathNormalize(path);
    const fileEntry = this._files.get(itemPathGetRepoId(path));
    return fileEntry ? JSONLogFileFlush(fileEntry) : Promise.resolve();
  }
}

function relativePathForRepo(repoId: string): string {
  const [storage, id] = Repository.parseId(Repository.normalizeId(repoId));
  return path.join(storage, id + '.jsonl');
}
