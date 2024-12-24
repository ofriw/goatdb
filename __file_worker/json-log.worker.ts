/**
 * This file implements a background worker for the JSONLogFile interface in
 * json-log-background.ts
 */
import { assert } from '../base/error.ts';
import { ReadonlyJSONObject } from '../base/interfaces.ts';
import {
  WorkerFileReq,
  WorkerFileRespAppend,
  WorkerFileRespClose,
  WorkerFileRespCursor,
  WorkerFileRespFlush,
  WorkerFileRespOpen,
  WorkerFileRespScan,
  WorkerReadTextFileResp,
  WorkerWriteTextFileReq,
  WorkerWriteTextFileResp,
} from '../base/json-log/json-log-worker-req.ts';
import { FileImpl } from '../base/json-log/file-impl-interface.ts';
import { FileImplGet } from '../base/json-log/file-impl.ts';
import * as SetUtils from '../base/set.ts';

const FILE_READ_BUF_SIZE_BYTES = 1024 * 1024; // 8KB
const PAGE_SIZE = 1024;
const LINE_DELIMITER_BYTE = 10; // "\n"

const textDecoder = new TextDecoder();

interface JSONLogFile {
  readonly path: string;
  readonly write: boolean;
  readonly impl: FileImpl<unknown>;
  readonly knownIds: Set<string>;
  handle: unknown;
  didScan?: true;
  pendingWrites: ReadonlyJSONObject[];
  writePromise?: Promise<void>;
}

async function JSONLogFileOpen(
  path: string,
  write = false
): Promise<JSONLogFile> {
  const impl = FileImplGet();
  return {
    path,
    write: write === true,
    impl,
    handle: await impl.open(path, write),
    pendingWrites: [],
    knownIds: new Set(),
  };
}

function JSONLogFileClose(file: JSONLogFile): Promise<void> {
  return file.impl.close(file.handle);
}

interface JSONLogFileCursor {
  readonly file: JSONLogFile;
  readonly totalFileBytes: number;
  fileOffset: number;
  readBuf: Uint8Array;
  readBufLen: number;
  readBufStart: number;
  readBufEnd: number;
  lastGoodFileOffset: number;
  objectBuf: Uint8Array;
  objectBufOffset: number;
}

async function JSONLogFileStartCursor(
  file: JSONLogFile
): Promise<JSONLogFileCursor> {
  const totalFileBytes = await file.impl.seek(file.handle, 0, 'end');
  await file.impl.seek(file.handle, 0, 'start');
  return {
    file,
    totalFileBytes,
    fileOffset: 0,
    readBuf: new Uint8Array(FILE_READ_BUF_SIZE_BYTES),
    readBufLen: 0,
    readBufStart: 0,
    readBufEnd: 0,
    lastGoodFileOffset: 0,
    objectBuf: new Uint8Array(PAGE_SIZE),
    objectBufOffset: 0,
  };
}

