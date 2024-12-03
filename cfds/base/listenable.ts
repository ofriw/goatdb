export interface Listener<T> {
  (value: T): void;
}

export abstract class Listenable<T> {
  private _listeners: Listener<T>[];

  constructor() {
    this._listeners = [];
  }

  protected get hasListeners() {
    return this._listeners.length > 0;
  }

  protected beforeFirstListener(): void {}

  protected abstract triggerListener(listener: Listener<T>): void;

  protected afterLastListener(): void {}

  notify() {
    for (const f of this._listeners) {
      this.triggerListener(f);
    }
  }

  listen(f: (value: T) => void, fireOnStart: boolean = true) {
    if (this._listeners.length === 0) {
      this.beforeFirstListener();
    }
    this._listeners.push(f);
    if (fireOnStart) {
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          if (this._listeners.indexOf(f) !== -1) {
            this.triggerListener(f);
          }
        }, 0);
      } else {
        setTimeout(() => {
          if (this._listeners.indexOf(f) !== -1) {
            this.triggerListener(f);
          }
        }, 0);
      }
    }
    return () => {
      const idx = this._listeners.indexOf(f);
      if (idx >= 0) {
        this._listeners.splice(idx, 1);
      }
      if (!this._listeners.length) {
        this.afterLastListener();
      }
    };
  }

  removeAllListeners() {
    this._listeners = [];
    this.afterLastListener();
  }
}
