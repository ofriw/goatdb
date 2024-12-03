import * as path from 'std/path/mod.ts';
import { assert } from '../error.ts';
import { ReadonlyJSONObject } from '../interfaces.ts';
import { FileImplGet } from './file-impl.ts';

const FILE_READ_BUF_SIZE_BYTES = 1024 * 1024; // 8KB
const PAGE_SIZE = 1024;
const LINE_DELIMITER_BYTE = 10; // "\n"

const textDecoder = new TextDecoder();

export type SeekFrom = 'current' | 'start' | 'end';

export interface FileImpl<T> {
  open(path: string, write: boolean): Promise<T>;
  seek(handle: T, offset: number, from: SeekFrom): Promise<number>;
  read(handle: T, buf: Uint8Array): Promise<number | null>;
  truncate(handle: T, len: number): Promise<void>;
  write(handle: T, buf: Uint8Array): Promise<void>;
  close(handle: T): Promise<void>;
  flush(handle: T): Promise<void>;
}

export interface JSONLogFile {
  readonly path: string;
  readonly write: boolean;
  readonly impl: FileImpl<unknown>;
  handle: unknown;
  didScan?: true;
  pendingWrites: ReadonlyJSONObject[];
  writePromise?: Promise<void>;
}

const FileImplDeno: FileImpl<Deno.FsFile> = {
  async open(filePath, write) {
    // try {
    console.log(path.dirname(filePath));
    await Deno.mkdir(path.dirname(filePath), { recursive: true });
    // } catch (_: unknown) {}
    return Deno.open(filePath, {
      read: true,
      write,
      create: write,
    });
  },

  seek(handle, offset, from) {
    let whence: Deno.SeekMode;
    switch (from) {
      case 'start':
        whence = Deno.SeekMode.Start;
        break;

      case 'current':
        whence = Deno.SeekMode.Current;
        break;

      case 'end':
        whence = Deno.SeekMode.End;
        break;
    }
    return handle.seek(offset, whence);
  },

  read(handle, buf) {
    return handle.read(buf);
  },

  truncate(handle, len) {
    return handle.truncate(len);
  },

  async write(handle, buf) {
    let bytesWritten = 0;
    while (bytesWritten < buf.byteLength) {
      const arr = buf.subarray(bytesWritten);
      bytesWritten += await handle.write(arr);
    }
  },

  close(handle) {
    handle.close();
    return Promise.resolve();
  },

  flush(handle) {
    return handle.sync();
  },
};

export async function JSONLogFileOpen(
  path: string,
  write = false,
): Promise<JSONLogFile> {
  const impl = FileImplGet();
  return {
    path,
    write: write === true,
    impl,
    handle: await impl.open(path, write),
    pendingWrites: [],
  };
}

export function JSONLogFileClose(file: JSONLogFile): Promise<void> {
  return file.impl.close(file.handle);
}

export interface JSONLogFileCursor {
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
  done?: true;
}

export async function JSONLogFileStartCursor(
  file: JSONLogFile,
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

export async function JSONLogFileScan(
  cursor: JSONLogFileCursor,
): Promise<[results: readonly ReadonlyJSONObject[], done: boolean]> {
  const pendingObjects: ReadonlyJSONObject[] = [];
  if (cursor.done) {
    return [pendingObjects, true];
  }
  while (pendingObjects.length <= 20000) {
    while (cursor.readBufLen <= 0) {
      const bytesRead = await cursor.file.impl.read(
        cursor.file.handle,
        cursor.readBuf,
      );
      if (bytesRead === null) {
        if (cursor.objectBufOffset > 0 && cursor.file.write) {
          await cursor.file.impl.seek(cursor.file.handle, 0, 'end');
          await cursor.file.impl.truncate(
            cursor.file.handle,
            cursor.lastGoodFileOffset,
          );
        }
        cursor.done = true;
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
      debugger;
      if (readLen > 0) {
        cursor.fileOffset += readLen;
        cursor.objectBuf = appendBytes(
          cursor.readBuf,
          cursor.readBufStart,
          readLen,
          cursor.objectBuf,
          cursor.objectBufOffset,
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
            cursor.objectBuf.subarray(0, cursor.objectBufOffset),
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
              cursor.lastGoodFileOffset,
            );
          }
          cursor.done = true;
          cursor.file.didScan = true;
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

  return [pendingObjects, false];
  // cacheBufferForReuse(objectBuf);
}

export function JSONLogFileFlush(file: JSONLogFile): Promise<void> {
  return file.impl.flush(file.handle);
}

function appendBytes(
  src: Uint8Array,
  srcOffset: number,
  srcLen: number,
  dst: Uint8Array,
  dstOffset: number,
): Uint8Array {
  if (dstOffset + srcLen > dst.byteLength) {
    const newDst = new Uint8Array(
      Math.ceil(((dstOffset + srcLen) * 2) / PAGE_SIZE) * PAGE_SIZE,
    );
    newDst.set(dst);
    // cacheBufferForReuse(dst);
    dst = newDst;
  }
  dst.set(src.subarray(srcOffset, srcOffset + srcLen), dstOffset);
  return dst;
}

export async function JSONLogFileAppend(
  file: JSONLogFile,
  entries: readonly ReadonlyJSONObject[],
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
    'Attempting to append to log before initial scan completed',
  );
  const encodedEntries =
    '\n' + entries.map((obj) => JSON.stringify(obj)).join('\n\n') + '\n';

  const encodedBuf = new TextEncoder().encode(encodedEntries);
  await file.impl.seek(file.handle, 0, 'end');
  await file.impl.write(file.handle, encodedBuf);
}
