import { ReadonlyJSONObject } from '../base/interfaces.ts';

export type CmdType = 'parse-commits';

export type ParseCommitsCmd = {
  type: 'parse-commits';
  id: number;
  js: ReadonlyJSONObject[];
};

export type ParseCommitsResp = {
  type: 'parse-commits';
  id: number;
};

export class WorkerPool {
  private _workers: Worker[];
  constructor(concurrency?: number) {
    this._workers = [];
    if (!concurrency) {
      concurrency = navigator.hardwareConcurrency;
    }
    for (let i = 0; i < concurrency; ++i) {
      // TODO: Browser support
      this._workers.push(
        new Worker(import.meta.resolve('./worker-main.ts'), {
          type: 'module',
        }),
      );
    }
  }
}
