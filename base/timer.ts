import { assert } from './error.ts';
import { easeInExpo, easeInOutSine } from './time.ts';
import { SortedQueue } from './collections/queue.ts';

const MAX_TIMER_PROCESSING_MS = 30;

const gScheduledTimers = new SortedQueue<BaseTimer>(
  (t1: BaseTimer, t2: BaseTimer) => t1.compare(t2),
);
let gTimerTicker: number | undefined;
let gTimerId = 0;

function startTimerTickerIfNeeded(): void {
  if (!gTimerTicker && gScheduledTimers.size > 0) {
    gTimerTicker = setInterval(() => {
      const startTime = performance.now();

      for (
        let now = performance.now();
        now - startTime <= MAX_TIMER_PROCESSING_MS;
        now = performance.now()
      ) {
        if (
          gScheduledTimers.size > 0 &&
          gScheduledTimers.peek!.nextFireTimestamp <= now
        ) {
          const timer = gScheduledTimers.pop();
          assert(timer !== undefined);
          assert(!gScheduledTimers.has(timer!));
          timer!.fire();
        } else {
          break;
        }
      }
    }, 20);
  }
}

function stopTimerTickerIfNeeded() {
  if (gTimerTicker && gScheduledTimers.size <= 0) {
    clearInterval(gTimerTicker);
    gTimerTicker = undefined;
  }
}

export interface TimerCallback {
  (timer: Timer): boolean | undefined | void | Promise<void | undefined>;
}

export interface Timer {
  schedule(): Timer;
  unschedule(): Timer;
}

/**
 * An application level timer that internally uses a single setTimeout.
 * This enables holding thousands of active timers without overloading the
 * browser's event loop.
 */
export abstract class BaseTimer implements Timer {
  readonly label: string | undefined;
  private readonly _callback: TimerCallback;
  private readonly _id: number;
  private _nextFireTimestamp: number;
  private _isScheduled: boolean;

  constructor(callback: TimerCallback, label?: string | undefined) {
    this.label = label;
    this._callback = callback;
    this._nextFireTimestamp = 0;
    this._id = gTimerId++;
    this._isScheduled = false;
  }

  get nextFireTimestamp(): number {
    return this._nextFireTimestamp;
  }

  get isScheduled(): boolean {
    return this._isScheduled;
  }

  protected abstract calcNextFireDate(): number;

  compare(other: BaseTimer): number {
    if (other === this) {
      return 0;
    }
    const dt = other._nextFireTimestamp - this._nextFireTimestamp;
    return dt === 0 ? this._id - other._id : dt;
  }

  schedule(): Timer {
    if (gScheduledTimers.has(this)) {
      assert(this._isScheduled);
      return this;
    }
    this._nextFireTimestamp = this.calcNextFireDate();
    gScheduledTimers.push(this);
    assert(!this._isScheduled);
    this._isScheduled = true;
    startTimerTickerIfNeeded();
    return this;
  }

  unschedule(): Timer {
    if (gScheduledTimers.delete(this)) {
      this._isScheduled = false;
    }
    stopTimerTickerIfNeeded();
    return this;
  }

  fire(): void {
    assert(this._isScheduled);
    this._isScheduled = false;
    if (this.run()) {
      this.schedule();
    } else {
      stopTimerTickerIfNeeded();
    }
  }

  protected run(): boolean {
    return this._callback(this) === true;
  }
}

/**
 * A simple fixed timer. It'll fire either once or repeatedly until explicitly
 * unscheduled.
 */
export class SimpleTimer extends BaseTimer {
  private readonly _intervalMs: number;
  private readonly _repeat: boolean;

  static once(
    delayMs: number,
    callback: TimerCallback,
    name?: string,
  ): SimpleTimer {
    return new SimpleTimer(
      delayMs,
      false,
      callback,
      name,
    ).schedule() as SimpleTimer;
  }

  constructor(
    intervalMs: number,
    repeat: boolean,
    callback: TimerCallback,
    name?: string,
  ) {
    super(callback, name);
    this._intervalMs = intervalMs;
    this._repeat = repeat;
  }

  get intervalMs(): number {
    return this._intervalMs;
  }

  protected calcNextFireDate(): number {
    return performance.now() + this._intervalMs;
  }

  protected run(): boolean {
    const result = super.run();
    return this._repeat || result;
  }
}

/**
 * Base timer for timers that dynamically change their fire interval between
 * a specified range.
 */
export abstract class BaseDynamicTimer extends BaseTimer {
  private readonly _durationMs: number;
  private readonly _minFreqMs: number;
  private readonly _maxFreqMs: number;
  private _repeat: boolean;
  private _lastResetTime: number;
  private _lastFireTime: number;

  constructor(
    minFreqMs: number,
    maxFreqMs: number,
    durationMs: number,
    callback: TimerCallback,
    repeat = false,
    name?: string,
    startAtMax?: boolean,
  ) {
    super(callback, name);
    this._lastResetTime = startAtMax === true ? 0 : performance.now();
    this._durationMs = durationMs;
    this._lastFireTime = 0;
    this._minFreqMs = minFreqMs;
    this._maxFreqMs = maxFreqMs;
    this._repeat = repeat;
  }

  abstract timingFunc(f: number): number;

  get minFreqMs(): number {
    return this._minFreqMs;
  }

  get maxFreqMs(): number {
    return this._maxFreqMs;
  }

  get lastTriggerTime(): number {
    return this._lastFireTime;
  }

  get durationMs(): number {
    return this._durationMs;
  }

  get lastResetTime(): number {
    return this._lastResetTime;
  }