type ScanResult = [results: readonly ReadonlyJSONObject[], done: boolean];
async function JSONLogFileScan(cursor: JSONLogFileCursor): Promise<ScanResult> {
  const pendingObjects: ReadonlyJSONObject[] = [];
  while (pendingObjects.length <= 50) {
    while (cursor.readBufLen <= 0) {
      const bytesRead = await cursor.file.impl.read(
        cursor.file.handle,
        cursor.readBuf
      );
      // next read()
      if (bytesRead === null) {
        if (cursor.objectBufOffset > 0 && cursor.file.write) {
          await cursor.file.impl.seek(cursor.file.handle, 0, 'end');
          await cursor.file.impl.truncate(
            cursor.file.handle,
            cursor.lastGoodFileOffset
          );
        }
        cursor.file.didScan = true; // Ensure this flag is set correctly
        return [pendingObjects, true];
      }
      cursor.readBufLen = bytesRead;
    }
    while (cursor.readBufStart < cursor.readBufLen) {
      cursor.readBufEnd = cursor.readBufStart;
      while (
        cursor.readBufEnd < cursor.readBufLen &&
        cursor.readBuf[cursor.readBufEnd] !== LINE_DELIMITER_BYTE
      ) {
        ++cursor.readBufEnd;
      }
      const readLen = cursor.readBufEnd - cursor.readBufStart;
      if (readLen > 0) {
        cursor.fileOffset += readLen;
        cursor.objectBuf = appendBytes(
          cursor.readBuf,
          cursor.readBufStart,
          readLen,
          cursor.objectBuf,
          cursor.objectBufOffset
        );
        cursor.objectBufOffset += readLen;
        // if (progressCallback) {
        //   progressCallback(fileOffset / totalFileBytes);
        // }
      }
      cursor.readBufStart = cursor.readBufEnd + 1;
      if (
        cursor.readBuf[cursor.readBufEnd] === LINE_DELIMITER_BYTE &&
        cursor.objectBufOffset > 0
      ) {
        try {
          const text = textDecoder.decode(
            cursor.objectBuf.subarray(0, cursor.objectBufOffset)
          );
          pendingObjects.push(JSON.parse(text));
          cursor.lastGoodFileOffset += cursor.objectBufOffset + 1; // +1 for newline character
          cursor.objectBufOffset = 0;
          // if (pendingObjects.length > 20000) {
          //   break;
          // }
        } catch (_: unknown) {
          if (cursor.file.write) {
            await cursor.file.impl.seek(cursor.file.handle, 0, 'end');
            await cursor.file.impl.truncate(
              cursor.file.handle,
              cursor.lastGoodFileOffset
            );
          }
          cursor.file.didScan = true;
          for (const o of pendingObjects) {
            if (typeof o.id === 'string') {
              cursor.file.knownIds.add(o.id);
            }
          }
          return [pendingObjects, true];
        }
      }
    }
    if (cursor.readBufStart >= cursor.readBufLen) {
      cursor.readBufLen = 0;
      cursor.readBufStart = 0;
      cursor.readBufEnd = 0;
    }
  }

  for (const o of pendingObjects) {
    if (typeof o.id === 'string') {
      cursor.file.knownIds.add(o.id);
    }
  }
  return [pendingObjects, false];
  // cacheBufferForReuse(objectBuf);
}

function JSONLogFileFlush(file: JSONLogFile): Promise<void> {
  return file.impl.flush(file.handle);
}

function appendBytes(
  src: Uint8Array,
  srcOffset: number,
  srcLen: number,
  dst: Uint8Array,
  dstOffset: number
): Uint8Array {
  if (dstOffset + srcLen > dst.byteLength) {
    const newDst = new Uint8Array(
      Math.ceil(((dstOffset + srcLen) * 2) / PAGE_SIZE) * PAGE_SIZE
    );
    newDst.set(dst);
    // cacheBufferForReuse(dst);
    dst = newDst;
  }
  dst.set(src.subarray(srcOffset, srcOffset + srcLen), dstOffset);
  return dst;
}

async function JSONLogFileAppend(
  file: JSONLogFile,
  entries: readonly ReadonlyJSONObject[]
): Promise<void> {
  assert(file.write, 'Attempting to write to a readonly log');
  // if (file.writePromise) {
  //   await file.writePromise;
  //   const promise = delay<void>(0, async () => {
  //     await JSONLogFileAppend(file, entries);
  //     if (file.writePromise === promise) {
  //       file.writePromise = undefined;
  //     }
  //   });
  //   file.writePromise = promise;
  //   return;
  // }
  assert(
    file.didScan === true,
    'Attempting to append to log before initial scan completed'
  );
  const filteredEntries: ReadonlyJSONObject[] = [];
  for (const e of entries) {
    if (typeof e.id === 'string' && !file.knownIds.has(e.id)) {
      file.knownIds.add(e.id);
      filteredEntries.push(e);
    }
  }
  const encodedEntries =
    '\n' +
    filteredEntries.map((obj) => JSON.stringify(obj)).join('\n\n') +
    '\n';
  const encodedBuf = new TextEncoder().encode(encodedEntries);
  await file.impl.seek(file.handle, 0, 'end');
  await file.impl.write(file.handle, encodedBuf);
}

const gOpenFiles = new Map<number, JSONLogFile>();
let gFileHandleNum = 0;
const gOpenCursors = new Map<
  number,
  { cursor: JSONLogFileCursor; nextPromise?: Promise<ScanResult> }
>();
let gOpenCursorNum = 0;

