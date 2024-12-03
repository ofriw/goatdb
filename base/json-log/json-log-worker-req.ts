import { ReadonlyJSONObject } from '../interfaces.ts';

export interface WorkerFileReqOpen {
  type: 'open';
  id: number;
  path: string;
  write?: boolean;
}

export interface WorkerFileReqClose {
  type: 'close';
  id: number;
  file: number;
}

export interface WorkerFileReqCursor {
  type: 'cursor';
  id: number;
  file: number;
}

export interface WorkerFileReqScan {
  type: 'scan';
  id: number;
  cursor: number;
}

export interface WorkerFileReqFlush {
  type: 'flush';
  id: number;
  file: number;
}

export interface WorkerFileReqAppend {
  type: 'append';
  id: number;
  file: number;
  values: readonly ReadonlyJSONObject[];
}

export interface WorkerReadTextFileReq {
  type: 'readTextFile';
  id: number;
  path: string;
}

export interface WorkerWriteTextFileReq {
  type: 'writeTextFile';
  id: number;
  path: string;
  text: string;
}

export type WorkerFileReq =
  | WorkerFileReqOpen
  | WorkerFileReqClose
  | WorkerFileReqCursor
  | WorkerFileReqScan
  | WorkerFileReqFlush
  | WorkerFileReqAppend
  | WorkerReadTextFileReq
  | WorkerWriteTextFileReq;

export interface WorkerFileRespOpen {
  type: 'open';
  id: number;
  file: number;
}

export interface WorkerFileRespClose {
  type: 'close';
  id: number;
  file: number;
}

export interface WorkerFileRespCursor {
  type: 'cursor';
  id: number;
  cursor: number;
}

export interface WorkerFileRespScan {
  type: 'scan';
  id: number;
  cursor: number;
  values: readonly ReadonlyJSONObject[];
  done: boolean;
}

export interface WorkerFileRespFlush {
  type: 'flush';
  id: number;
  file: number;
}

export interface WorkerFileRespAppend {
  type: 'append';
  id: number;
}

export interface WorkerReadTextFileResp {
  type: 'readTextFile';
  id: number;
  text: string | undefined;
}

export interface WorkerWriteTextFileResp {
  type: 'writeTextFile';
  id: number;
  success: boolean;
}

export type WorkerFileResp =
  | WorkerFileRespOpen
  | WorkerFileRespClose
  | WorkerFileRespCursor
  | WorkerFileRespScan
  | WorkerFileRespFlush
  | WorkerFileRespAppend
  | WorkerReadTextFileResp;

export type WorkerFileRespForReq<T extends WorkerFileReq = WorkerFileReq> =
  T['type'] extends 'open'
    ? WorkerFileRespOpen
    : T['type'] extends 'close'
    ? WorkerFileRespClose
    : T['type'] extends 'cursor'
    ? WorkerFileRespCursor
    : T['type'] extends 'scan'
    ? WorkerFileRespScan
    : T['type'] extends 'flush'
    ? WorkerFileRespFlush
    : T['type'] extends 'append'
    ? WorkerFileRespAppend
    : T['type'] extends 'readTextFile'
    ? WorkerReadTextFileResp
    : T['type'] extends 'writeTextFile'
    ? WorkerWriteTextFileResp
    : WorkerFileResp;