  get repeat(): boolean {
    return this._repeat;
  }

  set repeat(flag: boolean) {
    this._repeat = flag;
  }

  reset(): void {
    const scheduled = this.isScheduled;
    if (scheduled) {
      this.unschedule();
    }
    this._lastResetTime = performance.now();
    if (scheduled) {
      this.schedule();
    }
  }

  schedule(): BaseDynamicTimer {
    return super.schedule() as BaseDynamicTimer;
  }

  unschedule(): BaseDynamicTimer {
    return super.unschedule() as BaseDynamicTimer;
  }

  protected run(): boolean {
    const { durationMs, lastResetTime } = this;
    const now = performance.now();
    if (!this.repeat && now - lastResetTime > durationMs) {
      return false;
    }
    this._lastFireTime = now;
    return super.run() || this.repeat;
  }

  protected calcNextFireDate(): number {
    const now = performance.now();
    const { minFreqMs, maxFreqMs, durationMs } = this;
    const f = Math.min(1, (now - this.lastResetTime) / durationMs);
    // Sleep duration between syncs moves gradually from MIN to MAX
    const freqDiff = maxFreqMs - minFreqMs;
    const sleepDur = minFreqMs + this.timingFunc(f) * freqDiff;
    return now + sleepDur;
  }
}

/**
 * A dynamic timer that uses a sine function to adjust its fire interval.
 */
export class EaseInOutSineTimer extends BaseDynamicTimer {
  timingFunc(f: number): number {
    return easeInOutSine(f);
  }
}

export class EaseInExpoTimer extends BaseDynamicTimer {
  timingFunc(f: number): number {
    return easeInExpo(f);
  }
}

/**
 * A timer like implementation of a micro task. This timer fires at the end of
 * the current event loop. The exact fire timing between two micro task timers
 * is undefined.
 */
export class MicroTaskTimer implements Timer {
  private readonly _callback: TimerCallback;
  private _hasScheduledMicrotask: boolean;
  private _scheduled: boolean;

  constructor(callback: TimerCallback) {
    this._callback = callback;
    this._hasScheduledMicrotask = false;
    this._scheduled = false;
  }

  schedule(): Timer {
    if (this._scheduled) {
      return this;
    }
    this._scheduled = true;
    // The caller is allowed to do crazy calls like
    //     schedule();
    //     unschedule();
    //     schedule();
    // Instead of blindly queueing a microtask, we keep track of whether we
    // have a queued task or not and enqueue it only when needed.
    if (!this._hasScheduledMicrotask) {
      queueMicrotask(() => {
        this._hasScheduledMicrotask = false;
        // Trigger our callback only if we're still scheduled by the time this
        // microtask executes.
        if (this._scheduled) {
          this._scheduled = false;
          if (this._callback(this) === true) {
            this.schedule();
          }
        }
      });
      this._hasScheduledMicrotask = true;
    }
    return this;
  }

  unschedule(): Timer {
    // At the time of this writing there's no API for cancelling a queued
    // microtask. To simulate it, we simply flip off our scheduled flag. When
    // the microtask it'll simply be a NOP.
    this._scheduled = false;
    return this;
  }
}

let gScheduledNextEventLoopCycleTimers: NextEventLoopCycleTimer[] = [];
let gScheduledTimeoutHandler: number | undefined;

function processPendingNextEventLoopTimers(): void {
  const scheduledTimers = gScheduledNextEventLoopCycleTimers;
  gScheduledNextEventLoopCycleTimers = [];
  gScheduledTimeoutHandler = undefined;
  for (const timer of scheduledTimers) {
    timer._fire();
  }
}

/**
 * A timer like implementation of a micro task. This timer fires at the end of
 * the current event loop. The exact fire timing between two micro task timers
 * is fuzzy.
 *
 * Prefer to use a CoroutineTimer timer instead of this class as it allows the
 * scheduler to better balance the app's work.
 */
export class NextEventLoopCycleTimer implements Timer {
  private readonly _callback: TimerCallback;
  private _running = false;
  private _scheduleAfterRun = false;

  static run(callback: TimerCallback): () => void {
    const timer = new this(callback);
    timer.schedule();
    return () => timer.unschedule();
  }

  constructor(callback: TimerCallback) {
    this._callback = callback;
  }

  schedule(): Timer {
    if (this._running) {
      this._scheduleAfterRun = true;
      return this;
    }
    this._scheduleAfterRun = false;
    if (gScheduledNextEventLoopCycleTimers.indexOf(this) < 0) {
      gScheduledNextEventLoopCycleTimers.push(this);
      if (gScheduledTimeoutHandler === undefined) {
        gScheduledTimeoutHandler = setTimeout(
          processPendingNextEventLoopTimers,
        );
      }
    }
    return this;
  }

  unschedule(): Timer {
    this._scheduleAfterRun = false;
    const idx = gScheduledNextEventLoopCycleTimers.indexOf(this);
    if (idx >= 0) {
      gScheduledNextEventLoopCycleTimers.splice(idx, 1);
      if (
        gScheduledNextEventLoopCycleTimers.length === 0 &&
        gScheduledTimeoutHandler !== undefined
      ) {
        clearTimeout(gScheduledTimeoutHandler);
        gScheduledTimeoutHandler = undefined;
      }
    }
    return this;
  }

  _fire(): void {
    this._running = true;
    try {
      const res = this._callback(this);
      this._running = false;
      if (res === true || this._scheduleAfterRun) {
        this.schedule();
      }
    } finally {
      this._running = false;
      this._scheduleAfterRun = false;
    }
  }
}
