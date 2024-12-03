import {
  Diff,
  DIFF_DELETE,
  DIFF_EQUAL,
  DIFF_INSERT,
} from '../../external/diff-match-patch.ts';
import { kDMP } from '../base/defs.ts';
import {
  CoreOptions,
  CoreType,
  CoreValue,
  getCoreType,
} from '../../base/core-types/index.ts';
import { FlatRepAtom, flattenTextNode } from './flat-rep.ts';
import { Dictionary } from '../../base/collections/dict.ts';
import { StringRep } from './string-rep.ts';
import { RichTextChange } from '../change/richtext-change.ts';
import { TreeNode, isTextNode, isElementNode } from './tree.ts';
import * as ArrayUtils from '../../base/array.ts';

export enum Operation {
  Delete = -1,
  DeleteRange = -2,
  Insert = 1,
}

export interface PatchCommand {
  readonly operation: Operation;
  readonly start: number;
  readonly end?: number;
  readonly value?: string;
}

/**
 * A context for merging changes into an existing stream of FlatRepAtoms.
 * This class only allocates memory linear to the number of changes making it
 * very lightweight. A side effect of this design is it's a disposable, one time
 * use, class. Once finalized, the context can't be used anymore and a new one
 * needs to be created.
 */
export class MergeContext {
  private _origValues: readonly FlatRepAtom[];
  private readonly _deletions: Set<number>;
  private readonly _insertions: Dictionary<number, FlatRepAtom[]>;
  private readonly _eqOpts?: CoreOptions;
  private _result: readonly FlatRepAtom[] | undefined;

  constructor(origValues: Iterable<FlatRepAtom>, eqOpts?: CoreOptions) {
    this._origValues = Array.from(origValues);
    this._deletions = new Set();
    this._insertions = new Map();
    this._eqOpts = eqOpts;
  }

  get origValues(): readonly FlatRepAtom[] {
    return this._origValues;
  }

  delete(index: number): void {
    this._deletions.add(index);
    this._result = undefined;
  }

  deleteRange(start: number, end: number): void {
    for (let i = start; i < end; ++i) {
      this.delete(i);
    }
  }

  insert(index: number, value: FlatRepAtom | Iterable<FlatRepAtom>): void {
    const insertions = this._insertions;
    const curValue = insertions.get(index);
    if (curValue === undefined) {
      insertions.set(index, this.boxValueIfNeeded(value));
    } else {
      insertions.set(index, this.mergeValues(curValue, value));
    }
    this._result = undefined;
  }

  apply(change: RichTextChange): void {
    switch (change.op) {
      case Operation.Insert: {
        this.insert(change.start, recursiveFlattenTextNodes(change.values!));
        break;
      }

      case Operation.Delete:
        this.delete(change.start);
        break;

      case Operation.DeleteRange:
        this.deleteRange(change.start, change.end!);
        break;
    }
  }

  /**
   * Returns the current atom at the given index, or undefined if the index is
   * out of bounds of the result.
   *
   * NOTE: This is an O(Max(N, E)) operation where N is the original rep, and E
   * are the number of edits. Internally, each call to this method must
   * recalculate the final result in order to determine the value at the given
   * index.
   *
   * @param idx The index to get.
   * @returns The atom at the specified index.
   */
  at<T extends FlatRepAtom>(idx: number): T | undefined {
    return this.finalize()[idx] as T;
  }

  findLastBefore(
    searchEndIdx: number,
    selector: (atom: FlatRepAtom) => boolean
  ): FlatRepAtom | undefined {
    let result: FlatRepAtom | undefined;
    let idx = 0;
    for (const atom of this.finalize()) {
      if (selector(atom)) {
        result = atom;
      }
      if (++idx === searchEndIdx) {
        break;
      }
    }
    return result;
  }

  finalize(): readonly FlatRepAtom[] {
    if (this._result) {
      return this._result;
    }
    const deletions = this._deletions;
    const insertions = this._insertions;
    const result: FlatRepAtom[] = [];
    let idx = 0;
    for (const origAtom of this._origValues) {
      const insertedValues = insertions.get(idx);
      if (insertedValues !== undefined) {
        for (const v of insertedValues) {
          result.push(v);
        }
      }
      if (!deletions.has(idx)) {
        result.push(origAtom);
      }
      ++idx;
    }
    // Final insertion index after all existing values
    const insertedValues = insertions.get(idx);
    if (insertedValues !== undefined) {
      for (const v of insertedValues) {
        result.push(v);
      }
    }
    this._result = result;
    return result;
  }

