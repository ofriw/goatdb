/**
 * Here you'll find a convenience implementation of Non-Preemptive Multitasking
 * https://en.wikipedia.org/wiki/Cooperative_multitasking aka Coroutines.
 *
 * At the heart of a coroutine sits a Generator, which is the native mechanism
 * for voluntarily jumping between execution contexts. A generator is then
 * wrapped by a Coroutine instance which manages its thread-like state of
 * executing. It also exposes itself as a Promise which further simplifies
 * real world interactions.
 *
 * Finally the CoroutineScheduler manages a pool of concurrently running
 * coroutines. Every event loop cycle the scheduler executes some coroutines
 * while watching the clock. After kSchedulerCycleTimeMs it'll stop execution
 * and return control to the browser's event loop. This has the apparent effect
 * of threads running concurrently to the main UI thread in a true shared memory
 * model.
 */

import { NextEventLoopCycleTimer, Timer } from './timer.ts';

// Hopefully the UI is running at 60 fps
const kSingleFrameMs = 1000 / 60;
// 1/3 of a frame every event loop cycle
const kSchedulerCycleTimeMs = kSingleFrameMs / 3;

/**
 * Coroutines wrapped as promises support cancellation out of the box
 */
export interface CancellablePromise<T> extends Promise<T> {
  /**
   * Registers a cancellation request with the running coroutine.
   */
  cancel(): void;

  cancelImmediately(): void;
}

let gActiveCoroutine: Coroutine | undefined;

export class Coroutine<T = unknown> {
  readonly name: string | undefined;
  private readonly _generator: Generator<T, T>;
  private _doneHandler: (v: T | undefined) => void;
  private _timeSpentMs: number;
  private _completed: boolean;
  private _cancelled = false;
  private _value: T | undefined;

  /**
   * Pack a generator as a Coroutine instance. This method is designed be used
   * from within a scheduler, and not as a general use.
   *
   * @param id   The id of this routine, as assigned by the scheduler.
   *
   * @param g    The underlying generator.
   *             Values yielded or returned are ignored.
   *
   * @param name An optional name for identifying this coroutine in logs.
   *
   * @returns A new Coroutine instance and an accompanying promise that wraps
   *          it.
   */
  static pack<T = unknown>(
    id: number,
    g: Generator<T, T>,
    name?: string,
  ): [Coroutine<T>, CancellablePromise<T>] {
    let resolve: (v: T | undefined) => void;
    const promise = new Promise<T>((res) => {
      resolve = res as (v: T | undefined) => void;
    });
    const coroutine = new Coroutine<T>(id, g, resolve!, name);
    (promise as CancellablePromise<T>).cancel = () => coroutine.cancel();
    (promise as CancellablePromise<T>).cancelImmediately = () =>
      coroutine.cancelImmediately();
    return [coroutine, promise as CancellablePromise<T>];
  }

  /**
   * Returns the currently executing Coroutine.
   *
   * @returns The current coroutine or undefined if called outside a coroutine.
   */
  static current<X>(): Coroutine<X> | undefined {
    return gActiveCoroutine as Coroutine<X>;
  }

  /**
   * Initializes a new Coroutine.
   *
   * @param id          The id of this routine, as assigned by the scheduler.
   *
   * @param generator   The underlying generator.
   *                    Values yielded or returned are ignored.
   *
   * @param doneHandler An optional handler that'll be called once this
   *                    coroutine transitions to a done status. This handler is
   *                    called at most once.
   *
   * @param name        An optional name for identifying this coroutine in logs.
   */
  constructor(
    readonly id: number,
    generator: Generator<T, T>,
    doneHandler: (v: T | undefined) => void,
    name?: string,
  ) {
    this._generator = generator;
    this._doneHandler = doneHandler;
    this._timeSpentMs = 0;
    this._completed = false;
    this.name = name;
  }

  /**
   * Returns whether this routine has completed its execution and returned
   * control to its caller. A completed coroutine will never be executed again
   * as the underlying generator had been exhausted.
   */
  get completed(): boolean {
    return this._completed;
  }

  /**
   * Returns true after a call to cancel() had been made. It's up to the
   * executing code to periodically check this flag and exit early if possible.
   * This is done to provide the running code a chance to run any needed
   * cleanups before cancelling.
   */
  get cancelled(): boolean {
    return this._cancelled;
  }

  /**
   * Returns whether this routine should run in a future iteration of a
   * scheduler. Code inside the a running coroutine may use this flag to guard
   * against all kinds of edge cases like this:
   * `
   * if (Coroutine.current()?.shouldRun !== true) {
   *    // run any cleanups here
   *    return;
   * }
   * `
   */
  get shouldRun(): boolean {
    return !this.completed && !this.cancelled;
  }

