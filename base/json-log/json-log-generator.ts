import * as path from 'std/path/mod.ts';
import { assert } from '../error.ts';
import { JSONObject, ReadonlyJSONObject } from '../interfaces.ts';
import { SerialScheduler } from '../serial-scheduler.ts';
import { allocateBuffer } from '../buffer.ts';
import { cacheBufferForReuse } from '../buffer.ts';
import { runGC } from '../common.ts';

const FILE_READ_BUF_SIZE_BYTES = 1024 * 1024; // 8KB
const PAGE_SIZE = 1024;
const LINE_DELIMITER_BYTE = 10; // "\n"

export type ProgressUpdateCallback = (value: number) => void;

export class JSONLogFile {
  private readonly _scheduler: SerialScheduler;
  private _file: Deno.FsFile | undefined;
  private _didScan = false;

  constructor(readonly path: string, readonly write = false) {
    this._scheduler = new SerialScheduler();
  }

  get file(): Deno.FsFile | undefined {
    return this._file;
  }

  *open(progressCallback?: ProgressUpdateCallback): Generator<JSONObject> {
    if (this._file) {
      console.log('File already open');
      return;
    }
    if (this.write) {
      const dirPath = path.dirname(this.path);
      Deno.mkdirSync(dirPath, { recursive: true });
      this._file = Deno.openSync(this.path, {
        read: true,
        write: true,
        create: true,
      });
      console.log('File opened for writing:', this.path);
    } else {
      try {
        this._file = Deno.openSync(this.path, {
          read: true,
          write: false,
        });
        console.log('File opened for reading:', this.path);
      } catch (_: unknown) {
        console.log('File open failed, treating as empty log file:', this.path);
        // Open failed. No worries. We just count this as an empty log file.
        return;
      }
    }
    for (const c of this.scan(progressCallback)) {
      yield c;
    }
  }

  async *openAsync(
    progressCallback?: ProgressUpdateCallback,
  ): AsyncGenerator<JSONObject[]> {
    if (this._file) {
      return;
    }

    if (this.write) {
      const dirPath = path.dirname(this.path);
      await Deno.mkdir(dirPath, { recursive: true });
      this._file = await Deno.open(this.path, {
        read: true,
        write: true,
        create: true,
      });
    } else {
      try {
        this._file = await Deno.open(this.path, {
          read: true,
          write: false,
        });
      } catch (_err) {
        // Open failed. No worries. We just count this as an empty log file.
        return;
      }
    }
    for await (const c of this.scanAsync(progressCallback)) {
      yield c;
    }
  }

  close(): Promise<void> {
    return this._scheduler.run(() => {
      if (this._file) {
        this._file.close();
        this._file = undefined;
      }
      return Promise.resolve();
    });
  }

  appendAsync(entries: readonly JSONObject[]): Promise<void> {
    assert(this.write, 'Attempting to write to a readonly log');
    return this._scheduler.run(async () => {
      const file = this._file;
      if (!file) {
        console.log('File not open');
        return;
      }
      assert(
        this._didScan,
        'Attempting to append to log before initial scan completed',
      );
      const encodedEntries =
        '\n' + entries.map((obj) => JSON.stringify(obj)).join('\n\n') + '\n';

      const encodedBuf = new TextEncoder().encode(encodedEntries);

      let bytesWritten = 0;
      await file.seek(0, Deno.SeekMode.End);
      while (bytesWritten < encodedBuf.byteLength) {
        const arr = encodedBuf.subarray(bytesWritten);
        bytesWritten += await file.write(arr);
      }
    });
  }

  barrier(): Promise<void> {
    return this._scheduler.run(() => Promise.resolve());
  }

  append(entries: readonly JSONObject[]): void {
    assert(this.write, 'Attempting to write to a readonly log');
    const file = this._file;
    if (!file) {
      return;
    }
    assert(
      this._didScan,
      'Attempting to append to log before initial scan completed',
    );
    const encodedEntries =
      '\n' + entries.map((obj) => JSON.stringify(obj)).join('\n\n') + '\n';
    const encodedBuf = new TextEncoder().encode(encodedEntries);
    let bytesWritten = 0;
    file.seekSync(0, Deno.SeekMode.End);
    while (bytesWritten < encodedBuf.byteLength) {
      const arr = encodedBuf.subarray(bytesWritten);
      bytesWritten += file.writeSync(arr);
    }
  }

