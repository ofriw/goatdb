/**
 * This file implements the JSONLogFile interface using a background worker.
 * All requests are forwarded to the worker, and responses are returned to the
 * caller transparently.
 *
 * This implementation is faster than the one in json-log-functional.ts when
 * prefetching the next scan call (as the main DB class does). It yields ~12%
 * performance improvement.
 */
import { assert } from '../error.ts';
import { ReadonlyJSONObject } from '../interfaces.ts';
import {
  WorkerFileReq,
  WorkerFileReqAppend,
  WorkerFileReqClose,
  WorkerFileReqCursor,
  WorkerFileReqFlush,
  WorkerFileReqOpen,
  WorkerFileReqScan,
  WorkerFileResp,
  WorkerFileRespForReq,
  WorkerFileRespScan,
  WorkerReadTextFileReq,
  WorkerWriteTextFileReq,
} from './json-log-worker-req.ts';

let gWorker: Worker | undefined;

export function startJSONLogWorkerIfNeeded(): Worker {
  if (gWorker === undefined) {
    if (self.Deno !== undefined) {
      gWorker = new Worker(
        import.meta.resolve('../../__file_worker/json-log.worker.ts'),
        {
          type: 'module',
        }
      );
    } else {
      gWorker = new Worker('/__file_worker/app.js', {
        type: 'module',
      });
    }
    gWorker.onmessage = handleResponse;
  }
  return gWorker;
}

export type JSONLogFile = number;

const gPendingResolveFuncs = new Map<number, (v: WorkerFileResp) => void>();
let gReqId = 0;

function sendRequest<T extends WorkerFileReq>(
  req: Omit<T, 'id'>
): Promise<WorkerFileRespForReq<T>> {
  let resolve: (v: WorkerFileRespForReq<T>) => void;
  const promise = new Promise<WorkerFileRespForReq<T>>((res) => {
    resolve = res;
  });
  const id = ++gReqId;
  gPendingResolveFuncs.set(id, resolve! as (v: WorkerFileResp) => void);
  const worker = startJSONLogWorkerIfNeeded();
  worker.postMessage({
    ...req,
    id,
  });
  return promise;
}

function handleResponse(event: MessageEvent<string>): void {
  const resp = JSON.parse(event.data);
  const resolve = gPendingResolveFuncs.get(resp.id);
  assert(resolve !== undefined, 'Received unknown response from worker');
  gPendingResolveFuncs.delete(resp.id);
  resolve(resp);
}

export async function JSONLogFileOpen(
  filePath: string,
  write = false
): Promise<JSONLogFile> {
  return (
    await sendRequest<WorkerFileReqOpen>({
      type: 'open',
      path: filePath,
      write,
    })
  ).file;
}

export async function JSONLogFileClose(file: JSONLogFile): Promise<void> {
  await sendRequest<WorkerFileReqClose>({
    type: 'close',
    file,
  });
}

export type JSONLogFileCursor = number;

export async function JSONLogFileStartCursor(
  file: JSONLogFile
): Promise<JSONLogFileCursor> {
  return (
    await sendRequest<WorkerFileReqCursor>({
      type: 'cursor',
      file,
    })
  ).cursor;
}

export type JSONLogFileScanResult = [
  results: readonly ReadonlyJSONObject[],
  done: boolean
];
const gPendingScanPromise = new Map<
  JSONLogFileCursor,
  Promise<WorkerFileRespScan>
>();

export async function JSONLogFileScan(
  cursor: JSONLogFileCursor
): Promise<[results: readonly ReadonlyJSONObject[], done: boolean]> {
  let promise = gPendingScanPromise.get(cursor);
  if (!promise) {
    promise = sendRequest<WorkerFileReqScan>({
      type: 'scan',
      cursor,
    });
  }

  const resp = await promise;
  if (!resp.done) {
    gPendingScanPromise.set(
      cursor,
      sendRequest<WorkerFileReqScan>({
        type: 'scan',
        cursor,
      })
    );
  }
  return [resp.values, resp.done];
}

export async function JSONLogFileFlush(file: JSONLogFile): Promise<void> {
  await sendRequest<WorkerFileReqFlush>({
    type: 'flush',
    file,
  });
}

export async function JSONLogFileAppend(
  file: JSONLogFile,
  entries: readonly ReadonlyJSONObject[]
): Promise<void> {
  await sendRequest<WorkerFileReqAppend>({
    type: 'append',
    file,
    values: entries,
  });
}

export async function readTextFile(path: string): Promise<string | undefined> {
  return (
    await sendRequest<WorkerReadTextFileReq>({
      type: 'readTextFile',
      path,
    })
  ).text;
}

export async function writeTextFile(
  path: string,
  text: string
): Promise<boolean> {
  return (
    await sendRequest<WorkerWriteTextFileReq>({
      type: 'writeTextFile',
      path,
      text,
    })
  ).success;
}