async function readFile(path: string): Promise<Uint8Array> {
  const impl = FileImplGet();
  const handle = await impl.open(path, false);
  const fileLen = await impl.seek(handle, 0, 'end');
  await impl.seek(handle, 0, 'start');
  const buf = new Uint8Array(fileLen);
  await impl.read(handle, buf);
  await impl.close(handle);
  return buf;
}

async function readTextFile(path: string): Promise<string | undefined> {
  try {
    const decoder = new TextDecoder();
    return decoder.decode(await readFile(path));
  } catch (_: unknown) {
    return undefined;
  }
}

async function writeFile(path: string, buf: Uint8Array): Promise<void> {
  const impl = FileImplGet();
  const handle = await impl.open(path, true);
  await impl.write(handle, buf);
  await impl.truncate(handle, buf.length);
  await impl.close(handle);
}

async function writeTextFile(path: string, text: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    await writeFile(path, encoder.encode(text));
    return true;
  } catch (_: unknown) {
    return false;
  }
}

function main(): void {
  console.log(`WORKER STARTED`);
  onmessage = async (event: MessageEvent<WorkerFileReq>) => {
    switch (event.data.type) {
      case 'open': {
        const handle = ++gFileHandleNum;
        const file = await JSONLogFileOpen(event.data.path, event.data.write);
        gOpenFiles.set(handle, file);
        const resp: WorkerFileRespOpen = {
          type: 'open',
          id: event.data.id,
          file: handle,
        };
        postMessage(JSON.stringify(resp));
        break;
      }

      case 'close': {
        const file = gOpenFiles.get(event.data.file);
        if (file) {
          gOpenFiles.delete(event.data.file);
          await JSONLogFileClose(file);
        }
        const resp: WorkerFileRespClose = {
          type: 'close',
          id: event.data.id,
          file: event.data.file,
        };
        postMessage(JSON.stringify(resp));
        break;
      }

      case 'cursor': {
        const file = gOpenFiles.get(event.data.file);
        assert(file !== undefined, 'File not found');
        const cursor = await JSONLogFileStartCursor(file);
        const cursorId = ++gOpenCursorNum;
        const nextPromise = JSONLogFileScan(cursor);
        gOpenCursors.set(cursorId, { cursor, nextPromise });
        const resp: WorkerFileRespCursor = {
          type: 'cursor',
          id: event.data.id,
          cursor: cursorId,
        };
        postMessage(JSON.stringify(resp));
        break;
      }

      case 'scan': {
        const entry = gOpenCursors.get(event.data.cursor);
        assert(entry !== undefined, 'Cursor not found');
        if (!entry.nextPromise) {
          entry.nextPromise = JSONLogFileScan(entry.cursor);
        }
        const [values, done] = await entry.nextPromise;
        entry.nextPromise = JSONLogFileScan(entry.cursor);
        const resp: WorkerFileRespScan = {
          type: 'scan',
          id: event.data.id,
          cursor: event.data.cursor,
          values,
          done,
        };
        postMessage(JSON.stringify(resp));
        break;
      }

      case 'flush': {
        const file = gOpenFiles.get(event.data.file);
        assert(file !== undefined, 'File not found');
        await JSONLogFileFlush(file);
        const resp: WorkerFileRespFlush = {
          type: 'flush',
          id: event.data.id,
          file: event.data.file,
        };
        postMessage(JSON.stringify(resp));
        break;
      }

      case 'append': {
        const file = gOpenFiles.get(event.data.file);
        assert(file !== undefined, 'File not found');
        await JSONLogFileAppend(file, event.data.values);
        const resp: WorkerFileRespAppend = {
          type: 'append',
          id: event.data.id,
        };
        postMessage(JSON.stringify(resp));
        break;
      }

      case 'readTextFile': {
        const resp: WorkerReadTextFileResp = {
          type: 'readTextFile',
          id: event.data.id,
          text: await readTextFile(event.data.path),
        };
        postMessage(JSON.stringify(resp));
        break;
      }

      case 'writeTextFile': {
        const resp: WorkerWriteTextFileResp = {
          type: 'writeTextFile',
          id: event.data.id,
          success: await writeTextFile(event.data.path, event.data.text),
        };
        postMessage(JSON.stringify(resp));
        break;
      }
    }
  };
}

main();