  *scan(progressCallback?: ProgressUpdateCallback): Generator<JSONObject> {
    const file = this._file;
    if (!file) {
      return;
    }
    const totalFileBytes = file.seekSync(0, Deno.SeekMode.End);
    file.seekSync(0, Deno.SeekMode.Start);
    let fileOffset = 0;
    const readBuf = new Uint8Array(FILE_READ_BUF_SIZE_BYTES);
    const textDecoder = new TextDecoder();
    let objectBuf = allocateBuffer(PAGE_SIZE);
    let objectBufOffset = 0;
    let lastGoodFileOffset = 0;
    for (
      let bytesRead = file.readSync(readBuf);
      bytesRead !== null;
      bytesRead = file.readSync(readBuf)
    ) {
      if (bytesRead === 0) {
        continue;
      }
      let readBufStart = 0;
      let readBufEnd = 0;
      while (readBufStart < bytesRead) {
        readBufEnd = readBufStart;
        while (
          readBufEnd < bytesRead &&
          readBuf[readBufEnd] !== LINE_DELIMITER_BYTE
        ) {
          ++readBufEnd;
        }
        const readLen = readBufEnd - readBufStart;
        if (readLen > 0) {
          fileOffset += readLen;
          objectBuf = appendBytes(
            readBuf,
            readBufStart,
            readLen,
            objectBuf,
            objectBufOffset,
          );
          objectBufOffset += readLen;
          if (progressCallback) {
            progressCallback(fileOffset / totalFileBytes);
          }
        }
        readBufStart = readBufEnd + 1;
        if (
          readBuf[readBufEnd] === LINE_DELIMITER_BYTE &&
          objectBufOffset > 0
        ) {
          try {
            const text = textDecoder.decode(
              objectBuf.subarray(0, objectBufOffset),
            );
            const obj = JSON.parse(text);
            yield obj;
            lastGoodFileOffset += objectBufOffset + 2;
            objectBufOffset = 0;
          } catch (_: unknown) {
            if (this.write) {
              file.seekSync(0, Deno.SeekMode.End);
              file.truncateSync(lastGoodFileOffset);
            }
            this._didScan = true;
            return;
          }
        }
      }
    }
    if (objectBufOffset > 0 && this.write) {
      file.seekSync(0, Deno.SeekMode.End);
      file.truncateSync(lastGoodFileOffset);
    }
    this._didScan = true;
    cacheBufferForReuse(objectBuf);
  }

