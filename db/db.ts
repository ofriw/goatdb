import * as path from 'std/path/mod.ts';
import { Session, TrustPool } from './session.ts';
import { Repository, RepositoryConfig } from '../repo/repo.ts';
import { DBSettingsProvider } from './settings/settings.ts';
import { FileSettings } from './settings/file.ts';
import { IDBSettings } from './settings/idb.ts';
import { Commit } from '../repo/commit.ts';
import { RepoClient } from '../net/client.ts';
import { kSyncConfigClient, kSyncConfigServer } from '../net/sync-scheduler.ts';
import { SyncScheduler } from '../net/sync-scheduler.ts';
import { QueryPersistence } from '../repo/query-persistance.ts';
import { QueryPersistenceFile } from './persistance/query-file.ts';
import { ManagedItem } from './managed-item.ts';
import { Schema, SchemaManager } from '../cfds/base/schema.ts';
import {
  itemPath,
  itemPathGetPart,
  itemPathGetRepoId,
  itemPathNormalize,
  ItemPathPart,
} from './path.ts';
import { isBrowser, uniqueId } from '../base/common.ts';
import { SchemaDataType } from '../cfds/base/schema.ts';
import { Item } from '../cfds/base/item.ts';
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
import { ReadonlyJSONObject, ReadonlyJSONValue } from '../base/interfaces.ts';
import { BloomFilter } from '../cpp/bloom_filter.ts';
import { QueryConfig, Query } from '../repo/query.ts';
import { md51 } from '../external/md5.ts';

/**
 * Denotes the type of the requested operation.
 */
export type AuthOp = 'read' | 'write';

/**
 * A function that implements access control rules for a given repository or
 * group of repositories.
 *
 * Note that this method gets called repeatedly on every access attempt so it
 * must be very efficient.
 *
 * @param db       The main DB instance.
 * @param repoPath Path to the repository being accessed.
 * @param itemKey  The key being accessed.
 * @param session  The session requesting access.
 * @param op       The access type being made.
 *
 * @returns true if access is granted, false otherwise.
 */
export type AuthRule = (
  db: GoatDB,
  repoPath: string,
  itemKey: string,
  session: Session,
  op: AuthOp,
) => boolean;

/**
 * An array of authentication rules for the full DB. The DB scans these rules
 * and will use the first one that matches the repository's path.
 */
export type AuthConfig = {
  path: RegExp | string;
  rule: AuthRule;
}[];

export interface DBConfig {
  /**
   * Absolute path to the directory that'll store the DB's data.
   */
  path: string;
  /**
   * Authorization rules for this DB instance. If not provided, all data is
   * considered public.
   */
  authRules?: AuthConfig;
  /**
   * Optional organization id used to sandbox the data of a specific
   * organization in a multi-tenant deployment. Defaults to "localhost".
   */
  orgId?: string;
  /**
   * Absolute URLs of peers to sync with. Peers are must share the same
   * public/private root keys of this instance.
   */
  peers?: string | Iterable<string>;
  /**
   * The schema manager to use for this DB instance.
   * Defaults to `SchemaManger.default`.
   */
  schemaManager?: SchemaManager;
}

export type OpenOptions = Omit<RepositoryConfig, 'storage' | 'authorizer'>;

export class GoatDB {
  readonly orgId: string;
  readonly path: string;
  readonly schemaManager: SchemaManager;
  readonly queryPersistence?: QueryPersistence;
  private readonly _settingsProvider: DBSettingsProvider;
  private readonly _repositories: Map<string, Repository>;
  private readonly _openPromises: Map<string, Promise<Repository>>;
  private readonly _files: Map<string, JSONLogFile>;
  private readonly _peerURLs: string[] | undefined;
  private readonly _repoClients: Map<string, RepoClient[]> | undefined;
  private readonly _items: Map<string, ManagedItem>;
  private readonly _openQueries = new Map<
    string,
    Query<Schema, Schema, ReadonlyJSONValue>
  >();
  private readonly _authConfig: AuthConfig;
  private _trustPool: TrustPool | undefined;
  private _syncSchedulers: SyncScheduler[] | undefined;