  /**
   * Returns the last yielded value from the underlying generator, or its return
   * value on completion.
   */
  get value(): T | undefined {
    return this._value;
  }

  /**
   * Registers a cancellation request with the running code, which may respect
   * it or not. This is the preferred method for cancelling coroutines, since
   * it gives the executing code a chance to run cleanups before exiting.
   */
  cancel(): void {
    this._cancelled = true;
  }

  /**
   * Cancels this coroutine immediately, causing it to never execute again.
   * If called from within the running coroutine, this method makes the next
   * `yield` act the same as `return`.
   *
   * @warning This method doesn't give the running code chance to do any
   *          cleanups and thus must be used with care. Prefer to use `cancel()`
   *          when possible.
   */
  cancelImmediately(): void {
    if (this._completed) {
      return;
    }
    this._completed = true;
    this._cancelled = true;
    this._doneHandler(this.value);
  }

  /**
   * Although this method is public, it shouldn't be called directly unless
   * you're building an alternative scheduler.
   *
   * Each call to this method runs the underlying generator until its next call
   * to `yield` or `return`.
   */
  run(): void {
    if (this._completed) {
      return;
    }
    gActiveCoroutine = this as Coroutine<unknown>;
    const res = this._generator.next();
    gActiveCoroutine = undefined;
    this._value = res.value;
    if (res.done === true) {
      this._completed = true;
      this._doneHandler(this.value);
    }
  }

  /**
   * Compare two coroutines to determine their execution order. Used by
   * schedulers to order running coroutines.
   *
   * @param other The Coroutine to compare to.
   *
   * @returns A positive number if `other` needs to be executed before `this`,
   *          a negative number if `this` needs to be executed before `other`,
   *          zero if the execution order is undetermined.
   */
  compare(other: Coroutine): number {
    if (other === this) {
      return 0;
    }
    // First, prioritize by time spent running. We prioritize routines that
    // spent less time running, to avoid starvation of short lived routines.
    //
    // NOTE: Due to security concerns, our actual measuring accuracy is actually
    // limited to about 1-2ms, thus this is more of a rough estimation than
    // an accurate running time.
    const dt = Math.round(other._timeSpentMs - this._timeSpentMs);
    if (dt !== 0) {
      return dt;
    }
    // If running times are the same, place newer routines (larger ids) before
    // older ones (smaller ids), again to avoid starvation.
    return other.id - this.id;
  }

  /**
   * Used by a scheduler to increase the running time of this routine.
   *
   * @param dt Number of milliseconds of execution to add.
   */
  appendExecutionTime(dt: number): void {
    this._timeSpentMs += dt;
  }
}

function compareCoroutines(c1: Coroutine, c2: Coroutine): number {
  return c1.compare(c2);
}

/**
 * Schedulers support a few priority values that better allow them to prioritize
 * coroutines.
 */
export enum SchedulerPriority {
  /**
   * Default priority. Use for Coroutines that directly tie to user
   * interactions. Whenever a `Normal` Coroutine is scheduled, it temporarily
   * pauses all `Background` Coroutines.
   *
   */
  Normal = 0,
  /**
   * Reduced priority for tasks that don't need to be urgently finished and
   * take longer to complete. Background coroutines are executed only after all
   * `Normal` priority coroutines finished executing.
   */
  Background,
  _Count,
}

/**
 * An abstract definition of a Coroutine scheduler.
 */
export interface Scheduler {
  schedule<T>(
    g: Generator<T, T>,
    priority?: SchedulerPriority,
    name?: string,
  ): CancellablePromise<T>;
}

/**
 * A basic scheduler. It executes Coroutines concurrently, by their time spent
 * and age, and ticks in every event loop cycle.
 *
 * NOTE: You may have as many scheduler instances as you'd like, but you'll
 * have to tune their cycle times so they don't slow down the UI and cause
 * dropped frames. The current implementation is tuned for a single, shared,
 * scheduler.
 */
export class CoroutineScheduler implements Scheduler {
  private readonly _timer: Timer;
  private readonly _cycleTimeMs: number;
  private _scheduledCoroutines: Coroutine<unknown>[][]; // priority -> Coroutine[]
  private _coroutineId: number;
  private _tickCount = 0;

  /**
   * @returns The default, shared, scheduler instance.
   */
  static sharedScheduler(): CoroutineScheduler {
    return kSharedScheduler;
  }