  async *scanAsync(
    progressCallback?: ProgressUpdateCallback,
  ): AsyncGenerator<JSONObject[]> {
    const file = this._file;
    if (!file) {
      return;
    }
    const totalFileBytes = await file.seek(0, Deno.SeekMode.End);
    await file.seek(0, Deno.SeekMode.Start);
    let fileOffset = 0;
    const readBuf = new Uint8Array(FILE_READ_BUF_SIZE_BYTES);
    const textDecoder = new TextDecoder();
    let objectBuf = allocateBuffer(PAGE_SIZE);
    let objectBufOffset = 0;
    let lastGoodFileOffset = 0;
    let pendingObjects: JSONObject[] = [];
    for (
      let bytesRead = await file.read(readBuf);
      bytesRead !== null;
      bytesRead = await file.read(readBuf)
    ) {
      if (bytesRead === 0) {
        continue;
      }
      let readBufStart = 0;
      let readBufEnd = 0;
      while (readBufStart < bytesRead) {
        readBufEnd = readBufStart;
        while (
          readBufEnd < bytesRead &&
          readBuf[readBufEnd] !== LINE_DELIMITER_BYTE
        ) {
          ++readBufEnd;
        }
        const readLen = readBufEnd - readBufStart;
        if (readLen > 0) {
          fileOffset += readLen;
          objectBuf = appendBytes(
            readBuf,
            readBufStart,
            readLen,
            objectBuf,
            objectBufOffset,
          );
          objectBufOffset += readLen;
          if (progressCallback) {
            progressCallback(fileOffset / totalFileBytes);
          }
        }
        readBufStart = readBufEnd + 1;
        if (
          readBuf[readBufEnd] === LINE_DELIMITER_BYTE &&
          objectBufOffset > 0
        ) {
          try {
            const text = textDecoder.decode(
              objectBuf.subarray(0, objectBufOffset),
            );
            pendingObjects.push(JSON.parse(text));
            if (pendingObjects.length > 10) {
              yield pendingObjects;
              pendingObjects = [];
            }
            lastGoodFileOffset += objectBufOffset + 1; // +1 for newline character
            objectBufOffset = 0;
          } catch (_: unknown) {
            if (this.write) {
              await file.seek(0, Deno.SeekMode.End);
              await file.truncate(lastGoodFileOffset);
            }
            this._didScan = true;
            return;
          }
        }
      }
    }
    if (pendingObjects.length) {
      yield pendingObjects;
    }
    if (objectBufOffset > 0 && this.write) {
      await file.seek(0, Deno.SeekMode.End);
      await file.truncate(lastGoodFileOffset);
    }
    this._didScan = true; // Ensure this flag is set correctly
    cacheBufferForReuse(objectBuf);
  }

  *reverseScan(
    progressCallback?: ProgressUpdateCallback,
  ): Generator<JSONObject> {
    const file = this._file;
    if (!file) {
      return;
    }
    const totalFileBytes = file.seekSync(0, Deno.SeekMode.End);
    let fileOffset = totalFileBytes; // Start reading from the end of the file
    const readBuf = new Uint8Array(FILE_READ_BUF_SIZE_BYTES);
    const textDecoder = new TextDecoder();
    let objectBuf = allocateBuffer(PAGE_SIZE);
    let objectBufOffset = 0;

    while (fileOffset > 0) {
      const readSize = Math.min(FILE_READ_BUF_SIZE_BYTES, fileOffset);
      fileOffset -= readSize;
      file.seekSync(fileOffset, Deno.SeekMode.Start); // Seek to the new offset
      const bytesRead = file.readSync(readBuf.subarray(0, readSize));

      if (bytesRead === null || bytesRead === 0) {
        continue;
      }

      let readBufStart = bytesRead; // Start processing from the end of the buffer
      while (readBufStart > 0) {
        let readBufEnd = readBufStart;
        while (
          readBufEnd > 0 &&
          readBuf[readBufEnd - 1] !== LINE_DELIMITER_BYTE
        ) {
          --readBufEnd;
        }
        const readLen = readBufStart - readBufEnd;
        if (readLen > 0) {
          objectBuf = appendBytes(
            readBuf,
            readBufEnd,
            readLen,
            objectBuf,
            objectBufOffset,
          );
          objectBufOffset += readLen;
          if (progressCallback) {
            progressCallback((totalFileBytes - fileOffset) / totalFileBytes);
          }
        }
        readBufStart = readBufEnd - 1;
        if (
          readBuf[readBufEnd - 1] === LINE_DELIMITER_BYTE &&
          objectBufOffset > 0
        ) {
          try {
            const text = textDecoder.decode(
              objectBuf.subarray(0, objectBufOffset),
            );
            const obj = JSON.parse(text);
            yield obj;
            objectBufOffset = 0;
          } catch (_: unknown) {
            objectBufOffset = 0;
          }
        }
      }
    }

    if (objectBufOffset > 0) {
      try {
        const text = textDecoder.decode(objectBuf.subarray(0, objectBufOffset));
        const obj = JSON.parse(text);
        yield obj;
        // deno-lint-ignore no-empty
      } catch (_: unknown) {}
    }

    this._didScan = true;
    cacheBufferForReuse(objectBuf);
  }

