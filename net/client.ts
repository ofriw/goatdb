import { EaseInExpoTimer, EaseInOutSineTimer } from '../base/timer.ts';
import { BloomFilter } from '../base/bloom.ts';
import { SyncMessage } from './message.ts';
import { log } from '../logging/log.ts';
import { MovingAverage } from '../base/math.ts';
import {
  SyncConfig,
  syncConfigGetCycles,
  SyncPriority,
  SyncScheduler,
} from './sync-scheduler.ts';
import { Repository } from '../repo/repo.ts';
import { randomInt } from '../base/math.ts';
import { Emitter } from '../base/emitter.ts';
import { Commit } from '../repo/commit.ts';
import { SchemaManager } from '../cfds/base/schema.ts';
import { assert } from '../base/error.ts';

const COMMIT_SUBMIT_RETRY = 10;

export type ClientStatus = 'idle' | 'sync' | 'offline';

export const EVENT_STATUS_CHANGED = 'status_changed';

/**
 * A client implementation for synchronizing a single repository. Multiple
 * clients are tied to a shared SyncScheduler which combines them to bulk sync
 * messages when syncing using the REST API.
 *
 * The REST client is polling based with adaptive timing. Future versions will
 * incorporate a Shoulder Tap using Server-Sent Events so delay is further
 * reduced and network is further optimized.
 */
export class RepoClient extends Emitter<typeof EVENT_STATUS_CHANGED> {
  private readonly _timer: EaseInOutSineTimer;
  private readonly _syncFreqAvg: MovingAverage;
  private _previousServerFilter: BloomFilter | undefined;
  private _previousServerSize: number;
  private _connectionOnline = true;
  private _ready: boolean;
  private _scheduled: boolean;
  private _closed = false;
  private _pendingSyncPromise: Promise<boolean> | undefined;
  private _syncActive = false;
  private _cachedNeedsReplication = false;
  private _requestInProgress = false;
  private readonly _submitCount: Map<string, number>;

  constructor(
    readonly repo: Repository,
    readonly repoPath: string,
    readonly syncConfig: SyncConfig,
    readonly scheduler: SyncScheduler,
    readonly orgId: string,
    readonly schemaManager = SchemaManager.default,
  ) {
    super();
    this._timer = new EaseInExpoTimer(
      syncConfig.minSyncFreqMs,
      syncConfig.maxSyncFreqMs,
      syncConfig.pollingBackoffDurationMs,
      () => {
        if (!this.ready) {
          return;
        }
        this.sendSyncMessage().catch((e) => {
          log({
            severity: 'INFO',
            error: 'UnknownSyncError',
            message: e.message,
            trace: e.stack,
          });
        });
      },
      true,
      `Sync timer ${repoPath}`,
      // true,
    );
    this._syncFreqAvg = new MovingAverage(
      syncConfigGetCycles(this.syncConfig) * 2,
    );
    this._previousServerSize = 0;
    this._ready = false;
    this._scheduled = false;
    this._submitCount = new Map();
  }

  get serverUrl(): string {
    return this.serverUrl;
  }

  get isOnline(): boolean {
    return this._connectionOnline;
  }

  get status(): ClientStatus {
    if (!this.isOnline) {
      return 'offline';
    }
    return /*this._syncActive ||*/ this.needsReplication() || !this.ready
      ? 'sync'
      : 'idle';
  }

  get previousServerFilter(): BloomFilter | undefined {
    return this._previousServerFilter;
  }

  get previousServerSize(): number {
    return this._previousServerSize;
  }

  get syncCycles(): number {
    return this._syncActive
      ? 1
      : syncConfigGetCycles(this.syncConfig, this._syncFreqAvg.currentValue);
  }

  get ready(): boolean {
    return this._ready && !this.closed;
  }

  set ready(f: boolean) {
    if (f !== this._ready) {
      this._ready = f;
      if (this._scheduled) {
        if (f) {
          this._timer.schedule();
        } else {
          this.stopSyncing();
        }
      }
    }
  }
  get closed(): boolean {
    return this._closed;
  }

  protected getLocalSize(): number {
    return this.repo.numberOfCommits(this.repo.trustPool.currentSession);
  }

  protected buildSyncMessage(
    includeMissing: boolean,
    lowAccuracy?: boolean,
  ): Promise<SyncMessage> {
    const repo = this.repo;
    const session = repo.trustPool.currentSession;
    return SyncMessage.buildAsync(
      this.previousServerFilter,
      this.valuesForMessage(),
      repo.numberOfCommits(session),
      this.previousServerSize,
      this.syncCycles,
      this.orgId,
      this.schemaManager,
      includeMissing,
      lowAccuracy,
    );
  }

  private *valuesForMessage(): Generator<[string, Commit]> {
    const repo = this.repo;
    const counts = this._submitCount;
    const session = repo.trustPool.currentSession;
    for (const c of repo.commits(session)) {
      if ((counts.get(c.id) || 0) < COMMIT_SUBMIT_RETRY) {
        yield [c.id, c];
      }
    }
  }

  *localIds(): Generator<string> {
    const counts = this._submitCount;
    const repo = this.repo;
    const session = repo.trustPool.currentSession;
    for (const c of repo.commits(session)) {
      if ((counts.get(c.id) || 0) < COMMIT_SUBMIT_RETRY) {
        yield c.id;
      }
    }
  }