  /**
   * Initializes a new scheduler.
   *
   * @param cycleTimeMs A time limit, in milliseconds, for a single execution
   *                    cycle after which the scheduler will return control
   *                    to the browser's event loop. You only need to change
   *                    this value if you have more than one scheduler.
   */
  constructor(cycleTimeMs = kSchedulerCycleTimeMs) {
    this._cycleTimeMs = cycleTimeMs;
    this._scheduledCoroutines = [];
    for (let priority = 0; priority < SchedulerPriority._Count; ++priority) {
      this._scheduledCoroutines.push([]);
    }
    this._timer = new NextEventLoopCycleTimer(() => this.tick());
    this._coroutineId = 0;
  }

  /**
   * Execute coroutines in a loop until the time limit reaches or no coroutines
   * are left in the queue.
   *
   * @param queue The queue of pending coroutines.
   *
   * @param timeLimitMs A soft time limit for execution.
   *
   * NOTE: Browsers limit our time measuring accuracy for security reasons.
   *       This combined with the cooperative nature of our coroutines makes
   *       the time limit a very soft one. Choosing the value too high will
   *       cause UI lag, while choosing too low causes unneeded overhead and
   *       slower completion of the queue (from a wall clock perspective).
   */
  private _executeFromQueue(queue: Coroutine[], timeLimitMs: number): void {
    const startTime = getRelativeTimestamp();
    const executedCoroutines = new Set<Coroutine>();
    // Sort our queue to reflect the correct execution order.
    queue.sort(compareCoroutines);
    // Run for as long as we have work to do and time to do it
    while (
      queue.length > 0 &&
      getRelativeTimestamp() - startTime < timeLimitMs
    ) {
      const c = queue.shift()!;
      c.run();
      executedCoroutines.add(c);
      if (!c.completed) {
        queue.push(c);
      }
    }
    // Since we have very poor time measuring accuracy, we instead estimate
    // an average execution time for all Coroutines that did something in this
    // cycle. While not the most accurate, it's good enough to provide a
    // relatively fair execution plan.
    const avgRunningTime =
      (getRelativeTimestamp() - startTime) / executedCoroutines.size;
    for (const c of executedCoroutines) {
      c.appendExecutionTime(avgRunningTime);
    }
  }

  /**
   * Do a single "tick" in this event loop cycle. This executed any schedules
   * routines.
   *
   * @returns true if executed something, false if no Coroutines are scheduled.
   */
  private tick(): boolean {
    if (this._tickCount !== 0) {
      this._tickCount = (this._tickCount + 1) % 3;
      return true;
    }
    ++this._tickCount;
    const normalStartTime = getRelativeTimestamp();
    const normalQueue = this._scheduledCoroutines[SchedulerPriority.Normal];
    const backgroundQueue =
      this._scheduledCoroutines[SchedulerPriority.Background];
    this._executeFromQueue(normalQueue, this._cycleTimeMs);
    const backgroundRunTime =
      this._cycleTimeMs - (getRelativeTimestamp() - normalStartTime);
    if (backgroundRunTime > 0) {
      this._executeFromQueue(backgroundQueue, backgroundRunTime);
    }
    return normalQueue.length > 0 || backgroundQueue.length > 0;
  }

  /**
   * Schedules a generator as a coroutine, and returns a promise for its
   * execution.
   *
   * @param g The generator to wrap as Coroutine.
   *
   * @param priority The desired execution priority.
   *
   * @param name An optional name used for debugging and logging.
   *
   * @returns A cancellable promise for the coroutine.
   */
  schedule<T = unknown>(
    g: Generator<T, T>,
    priority: SchedulerPriority = SchedulerPriority.Normal,
    name?: string,
  ): CancellablePromise<T> {
    const [coroutine, promise] = Coroutine.pack<T>(
      ++this._coroutineId,
      g,
      name,
    );
    const queue = this._scheduledCoroutines[priority];
    queue.push(coroutine as Coroutine<unknown>);
    this._timer.schedule();
    return promise;
  }

  /**
   * Maps the given iterator to an array using the mapper function.
   * The resulting coroutine may be cancelled safely at any time, and its result
   * will contain a partial array up to the cancellation point.
   *
   * @param iter The iterable to map.
   * @param mapper The mapping function.
   * @param priority The priority for the newly created coroutine.
   * @param name An optional name for the newly created coroutine.
   *
   * @returns A cancelable promise for the newly scheduled coroutine.
   */
  map<T, O = T>(
    iter: Iterable<T>,
    mapper: (v: T) => O,
    priority = SchedulerPriority.Normal,
    name?: string,
    skipErrors = false,
  ): CancellablePromise<O[]> {
    return this.schedule(
      mapGenerator(iter, mapper, skipErrors),
      priority,
      name,
    );
  }

