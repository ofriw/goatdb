import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { slices } from '../../base/array.ts';
import { filterIterable } from '../../base/common.ts';
import {
  JSONCyclicalEncoder,
  JSONCyclicalDecoder,
} from '../../base/core-types/encoding/json.ts';
import { kSecondMs, kMinuteMs } from '../../base/date.ts';
import { notReached } from '../../base/error.ts';
import { ReadonlyJSONObject } from '../../base/interfaces.ts';
import { SerialScheduler } from '../../base/serial-scheduler.ts';
import { EaseInOutSineTimer } from '../../base/timer.ts';
import { log } from '../../logging/log.ts';
import { getOrganizationId } from '../../net/rest-api.ts';
import { Commit } from '../../repo/commit.ts';
import { Repository } from '../../repo/repo.ts';
import { RepositoryPersistance } from './repo.ts';

const K_DB_VERSION = 1;

interface EncodedCommitContents extends ReadonlyJSONObject {
  r: ReadonlyJSONObject; // Serialized Record instance
}

interface EncodedDeltaCommitContents extends ReadonlyJSONObject {
  b: string; // Base commit id
  e: ReadonlyJSONObject; // Serialized Edit instance
}

interface EncodedCommit extends ReadonlyJSONObject {
  ver: number; // Build number
  id: string;
  k?: string; // key
  s: string; // session
  ts: number; // timestamp
  p?: string[]; // parents
  c: EncodedCommitContents | EncodedDeltaCommitContents;
}

interface RepoPersistanceSchema extends DBSchema {
  commits: {
    key: string;
    value: EncodedCommit;
  };
}

export class IDBPersistance implements RepositoryPersistance {
  private readonly _persistedCommitIds: Set<string>;
  private readonly _backupTimer: EaseInOutSineTimer;
  private _openPromise:
    | Promise<IDBPDatabase<RepoPersistanceSchema>>
    | undefined;

  get isOpen(): boolean {
    return this._openPromise !== undefined;
  }

  constructor(
    readonly orgId: string,
    readonly dbName: string,
    readonly repo: Repository,
  ) {
    this._persistedCommitIds = new Set();
    this._backupTimer = new EaseInOutSineTimer(
      kSecondMs,
      kMinuteMs,
      5 * kMinuteMs,
      async () => {
        let count = 0;
        let batch: Commit[] = [];
        const maxBatchSize = 100;
        const maxBackupCount = 100;
        for (const c of repo.commits()) {
          batch.push(c);
          if (batch.length >= maxBatchSize) {
            count += await this.persistCommits(batch);
            batch = [];
          }
          if (count >= maxBackupCount) {
            break;
          }
        }
        if (count > 0) {
          this._backupTimer.reset();
        }
      },
      true,
      'IDB Background Save',
    );
  }

  private getDBHandle(): Promise<IDBPDatabase<RepoPersistanceSchema>> {
    if (!this._openPromise) {
      this._openPromise = openDB<RepoPersistanceSchema>(
        this.dbName,
        K_DB_VERSION,
        {
          upgrade(db) {
            db.createObjectStore('commits', { keyPath: 'id' });
          },
        },
      );
    }
    return this._openPromise;
  }

  async open(): Promise<AsyncGenerator<Commit[]>> {
    return loadAllCommits(await this.getDBHandle(), this.orgId);
  }

  async close(): Promise<void> {
    if (this._openPromise !== undefined) {
      (await this._openPromise).close();
      this._openPromise = undefined;
    }
  }

  persistCommits(commits: Iterable<Commit>): Promise<number> {
    if (!this.isOpen) {
      return Promise.resolve(0);
    }

    const newCommits = Array.from(
      filterIterable(commits, (c) => !this._persistedCommitIds.has(c.id)),
    );
    if (!newCommits.length) {
      return Promise.resolve(0);
    }
    // return MultiSerialScheduler.get('idb-write', 3).run(() =>
    return SerialScheduler.get(`idb:${this.dbName}`).run(async () => {
      const db = await this.getDBHandle();
      const txn = db.transaction('commits', 'readwrite', {
        durability: 'relaxed',
      });
      const store = txn.objectStore('commits');
      const promises: Promise<void>[] = [];
      let result = 0;
      for (const chunk of slices(
        filterIterable(newCommits, (c) => !this._persistedCommitIds.has(c.id)),
        50,
      )) {
        for (const c of chunk) {
          if (!this.isOpen) {
            txn.abort();
            return result;
          }
          promises.push(
            (async () => {
              try {
                if ((await store.getKey(c.id)) === undefined) {
                  if (!this.isOpen) {
                    return;
                  }
                  await store.put(
                    JSONCyclicalEncoder.serialize(c) as EncodedCommit,
                  );
                  this._persistedCommitIds.add(c.id);
                  ++result;
                }
              } catch (e) {
                this._backupTimer.reset();
                log({
                  severity: 'ERROR',
                  error: 'BackupWriteFailed',
                  message: e.message,
                  trace: e.stack,
                  repo: this.dbName,
                  commit: c.id,
                });
                throw e;
              }
            })(),
          );
        }
      }
      for (const p of promises) {
        await p;
      }
      if (result > 0) {
        txn.commit();
      }
      // else {
      //   txn.abort();
      // }
      await txn.done;
      // db.close();
      return result;
    });
    // );
  }

  sync(): Promise<void> {
    return SerialScheduler.get(`idb:${this.dbName}`).run(() =>
      Promise.resolve(),
    );
  }
}

async function* loadAllCommits(
  db: IDBPDatabase<RepoPersistanceSchema>,
  orgId: string,
): AsyncGenerator<Commit[]> {
  const txn = db.transaction('commits', 'readonly', {
    durability: 'relaxed',
  });
  let commits: Commit[] = [];
  for await (const cursor of txn.store) {
    try {
      commits.push(
        new Commit({
          decoder: JSONCyclicalDecoder.get(cursor.value),
          orgId,
        }),
      );
      if (commits.length >= 500) {
        yield commits;
        commits = [];
      }
    } catch (err: unknown) {}
  }
  if (commits.length > 0) {
    yield commits;
  }
}