  constructor(config: DBConfig) {
    startJSONLogWorkerIfNeeded();
    this.path = config.path;
    this.schemaManager = config.schemaManager || SchemaManager.default;
    this._settingsProvider =
      typeof self.Deno === 'undefined'
        ? new IDBSettings()
        : new FileSettings(this.path);
    this.orgId = config?.orgId || 'localhost';
    this._authConfig = config.authRules || [];
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
      this._repoClients = new Map();
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
    const repo = this.repository(repoId);
    if (!repo) {
      return;
    }
    await this.flush(path);
    for (const client of this._repoClients?.get(repoId) || []) {
      client.close();
    }
    this._repoClients?.delete(repoId);
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
   * @returns         A managed item that tracks both local and remote edits.
   */
  item<S extends Schema>(...pathComps: string[]): ManagedItem<S> {
    const path = itemPathNormalize(pathComps.join('/'));
    let item = this._items.get(path);
    if (!item) {
      item = new ManagedItem(this, path);
      this._items.set(path, item);
    }
    return item as unknown as ManagedItem<S>;
  }

  /**
   * Creates a new item at the target repository, opening it if needed. Unlike
   * `GoatDB.item()` there's no need to explicitly open a repository before
   * creating items in it. Newly created items become immediately available for
   * use and will get committed to the underlying repo after open completes.
   *
   * @param repoPath Path to the repository in which to create the item/
   * @param schema   The schema to create the item with.
   * @param data     The initial data to populate the item with.
   * @returns        The newly created managed item.
   */
  create<S extends Schema>(
    repoPath: string,
    schema: S,
    data: Partial<SchemaDataType<S>>,
  ): ManagedItem<S> {
    const path = itemPath(...Repository.parseId(repoPath), uniqueId());
    let item = this._items.get(path);
    if (!item) {
      item = new ManagedItem(this, path);
      this._items.set(path, item);
      item.schema = schema;
      item.setMulti(data);
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
   * @param path   The path for the item to create.
   * @param schema The schema to create the item with.
   * @param data   The initial data for the item.
   */
  async load<S extends Schema>(
    path: string,
    schema: S,
    data: SchemaDataType<S>,
  ): Promise<void> {
    const repo = await this.open(path);
    let key = itemPathGetPart(path, ItemPathPart.Item);
    if (key.length <= 0) {
      key = uniqueId();
    }
    await repo.setValueForKey(
      key,
      new Item<S>(
        {
          schema,
          data,
        },
        this.schemaManager,
      ),
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
   * @returns    The number of items found or -1.
   */
  count(path: string): number {
    path = itemPathNormalize(path);
    const repoId = itemPathGetRepoId(path);
    return this.repository(repoId)?.storage.numberOfKeys() || -1;
  }

  /**
   * Returns the keys at the specified path.
   *
   * NOTE: Currently only paths to repositories are supported.
   *
   * @param path Full path to a repository.
   * @returns    The keys at the specified path.
   */
  keys(path: string): Iterable<string> {
    path = itemPathNormalize(path);
    const repoId = itemPathGetRepoId(path);
    return this.repository(repoId)?.keys() || [];
  }

  /**
   * Open a new query or access an already open one. Once opened, the query
   * remains open until explicitly closed, and tracks updates to items as they
   * happen.
   *
   * @param config The configuration for the desired query.
   * @returns      A live query instance.
   */
  query<IS extends Schema, CTX extends ReadonlyJSONValue, OS extends IS = IS>(
    config: Omit<QueryConfig<IS, OS, CTX>, 'db'>,
  ): Query<IS, OS, CTX> {
    let id = config.id;
    if (!id) {
      id = md51(
        (config.predicate !== undefined
          ? config.predicate.toString()
          : 'undefined') + config.sortDescriptor?.toString(),
      );
    }
    let q = this._openQueries.get(id);
    if (!q) {
      q = new Query({ ...config, db: this }) as unknown as Query<
        Schema,
        Schema,
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

  /**
   * Flushes all pending writes for the given repository to disk. Use this
   * method when you must ensure all previously known commits are written to the
   * local disk.
   *
   * @param path Path to the desired repository.
   * @returns    A promise that resolves after all commits have been flushed to
   *             disk.
   */
  flush(path: string): Promise<void> {
    path = itemPathNormalize(path);
    const fileEntry = this._files.get(itemPathGetRepoId(path));
    return fileEntry ? JSONLogFileFlush(fileEntry) : Promise.resolve();
  }

  /**
   * Returns the requested repository or undefined if it wasn't opened yet.
   *
   * Note: Prefer to use the higher level APIs of this class rather than the
   * repository instance directly.
   *
   * @param path A full path or path components.
   * @returns    The repository instance or undefined.
   */
  repository(...pathComps: string[]): Repository | undefined {
    return this._repositories.get(
      Repository.normalizePath(pathComps.join('/')),
    );
  }

  /**
   * Returns the trust pool of this DB instance. The trust pool is a low level
   * object that manages all known sessions and their public keys. It is used
   * to verify the authenticity of the underlying commit graph before persisting
   * it to the local storage.
   *
   * Note: You almost never need to use the trust pool directly.
   *
   * @returns The trust pool of this DB instance.
   */
  async getTrustPool(): Promise<TrustPool> {
    if (await this.createTrustPoolIfNeeded()) {
      // Open /sys/sessions so all known sessions are properly loaded into our
      // new trust pool
      await this.open('/sys/sessions');
      // Open /sys/users so we can perform login and basic operations without
      // waiting
      await this.open('/sys/users');
    }
    return this._trustPool!;
  }

  clientsForRepo(...pathComps: string[]): Iterable<RepoClient> {
    const repoId = Repository.normalizePath(pathComps.join('/'));
    return this._repoClients?.get(repoId) || [];
  }

  private async createTrustPoolIfNeeded(): Promise<boolean> {
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
            new SyncScheduler(
              url,
              syncConfig,
              this._trustPool!,
              this.orgId,
              this.schemaManager,
            ),
        );
      }
      return true;
    }
    return false;
  }

  private async _openImpl(
    repoId: string,
    opts?: OpenOptions,
  ): Promise<Repository> {
    await BloomFilter.initNativeFunctions();
    repoId = Repository.normalizePath(repoId);
    let trustPool: TrustPool;
    // Special Case: skip the call to loadSysSessions() when loading user
    // related repos to avoid a loop.
    if (repoId === '/sys/sessions' || repoId === '/sys/users') {
      await this.createTrustPoolIfNeeded();
      trustPool = this._trustPool!;
    } else {
      trustPool = await this.getTrustPool();
    }
    const repo = new Repository(this, repoId, trustPool, {
      ...opts,
      authorizer: authRuleForRepo(repoId, this._authConfig),
    });
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
      const commits = Commit.fromJSArr(this.orgId, entries, this.schemaManager);
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
      this._repoClients!.set(repoId, clients);
    }
    return repo;
  }
}

function relativePathForRepo(repoId: string): string {
  const [storage, id] = Repository.parseId(Repository.normalizePath(repoId));
  return path.join(storage, id + '.jsonl');
}

const kBuiltinAuthRules: AuthConfig = [
  {
    path: '/sys/users',
    rule: (_db, _repoPath, itemKey, session, op) => {
      if (session.owner === 'root') {
        return true;
      }
      if (session.owner === itemKey) {
        return true;
      }
      return op === 'read';
    },
  },
  {
    path: '/sys/sessions',
    rule: (_db, _repoPath, _itemKey, session, op) => {
      if (session.owner === 'root') {
        return true;
      }
      return op === 'read';
    },
  },
  // Reserving /sys/* for the system's use
  {
    path: /[/]sys[/]\S*/g,
    rule: (_db, _repoPath, _itemKey, session, _op) => {
      return session.owner === 'root';
    },
  },
] as const;

function authRuleForRepo(
  repoPath: string,
  config: AuthConfig,
): AuthRule | undefined {
  const id = Repository.normalizePath(repoPath);
  // Builtin rules override user-provided ones
  for (const { path, rule } of kBuiltinAuthRules) {
    if (path === id) {
      return rule;
    }
  }
  // Look for a user-provided rule
  for (const { path, rule } of config) {
    if (typeof path === 'string') {
      if (Repository.normalizePath(path) === id) {
        return rule;
      }
    } else {
      path.lastIndex = 0;
      if (path.test(repoPath)) {
        return rule;
      }
    }
  }
}