  async *reverseScanAsync(
    progressCallback?: ProgressUpdateCallback,
  ): AsyncGenerator<JSONObject> {
    const file = this._file;
    if (!file) {
      return;
    }
    const totalFileBytes = await file.seek(0, Deno.SeekMode.End);
    let fileOffset = totalFileBytes; // Start reading from the end of the file
    const readBuf = new Uint8Array(FILE_READ_BUF_SIZE_BYTES);
    const textDecoder = new TextDecoder();
    let objectBuf = allocateBuffer(PAGE_SIZE);
    let objectBufOffset = 0;

    while (fileOffset > 0) {
      const readSize = Math.min(FILE_READ_BUF_SIZE_BYTES, fileOffset);
      fileOffset -= readSize;
      await file.seek(fileOffset, Deno.SeekMode.Start); // Seek to the new offset
      const bytesRead = await file.read(readBuf.subarray(0, readSize));

      if (bytesRead === null || bytesRead === 0) {
        continue;
      }

      let readBufStart = bytesRead; // Start processing from the end of the buffer
      while (readBufStart > 0) {
        let readBufEnd = readBufStart;
        while (
          readBufEnd > 0 &&
          readBuf[readBufEnd - 1] !== LINE_DELIMITER_BYTE
        ) {
          --readBufEnd;
        }
        const readLen = readBufStart - readBufEnd;
        if (readLen > 0) {
          objectBuf = appendBytes(
            readBuf,
            readBufEnd,
            readLen,
            objectBuf,
            objectBufOffset,
          );
          objectBufOffset += readLen;
          if (progressCallback) {
            progressCallback((totalFileBytes - fileOffset) / totalFileBytes);
          }
        }
        readBufStart = readBufEnd - 1;
        if (
          readBuf[readBufEnd - 1] === LINE_DELIMITER_BYTE &&
          objectBufOffset > 0
        ) {
          try {
            const text = textDecoder.decode(
              objectBuf.subarray(0, objectBufOffset),
            );
            const obj = JSON.parse(text);
            yield obj;
            objectBufOffset = 0;
          } catch (_: unknown) {
            objectBufOffset = 0;
          }
        }
      }
    }

    if (objectBufOffset > 0) {
      try {
        const text = textDecoder.decode(objectBuf.subarray(0, objectBufOffset));
        const obj = JSON.parse(text);
        yield obj;
        // deno-lint-ignore no-empty
      } catch (_: unknown) {}
    }

    this._didScan = true;
    cacheBufferForReuse(objectBuf);
  }

  query(
    predicate: (obj: ReadonlyJSONObject) => boolean,
    limit = Number.MAX_SAFE_INTEGER,
  ): JSONObject[] {
    const result: JSONObject[] = [];
    for (const obj of this.scan()) {
      if (predicate(obj)) {
        result.push(obj);
        if (result.length === limit) {
          break;
        }
      }
    }
    return result;
  }

  async queryAsync(
    predicate: (obj: ReadonlyJSONObject) => boolean,
    limit = Number.MAX_SAFE_INTEGER,
  ): Promise<JSONObject[]> {
    const result: JSONObject[] = [];
    if (!this._file || !this._didScan) {
      await this.openAsync();
    }
    for await (const buff of this.scanAsync()) {
      for (const obj of buff) {
        if (predicate(obj)) {
          result.push(obj);
          if (result.length === limit) {
            break;
          }
        }
      }
    }
    return result;
  }
}

function appendBytes(
  src: Uint8Array,
  srcOffset: number,
  srcLen: number,
  dst: Uint8Array,
  dstOffset: number,
): Uint8Array {
  if (dstOffset + srcLen > dst.byteLength) {
    const newDst = allocateBuffer(
      Math.ceil(((dstOffset + srcLen) * 2) / PAGE_SIZE) * PAGE_SIZE,
    );
    newDst.set(dst);
    cacheBufferForReuse(dst);
    dst = newDst;
  }
  dst.set(src.subarray(srcOffset, srcOffset + srcLen), dstOffset);
  return dst;
}
