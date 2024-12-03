import * as path from 'std/path/mod.ts';
import { FileImpl } from './file-impl-interface.ts';

export const FileImplDeno: FileImpl<Deno.FsFile> = {
  async open(filePath, write) {
    // try {
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
