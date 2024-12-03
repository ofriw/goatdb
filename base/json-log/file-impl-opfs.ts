import * as path from 'std/path/mod.ts';
import { FileImpl } from './file-impl-interface.ts';

interface FileSystemSyncAccessHandle {
  close(): void;
  getSize(): number;
  flush(): void;
  read(buffer: Uint8Array, opts?: { at?: number }): number;
  truncate(size: number): void;
  write(buffer: Uint8Array, opts?: { at?: number }): number;
}

interface OPFSFile {
  handle: FileSystemFileHandle;
  file: FileSystemSyncAccessHandle;
  pos: number;
}

async function getDir(dirPath: string): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  dirPath = path.normalize(dirPath);
  const comps = dirPath.split('/');
  let parent = root;
  for (const c of comps) {
    if (c.length === 0) {
      continue;
    }
    parent = await parent.getDirectoryHandle(c, { create: true });
  }
  return parent;
}

export const FileImplOPFS: FileImpl<OPFSFile> = {
  async open(filePath, write) {
    const dir = await getDir(path.dirname(filePath));
    const handle = await dir.getFileHandle(path.basename(filePath), {
      create: write,
    });
    return {
      handle,
      file: await handle.createSyncAccessHandle(),
      pos: 0,
    };
  },

  seek(handle, offset, from) {
    switch (from) {
      case 'current':
        offset += handle.pos;
        break;

      case 'start':
        break;

      case 'end':
        offset = handle.file.getSize() - offset;
        break;
    }
    handle.pos = offset;
    return Promise.resolve(offset);
  },

  read(handle, buf) {
    if (handle.pos >= handle.file.getSize()) {
      return Promise.resolve(null);
    }
    const readLen = handle.file.read(buf, { at: handle.pos });
    handle.pos += readLen;
    return Promise.resolve(readLen);
  },

  truncate(handle, len) {
    len = Math.max(0, len);
    handle.file.truncate(len);
    handle.pos = Math.min(len, handle.pos);
    return Promise.resolve();
  },

  write(handle, buf) {
    let bytesWritten = 0;
    while (bytesWritten < buf.byteLength) {
      const arr = buf.subarray(bytesWritten);
      const len = handle.file.write(arr, { at: handle.pos });
      bytesWritten += len;
      handle.pos += len;
    }
    return Promise.resolve();
  },

  close(handle) {
    handle.file.close();
    return Promise.resolve();
  },

  flush(handle) {
    handle.file.flush();
    return Promise.resolve();
  },
};
