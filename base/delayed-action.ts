import { SimpleTimer, Timer } from './timer.ts';

export class DelayedAction<T> {
  private readonly _timer: Timer;
  private _promise: Promise<T> | undefined;
  private _resolve: ((v: T) => void) | undefined;
  private _reject: ((err: unknown) => void) | undefined;

  constructor(
    readonly delayMs: number,
    readonly callback: () => T | Promise<T>,
  ) {
    this._timer = new SimpleTimer(delayMs, false, () => this._execute());
  }

  schedule(): Promise<T> {
    if (this._promise === undefined) {
      this._promise = new Promise<T>((res, rej) => {
        this._resolve = res;
        this._reject = rej;
      });
      this._timer.schedule();
    }
    return this._promise;
  }

  private async _execute(): Promise<void> {
    const res = this._resolve!;
    const rej = this._reject!;
    this._promise = undefined;
    this._resolve = undefined;
    this._reject = undefined;
    try {
      res(await this.callback());
    } catch (err: unknown) {
      rej(err);
    }
  }
}
