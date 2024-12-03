export interface Action {
  (): Promise<void>;
}

interface ActionEntry {
  action: Action;
  type: 'action';
}

interface PromiseEntry {
  promise: Promise<void>;
  type: 'promise';
}

type Entry = ActionEntry | PromiseEntry;

export class ParallelExecutor {
  private _queue: Entry[];
  private _concurrency: number;
  private _awaiter?: () => void;

  constructor(concurrency = 20) {
    this._queue = [];
    this._concurrency = concurrency;
  }

  push(action: Action): void {
    const queue = this._queue;
    const idx = queue.length;
    queue.push({ action, type: 'action' });
    this.activate(idx);
  }

  await(): Promise<void> {
    if (this._queue.length === 0) {
      return Promise.resolve();
    }
    return new Promise(res => {
      this._awaiter = res;
    });
  }

  private activate(idx: number): void {
    const concurrency = this._concurrency;
    if (idx >= concurrency) {
      return;
    }
    const queue = this._queue;
    const entry = queue[idx];
    let newEntry: PromiseEntry;
    if (entry.type === 'action') {
      const promise = entry.action().finally(() => {
        queue.splice(queue.indexOf(newEntry), 1);
        if (queue.length >= concurrency) {
          this.activate(concurrency - 1);
        } else {
          this.notifyIfNeeded();
        }
      });
      newEntry = { promise, type: 'promise' };
      queue[idx] = newEntry;
    }
  }

  private notifyIfNeeded(): void {
    if (this._queue.length === 0) {
      const awaiter = this._awaiter;
      if (awaiter !== undefined) {
        this._awaiter = undefined;
        awaiter();
      }
      return;
    }
  }
}
