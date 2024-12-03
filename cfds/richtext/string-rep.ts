import { assert } from '../../base/error.ts';
import { Dictionary } from '../../base/collections/dict.ts';
import { HashMap } from '../../base/collections/hash-map.ts';
import { CoreOptions } from '../../base/core-types/base.ts';
import { coreValueEquals } from '../../base/core-types/index.ts';
import { encodableValueHash } from '../../base/core-types/encoding/hash.ts';
import { FlatRepAtom, isElementSpacer, kElementSpacer } from './flat-rep.ts';

type ReverseMapping = (FlatRepAtom | null)[];

const kReservedCodePoints = new Set<string>(['\0', '\n']);
const kNewlineCodePoint = '\n'.codePointAt(0);

/**
 * A way to encode a stream of values as a continuous string. It constructs a
 * 2-way mapping from tree atoms to code points.
 *
 * WARNING: This class does not copy inserted values. It's the caller's
 * responsibility to ensure nothing mutates while in use.
 */
export class StringRep {
  private readonly _dict: Dictionary<FlatRepAtom, string>;
  private readonly _reverseMapping: ReverseMapping;

  constructor(opts?: CoreOptions) {
    this._dict = new HashMap<FlatRepAtom, string>(
      (v) => encodableValueHash(v, opts),
      (v1, v2) => coreValueEquals(v1, v2, opts)
    );
    this._reverseMapping = [];
  }

  encode(iter: Iterable<FlatRepAtom>): string {
    const dict = this._dict;
    const reverseMapping = this._reverseMapping;
    let result = '';
    for (const value of iter) {
      if (isElementSpacer(value)) {
        result += '\n';
        continue;
      }
      let encodedChar = dict.get(value);
      if (encodedChar === undefined) {
        // Skip reserved characters
        do {
          assert(reverseMapping.length < 65536, 'Max encoded values reached');
          encodedChar = String.fromCodePoint(reverseMapping.length);
          if (kReservedCodePoints.has(encodedChar)) {
            reverseMapping.push(null);
          } else {
            break;
          }
        } while (true);
        dict.set(value, encodedChar);
        reverseMapping.push(value);
      }
      result += encodedChar;
    }
    return result;
  }

  *decode(str: string): Generator<FlatRepAtom> {
    const reverseMapping = this._reverseMapping;
    const len = str.length;
    for (let i = 0; i < len; ++i) {
      const codePoint = str.codePointAt(i)!;
      if (codePoint === kNewlineCodePoint) {
        yield kElementSpacer;
      }
      assert(
        codePoint < reverseMapping.length ||
          kReservedCodePoints.has(String.fromCodePoint(codePoint)),
        'Unexpected code point'
      );
      const value = reverseMapping[codePoint];
      // Skip reserved characters
      if (value === undefined || value === null) {
        continue;
      }
      yield value;
    }
  }
}
