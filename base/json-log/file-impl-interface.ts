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