  protected async persistPeerValues(values: Commit[]): Promise<number> {
    return (await this.repo.persistVerifiedCommits(values)).length;
  }

  private _setIsOnline(value: boolean): void {
    if (value !== this._connectionOnline) {
      this._connectionOnline = value;
      this.emit(EVENT_STATUS_CHANGED);
    }
  }

  startSyncing(): typeof this {
    if (!this._scheduled) {
      this._scheduled = true;
      if (this.ready) {
        this._timer.schedule();
      }
    }
    return this;
  }

  stopSyncing(): typeof this {
    this._timer.unschedule();
    this._timer.reset();
    this._scheduled = false;
    return this;
  }

  private sendSyncMessage(): Promise<boolean> {
    let result = this._pendingSyncPromise;
    if (!result) {
      const promise = this._sendSyncMessageImpl().finally(() => {
        if (this._pendingSyncPromise === promise) {
          this._pendingSyncPromise = undefined;
        }
      });
      result = promise;
      this._pendingSyncPromise = result;
    }
    return result;
  }

  private async _sendSyncMessageImpl(): Promise<boolean> {
    assert(!this._requestInProgress); // Sanity check
    if (this.closed) {
      return false;
    }
    this._requestInProgress = true;
    const startingStatus = this.status;
    let priority = SyncPriority.normal;
    if (this.needsReplication()) {
      priority = SyncPriority.localChanges;
    } else if (!this.ready) {
      priority = SyncPriority.firstLoad;
    }
    const reqMsg = await this.buildSyncMessage(!this._syncActive);

    let syncResp: SyncMessage;
    try {
      syncResp = (await this.scheduler.send(
        this.repoPath,
        reqMsg,
        priority,
      )) as typeof reqMsg;
    } catch (e) {
      log({
        severity: 'INFO',
        error: 'SerializeError',
        value: e.message,
        message: e.message,
        trace: e.stack,
      });
      this._setIsOnline(false);
      this._requestInProgress = false;
      return false;
    }

    this._previousServerFilter = syncResp.filter;
    this._previousServerSize = syncResp.size;

    this.afterMessageSent(reqMsg);

    let persistedCount = 0;
    if (syncResp.values.length) {
      const start = performance.now();
      persistedCount = await this.persistPeerValues(syncResp.values);
      if (randomInt(0, 100) === 0) {
        log({
          severity: 'METRIC',
          name: 'CommitsPersistTime',
          value: performance.now() - start,
          unit: 'Milliseconds',
        });
        log({
          severity: 'METRIC',
          name: 'CommitsPersistCount',
          value: persistedCount,
          unit: 'Count',
        });
      }
    }

    this._requestInProgress = false;
    if (this.closed) {
      return false;
    }

    if (!this._syncActive && (persistedCount > 0 || this.needsReplication())) {
      this.touch();
    }

    // if (persistedCount > 0 || this.needsReplication()) {
    //   this.touch();
    // }
    this._setIsOnline(true);
    if (this.status !== startingStatus) {
      this.emit(EVENT_STATUS_CHANGED);
    }
    return true;
  }

  /**
   * Returns a promise that completes when both peers have reached consensus.
   * This method is probabilistic and fakes the appearance of a steady state
   * between this client and the server. It's intended to be used in back-office
   * and diagnostics tools, and not in app-to-server or server-to-server
   * communication (which rely on indefinite polling loop).
   */
  async sync(): Promise<void> {
    this._syncActive = true;
    try {
      // const syncConfig = this.syncConfig;
      const cycleCount = this.syncCycles;
      // We need to do a minimum number of successful sync cycles in order to make
      // sure everything is sync'ed. Also need to make sure we don't have any
      // local commits that our peer doesn't have (local changes or peer recovery).
      let i = 0;
      do {
        if (await this.sendSyncMessage()) {
          ++i;
        }
      } while (!this.closed && i <= cycleCount /*|| this.needsReplication()*/);
    } finally {
      this._syncActive = false;
    }
  }

  needsReplication(): boolean {
    // if (performance.now() - this._lastComputedNeedsReplication >= 100) {
    const serverFilter = this._previousServerFilter;
    if (!serverFilter) {
      this._cachedNeedsReplication = false;
    } else {
      this._cachedNeedsReplication = false;
      for (const id of this.localIds()) {
        if (!serverFilter.has(id)) {
          this._cachedNeedsReplication = true;
          break;
        }
      }
    }
    //   this._lastComputedNeedsReplication = performance.now();
    // }
    return this._cachedNeedsReplication;
    // const serverFilter = this._previousServerFilter;
    // if (!serverFilter) {
    //   return false;
    // }
    // for (const id of this.localIds()) {
    //   if (!serverFilter.has(id)) {
    //     return true;
    //   }
    // }
    // return false;
  }

  touch(): void {
    if (!this._scheduled || !this.ready) {
      return;
    }
    this._timer.reset();
    this._timer.schedule();
  }

  close() {
    this.stopSyncing();
    this._closed = true;
    this._setIsOnline(false);
  }

  protected afterMessageSent(msg: SyncMessage): void {
    const counts = this._submitCount;
    for (const commit of msg.values) {
      const id = commit.id;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
}
