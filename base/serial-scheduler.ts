import { NextEventLoopCycleTimer } from './timer.ts';

export class SerialScheduler {
  private static readonly _namedSchedulers = new Map<string, SerialScheduler>();
  private readonly _timer: NextEventLoopCycleTimer;
  private readonly _pendingFunctions: (() => Promise<unknown>)[];

  constructor() {
    this._timer = new NextEventLoopCycleTimer(() =>
      this.processPendingFunctions(),
    );
    this._pendingFunctions = [];
  }

  static get(name: string): SerialScheduler {
    let scheduler = this._namedSchedulers.get(name);
    if (!scheduler) {
      scheduler = new this();
      this._namedSchedulers.set(name, scheduler);
    }
    return scheduler;
  }

  private async processPendingFunctions(): Promise<void> {
    const nextFn = this._pendingFunctions.shift();
    if (nextFn) {
      try {
        await nextFn();
      } finally {
        if (this._pendingFunctions.length) {
          this._timer.schedule();
        }
      }
    }
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    let resolve, reject;
    const result = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const wrapper = async () => {
      try {
        resolve!(await fn());
      } catch (err: unknown) {
        reject!(err);
      }
    };
    this._pendingFunctions.push(wrapper);
    this._timer.schedule();
    return result;
  }
}

export class MultiSerialScheduler {
  private static readonly _namedSchedulers = new Map<
    string,
    MultiSerialScheduler
  >();
  private readonly _schedulers: SerialScheduler[];
  private _runCount = 0;

  static get(name: string, concurrency?: number): MultiSerialScheduler {
    let scheduler = this._namedSchedulers.get(name);
    if (!scheduler) {
      scheduler = new this(concurrency);
      this._namedSchedulers.set(name, scheduler);
    }
    return scheduler;
  }

  get concurrency(): number {
    return this._schedulers.length;
  }

  constructor(concurrency?: number) {
    if (!concurrency) {
      concurrency = navigator.hardwareConcurrency;
    }
    this._schedulers = [];
    for (let i = 0; i < concurrency; ++i) {
      this._schedulers.push(new SerialScheduler());
    }
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    const scheduler = this._schedulers[this._runCount];
    this._runCount = (this._runCount + 1) % this._schedulers.length;
    return scheduler.run(fn);
  }
}