  /**
   * Runs the given function concurrently on all values.
   * The resulting coroutine may be cancelled safely at any time.
   *
   * @param iter The iterable to map.
   * @param mapper The mapping function.
   * @param priority The priority for the newly created coroutine.
   * @param name An optional name for the newly created coroutine.
   *
   * @returns A cancelable promise for the newly scheduled coroutine.
   */
  forEach<T>(
    iter: Iterable<T>,
    func: (v: T) => void,
    priority = SchedulerPriority.Normal,
    name?: string,
  ): CancellablePromise<void> {
    return this.schedule(forEach(iter, func), priority, name);
  }
}

const kSharedScheduler = new CoroutineScheduler();

function* mapGenerator<T, O = T>(
  iter: Iterable<T>,
  mapper: (v: T) => O,
  skipErrors: boolean,
): Generator<O[], O[]> {
  const result: O[] = [];
  for (const v of iter) {
    if (skipErrors) {
      try {
        result.push(mapper(v));
      } catch (_: unknown) {}
    } else {
      result.push(mapper(v));
    }
    yield result;
  }
  return result;
}

function* forEach<T>(iter: Iterable<T>, func: (v: T) => void): Generator<void> {
  let i = 0;
  for (const v of iter) {
    func(v);
    if (++i === 20) {
      yield;
      i = 0;
    }
  }
}

/**
 * While CoroutineScheduler executes coroutines concurrently, sometimes you need
 * serial execution of a specific list of coroutines. CoroutineQueue enables
 * just that - a serial execution queue of coroutines.
 *
 * Coroutines scheduled with a CoroutineQueue are executed one at a time, in
 * the order in which they were scheduled. A new coroutine will start execution
 * only after the previously scheduled coroutine had completed execution.
 *
 * This class relies on an underlying scheduler for the actual execution. The
 * queue appears as a single, potentially long running, coroutine for the
 * underlying scheduler and thus uses a single, fixed, priority for the queue.
 */
export class CoroutineQueue implements Scheduler {
  readonly scheduler: Scheduler;
  readonly priority: SchedulerPriority;
  private readonly _queue: Coroutine[];
  private _id: number;

  /**
   * Initialize a new serial execution queue.
   *
   * @param scheduler The scheduler in which this entire queue will be
   *                  scheduled. If not provided, the shared CoroutineScheduler
   *                  instance will be used.
   *
   * @param priority  The execution priority for this entire queue.
   */
  constructor(
    scheduler?: Scheduler,
    priority: SchedulerPriority = SchedulerPriority.Normal,
  ) {
    this.scheduler = scheduler || CoroutineScheduler.sharedScheduler();
    this.priority = priority;
    this._queue = [];
    this._id = 0;
  }

  /**
   * Returns the number of coroutines currently scheduled in this queue.
   */
  get size(): number {
    return this._queue.length;
  }

  /**
   * Schedules (appends) a new coroutine to this queue.
   *
   * @param g The generator to wrap as Coroutine.
   *
   * @param _priority Ignored. The scheduled coroutine uses the queue's priority
   *                  regardless of the provided value.
   *
   * @param name An optional name used for debugging and logging.
   *
   * @returns A cancellable promise for the coroutine.
   */
  schedule<T = unknown>(
    g: Generator<T, T>,
    _priority?: SchedulerPriority,
    name?: string,
  ): CancellablePromise<T> {
    const [coroutine, promise] = Coroutine.pack<T>(++this._id, g, name);
    this._queue.push(coroutine as Coroutine<unknown>);
    if (this._queue.length === 1) {
      this.scheduler.schedule(this._workCoroutine(), this.priority);
    }
    return promise;
  }

  private *_workCoroutine(): Generator<void> {
    for (
      let coroutine = this._queue.pop();
      coroutine !== undefined;
      coroutine = this._queue.pop()
    ) {
      while (!coroutine.completed) {
        coroutine.run();
        yield;
      }
    }
  }
}

const kTimestampReadingThrottle = 150;
let gTimestampCounter = 0;
let gPrevTimestamp = 0;

/**
 * It turns out that we're calling performance.now() a lot, which makes the
 * cost of the call relatively high compared to the time spent doing actual
 * work. To avoid this, we sample the clock once every K calls, and return the
 * cached value otherwise.
 *
 * @returns A monotonically increasing value, in milliseconds, of execution
 *          time. The time origin is left as an implementation detail and
 *          shouldn't be counted on.
 */
function getRelativeTimestamp(): number {
  if (gTimestampCounter === 0) {
    gPrevTimestamp = Math.max(performance.now(), gPrevTimestamp);
  }
  gTimestampCounter = (gTimestampCounter + 1) % kTimestampReadingThrottle;
  return gPrevTimestamp;
}
