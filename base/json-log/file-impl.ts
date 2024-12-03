import { FileImplDeno } from './file-impl-deno.ts';
import type { FileImpl } from './file-impl-interface.ts';
import { FileImplOPFS } from './file-impl-opfs.ts';

export function FileImplGet(): FileImpl<unknown> {
  return self.Deno === undefined ? FileImplOPFS : FileImplDeno;
}
