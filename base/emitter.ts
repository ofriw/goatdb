import { NextEventLoopCycleTimer, Timer, TimerCallback } from './timer.ts';

export type EmitterEvent = 'suspended' | 'resumed';

export type EmitterCallback = () => void;

export class Emitter<T extends string> {
  readonly alwaysActive: boolean;
  private readonly _callbacks: Map<string, EmitterCallback[]>;
  private readonly _delayedEmissionTimer?: Timer;
  private _suspendCallbacks: EmitterCallback[];
  private _resumeCallbacks: EmitterCallback[];
  private _pendingEmissions: [event: string, args: unknown[]][];
  private _isMuted = false;
  private _isActive: boolean;

  constructor(
    delayedEmissionTimerConstructor?: (callback: TimerCallback) => Timer,
    alwaysActive?: boolean,
  ) {
    this.alwaysActive = Boolean(alwaysActive);
    this._suspendCallbacks = [];
    this._resumeCallbacks = [];
    this._callbacks = new Map();
    if (delayedEmissionTimerConstructor) {
      this._delayedEmissionTimer = delayedEmissionTimerConstructor(() => {
        const emissions = this._pendingEmissions;
        this._pendingEmissions = [];
        for (const [e, args] of emissions) {
          try {
            this.emitInPlace(e as T, ...args);
          } catch (err: unknown) {
            console.error(`Uncaught error in delayed emission: ${err}`);
          }
        }
      });
    }
    this._pendingEmissions = [];
    if (this.alwaysActive) {
      new NextEventLoopCycleTimer(() => this.resume()).schedule();
    }
    this._isActive = this.calcIsActive();
  }

  private calcIsActive(): boolean {
    return this.alwaysActive || this._callbacks.size > 0;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  emit<E extends T | EmitterEvent>(e: E, ...args: unknown[]): void {
    if (this._isMuted) {
      return;
    }
    if (this._delayedEmissionTimer) {
      this._pendingEmissions.push([e, args]);
      this._delayedEmissionTimer.schedule();
    } else {
      this.emitInPlace(e, ...args);
    }
  }

  private emitInPlace<E extends T | EmitterEvent>(
    e: E,
    ...args: unknown[]
  ): void {
    if (this._isMuted) {
      return;
    }
    let callbacks: EmitterCallback[] | undefined;
    if (e === 'EmitterSuspended') {
      callbacks = this._suspendCallbacks;
    } else if (e === 'EmitterResumed') {
      callbacks = this._resumeCallbacks;
    } else {
      callbacks = this._callbacks.get(e as T);
    }
    if (!callbacks || !callbacks.length) {
      return;
    }
    for (const f of Array.from(callbacks)) {
      (f as (...arg0: unknown[]) => void)(...args);
    }
  }

  // deno-lint-ignore ban-types
  attach<C extends Function, E extends T | EmitterEvent>(
    e: E,
    c: C,
  ): () => void {
    const callback = c as unknown as EmitterCallback;
    if (e === 'EmitterSuspended' || e === 'EmitterResumed') {
      const arr =
        e === 'EmitterSuspended'
          ? this._suspendCallbacks
          : this._resumeCallbacks;
      if (!arr.includes(callback)) {
        arr.push(callback);
      }
      this._isActive = this.calcIsActive();
      return () => this.detach(e, c);
    }
    const wasActive = this.isActive;
    let arr = this._callbacks.get(e as T);
    if (!arr) {
      arr = [];
      this._callbacks.set(e as T, arr);
    }
    if (!arr.includes(callback)) {
      arr.push(callback);
    }
    if (!wasActive) {
      this.resume();
      this.emit('resumed');
    }
    this._isActive = this.calcIsActive();
    return () => this.detach(e, c);
  }

  // deno-lint-ignore ban-types
  detach<C extends Function, E extends T | EmitterEvent>(e: E, c: C): void {
    const callback = c as unknown as EmitterCallback;
    if (e === 'EmitterSuspended' || e === 'EmitterResumed') {
      const arr =
        e === 'EmitterSuspended'
          ? this._suspendCallbacks
          : this._resumeCallbacks;
      const idx = arr.indexOf(callback);
      if (idx >= 0) {
        arr.splice(idx, 1);
      }
      this._isActive = this.calcIsActive();
      return;
    }
    const arr = this._callbacks.get(e as T);
    if (!arr) {
      return;
    }
    const idx = arr.indexOf(callback);
    if (idx < 0) {
      return;
    }
    if (arr.length === 1) {
      this._callbacks.delete(e as T);
      if (!this.isActive) {
        this.suspend();
        this.emit('suspended');
      }
    }
    this._isActive = this.calcIsActive();
  }

  detachAll<E extends T | EmitterEvent>(e?: E): void {
    if (e === undefined) {
      this._suspendCallbacks = [];
      this._resumeCallbacks = [];
      if (this._callbacks.size > 0) {
        this._callbacks.clear();
        if (!this.isActive) {
          this.suspend();
        }
      }
      return;
    }
    if (e === 'EmitterSuspended' || e === 'EmitterResumed') {
      this[
        e === 'EmitterSuspended' ? '_suspendCallbacks' : '_resumeCallbacks'
      ] = [];
      return;
    }
    const callbacks = this._callbacks.get(e);
    if ((callbacks?.length || 0) > 0) {
      this._callbacks.delete(e);
      if (!this.isActive) {
        this.suspend();
      }
    }
  }

  // deno-lint-ignore ban-types
  once<C extends Function, E extends T | EmitterEvent>(e: E, c: C): () => void {
    const callback = (...args: unknown[]) => {
      (c as unknown as (...arg0: unknown[]) => void)(...args);
      this.detach(e, callback);
    };
    this.attach(e, callback);
    return () => this.detach(e, callback);
  }

  protected suspend(): void {}

  protected resume(): void {}

  mute(): void {
    this._isMuted = true;
  }

  unmute(): void {
    this._isMuted = false;
  }
}
