import { Scheduler, SchedulerPriority } from './coroutine.ts';
import { Timer, TimerCallback } from './timer.ts';

/**
 * An coroutine based implementation of a NextEventLoopCycleTimer. This timer
 * is managed by a CoroutineScheduler, increasing processing responsiveness.
 *
 * Prefer to use this timer over NextEventLoopCycleTimer whenever possible.
 */
export class CoroutineTimer implements Timer {
  private readonly _callback: TimerCallback;
  private _scheduled: boolean;

  constructor(
    readonly scheduler: Scheduler,
    callback: TimerCallback,
    readonly priority: SchedulerPriority = SchedulerPriority.Normal,
    readonly name?: string
  ) {
    this._callback = callback;
    this._scheduled = false;
  }

  schedule(): Timer {
    if (!this._scheduled) {
      this._scheduled = true;
      this.scheduler.schedule(this._run(), this.priority, this.name);
    }
    return this;
  }

  unschedule(): Timer {
    this._scheduled = false;
    return this;
  }

  private *_run(): Generator<void> {
    const callback = this._callback;
    while (true) {
      if (!this._scheduled || callback(this) !== true) {
        this._scheduled = false;
        return;
      }
      yield;
    }
  }
}