  private boxValueIfNeeded(
    value: FlatRepAtom | Iterable<FlatRepAtom>
  ): FlatRepAtom[] {
    const type = getCoreType(value as CoreValue);
    switch (type) {
      case CoreType.Array:
        return value as FlatRepAtom[];

      case CoreType.String:
      case CoreType.Generator:
      case CoreType.Dictionary:
      case CoreType.Set:
        return Array.from(value as Iterable<CoreValue>) as FlatRepAtom[];

      default:
        return [value] as FlatRepAtom[];
    }
  }

  /**
   * Merges values by attempting to remove duplicates. Multiple values inserted
   * at the same index will be grouped as an array. Whenever a new value (or
   * array/string of values) is being inserted, it'll be diff'ed against the
   * existing values array to remove redundant runs.
   *
   * @param curValue
   * @param insertedValue
   * @returns An array of merged values
   */
  private mergeValues(
    curValue: FlatRepAtom[],
    insertedValue: FlatRepAtom | Iterable<FlatRepAtom>
  ): FlatRepAtom[] {
    const strRep = new StringRep(this._eqOpts);
    const curStr = strRep.encode(curValue);
    const newStr = strRep.encode(this.boxValueIfNeeded(insertedValue));
    const textDiffs = kDMP.diff_main(curStr, newStr, true);

    // For large diffs we perform semantic cleanup so things make more sense
    // to the observing user. The result is, that if two insertions differ by
    // more than a certain threshold (levenshtein distance > 3), the two will be
    // split into different words that represent the different logical
    // "branches" the users have created. For example, if user A inserted "Cats"
    // and user B inserted "Hats", without cleanup the result would be either
    // "CHats" or "HCats". However with cleanup, the result would be either
    // "CatsHats" or "HatsCats" which better represent both users' intentions.
    //
    // This behavior allows us to do more aggressive merges while still getting
    // correct results. This is the heart of our "conflict-free" approach.
    //
    // TODO(ofri): Properly tune the threshold
    // if (kDMP.diff_levenshtein(textDiffs) > 3) {
    //   kDMP.diff_cleanupSemantic(textDiffs);
    // }

    const result: FlatRepAtom[] = [];
    for (const diff of textDiffs) {
      ArrayUtils.append(result, strRep.decode(diff[1]));
    }
    return result;
  }

  static *diffToChanges(diffs: Diff[]): Generator<PatchCommand> {
    const length = diffs.length;
    let text1Idx = 0;
    let text2Idx = 0;
    for (let changeIdx = 0; changeIdx < length; ++changeIdx) {
      const change = diffs[changeIdx];
      const op = change[0];
      const text = change[1];
      if (text.length === 0) {
        /**
         * Empty diffs is a open bug in the diff-match-patch package:
         * https://github.com/google/diff-match-patch/issues/105
         * Currently the practice is to ignore it
         *  */
        continue;
      }
      switch (op) {
        case DIFF_EQUAL:
          text1Idx += text.length;
          text2Idx += text.length;
          break;

        case DIFF_DELETE: {
          if (text.length === 1) {
            yield {
              operation: Operation.Delete,
              start: text1Idx,
            };
          } else {
            yield {
              operation: Operation.DeleteRange,
              start: text1Idx,
              end: text1Idx + text.length,
            };
          }
          text1Idx += text.length;
          break;
        }

        case DIFF_INSERT: {
          yield {
            operation: Operation.Insert,
            start: text1Idx,
            value: text,
          };
          text2Idx += text.length;
          break;
        }
      }
    }
  }
}

/**
 * Break text nodes to their atoms so our merge context can correctly merge
 * changes on conflicts. Semantic cleanup is later applied to make sense of the
 * resulting merge.
 *
 * @param changeNodes An array of nodes.
 * @returns A flat rep with single character text nodes.
 */
function* recursiveFlattenTextNodes(
  changeNodes: TreeNode[]
): Generator<FlatRepAtom> {
  for (const node of changeNodes) {
    if (isTextNode(node)) {
      for (const atom of flattenTextNode(node, true, undefined, false)) {
        yield atom;
      }
    } else {
      yield node;
      if (isElementNode(node)) {
        for (const atom of recursiveFlattenTextNodes(node.children)) {
          yield atom;
        }
      }
    }
  }
}
