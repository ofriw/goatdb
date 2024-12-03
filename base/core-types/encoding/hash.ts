import { CoreOptions, CoreValue } from '../base.ts';
import {
  ChecksumEncoderOpts,
  Murmur3Checksum,
  Murmur3Opts,
} from './checksum.ts';

const kMurmurEncoder = new Murmur3Checksum({ typeSafe: false });

export function coreValueHash(
  v: CoreValue | object,
  options?: CoreOptions | ChecksumEncoderOpts
): string {
  return kMurmurEncoder.checksumForValue(v, options as Murmur3Opts);
}

export const encodableValueHash = coreValueHash;
