import { assert } from '../../base/error.ts';

/**
 * Services are published by the server to enable all components to access the
 * relevant bits of data. For example database access, caches, etc can all be
 * exposed as server services.
 */
export class BaseService<T> {
  private _services?: T;
  private _active = false;

  setup(services: T): Promise<void> {
    this._services = services;
    return Promise.resolve();
  }

  get services(): T {
    assert(
      this._services !== undefined,
      'Did you forget to setup this service?'
    );
    return this._services;
  }

  get active(): boolean {
    return this._active;
  }

  start(): void {
    this._active = true;
  }

  stop(): void {
    this._active = false;
  }
}
