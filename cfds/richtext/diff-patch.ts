import {
  RichTextChange,
  RichTextChangeConfig,
} from '../change/richtext-change.ts';
import { isElementNode, kCoreValueTreeNodeOpts, RichText } from './tree.ts';
import { MergeContext } from './merge-context.ts';
import { StringRep } from './string-rep.ts';
import { kDMP } from '../base/defs.ts';
import {
  convertPtrsToValues,
  FlatRepAtom,
  flattenRichText,
  reconstructRichText,
  reconstructTextNodes,
} from './flat-rep.ts';
import { Diff } from '../../external/diff-match-patch.ts';
import {
  coreValueClone,
  coreValueEquals,
} from '../../base/core-types/index.ts';

/**
 * This function copies each element node and returns the copy with empty
 * children field.
 * @param flatRep Input flat rep.
 */
function* cleanCopyElementNodes(
  flatRep: Iterable<FlatRepAtom>,
): Generator<FlatRepAtom> {
  for (const atom of flatRep) {
    if (isElementNode(atom)) {
      const copy = coreValueClone(atom, kCoreValueTreeNodeOpts);
      copy.children = [];
      yield copy;
    } else {
      yield atom;
    }
  }
}

export function* decodeStringDiff(
  diff: Diff[],
  strRep: StringRep,
): Generator<RichTextChange> {
  for (const cmd of MergeContext.diffToChanges(diff)) {
    let values: FlatRepAtom[] | undefined;
    if (cmd.value !== undefined) {
      // Our diff works at the character level, but our patch works at the node
      // level. To make them compatible we need to reconstruct text nodes from
      // our character diff. The steps are as follows:
      //
      // 1. Convert back the string value to atoms (where text nodes are broken
      //    to individual characters).
      //
      // 2. Up to this point we were using the actual node instances from the
      //    original trees (zero-copy). This means that the `children` field of
      //    element nodes, and the `text` field of text nodes point to values
      //    that are correct in their original trees. To output a correct
      //    change, we copy those nodes and reset their fields to an empty
      //    state.
      //
      // 3. Re-group characters and reconstruct text nodes, which is now
      //    possible since our text nodes have a correct, empty, `text` field.
      //
      // 4. Pack all TreeAtoms nice and warm in an array for our change to hold.
      //    Up to this point everything used a pipeline of generators to reduce
      //    large allocations during diffing (which turns out to be the major
      //    performance bottleneck of the previous implementation).
      values = Array.from(
        convertPtrsToValues(
          cleanCopyElementNodes(reconstructTextNodes(strRep.decode(cmd.value))),
        ),
      );
    }
    const config: RichTextChangeConfig = {
      op: cmd.operation,
      start: cmd.start,
    };
    if (values !== undefined) {
      config.values = values;
    }
    if (cmd.end !== undefined) {
      config.end = cmd.end;
    }
    yield new RichTextChange(config);
  }
}

export function diff(
  rt1: RichText,
  rt2: RichText,
  local = true,
  byCharacter = true,
): RichTextChange[] {
  if (coreValueEquals(rt1, rt2)) {
    return [];
  }
  const strRep = new StringRep(kCoreValueTreeNodeOpts);
  // const flatRt1 = Array.from(flattenRichText(rt1, local, true));
  // const flatRt2 = Array.from(flattenRichText(rt2, local, true));
  // const str1 = strRep.encode(flatRt1);
  // const str2 = strRep.encode(flatRt2);
  const str1 = strRep.encode(flattenRichText(rt1, local, byCharacter));
  const str2 = strRep.encode(flattenRichText(rt2, local, byCharacter));
  const textDiffs = kDMP.diff_main(str1, str2, true);
  // if (textDiffs.length > 2) {
  //   kDMP.diff_cleanupSemantic(textDiffs);
  // }
  return Array.from(decodeStringDiff(textDiffs, strRep));
}

export function patch(
  base: RichText,
  changes: RichTextChange[],
  local = true,
): RichText {
  //const flat = Array.from(flattenRichText(base, local));

  const mergeCtx = new MergeContext(
    flattenRichText(base, local),
    kCoreValueTreeNodeOpts,
  );
  for (const c of changes) {
    mergeCtx.apply(c);
  }
  // const mergedAtoms = Array.from(mergeCtx.finalize());
  // const result = reconstructRichText(mergedAtoms);
  const result = reconstructRichText(mergeCtx.finalize());
  // normalizeRichText(result);
  return result;
}
