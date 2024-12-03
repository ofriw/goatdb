import { DiffMatchPatch } from '../../external/diff-match-patch.ts';

export const kDMP = new DiffMatchPatch();
kDMP.Diff_Timeout = 0.5;

export const CFDS_VERSION = '4.0.0';
export const CFDS_COMP_MIN_VERSION = '4.0.0';
export const CFDS_COMP_MAX_VERSION = '4.0.0';

export enum ChangeType {
  Insert = 1,
  Other = 2,
  Equal = 0,
  Delete = -1,
  DeleteRange = -2,
}

export enum Dir {
  After = 1,
  Before = -1,
  Exact = 0,
}
