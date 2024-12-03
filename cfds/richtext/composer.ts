import { assert } from '../../base/error.ts';
import {
  reconstructRichText,
  flattenRichText,
  FlatRepAtom,
  DepthMarker,
  isDepthMarker,
} from './flat-rep.ts';
import {
  isRefNode,
  RefMarker,
  RefNode,
  RefType,
  isRefMarker,
} from './model.ts';
import {
  ElementNode,
  TextNode,
  RichText,
  dfs,
  isElementNode,
  isRichText,
} from './tree.ts';

export enum RefPlaceholder {
  Deleted,
  Loading,
}

/**
 * A function that resolves a given ref value to RichText.
 */
export interface RefResolver {
  (ref: string): RichText | RefPlaceholder;
}

/**
 * A function that writes an updated RichText value to a given reference.
 */
export interface RefUpdater {
  (ref: string, rt: RichText): void;
}

/**
 * Converts all RefNode instances in the text to RefMarker elements.
 *
 * @param resolver A resolver function.
 * @param rt The text to convert.
 * @param local Include/exclude local tree elements.
 *
 * @returns A full RichText representation
 */
export function composeRichText(
  resolver: RefResolver,
  rt: RichText,
  local = true,
): RichText {
  // First, do a full tree scan and check if the composition will have pointers
  // in it.
  // if (compositeRichTextHasPointers(resolver, rt)) {
  // If the result has pointers, we have no choice but to do a slow flat
  // composition.
  return reconstructRichText(composeFlatRichText(resolver, rt, local));
  // }
  // // If no pointers are found, we simply clone the tree and replace reference
  // // nodes inline which is significantly faster than flat composition.
  // const result: RichText = coreValueClone(rt);
  // fastComposeRichTextTreeNoPointers(resolver, result.root);
  // return result;
}

export function decomposeRichText(
  updater: RefUpdater,
  rt: RichText,
  local = true,
): RichText {
  // const atoms = Array.from(decomposeFlatRichText(updater, rt, local));
  // debugger;
  // return reconstructRichText(atoms);
  return reconstructRichText(decomposeFlatRichText(updater, rt, local));
}

function* composeFlatRichText(
  resolver: RefResolver,
  rt: RichText,
  local: boolean,
): Generator<FlatRepAtom> {
  let depth = 0;
  for (const v of flattenRichText(rt, local, false)) {
    if (isRefMarker(v)) {
      const replacementRT = resolver(v.ref);
      // Target is deleted. Skip this ref so it's also deleted in the composed
      // result
      if (replacementRT === RefPlaceholder.Deleted) {
        continue;
      }
      // Target is loading. Spit a placeholder that works for Slate.
      if (replacementRT === RefPlaceholder.Loading) {
        yield {
          ...v,
          loading: true,
          children: [],
        } as RefMarker;
        yield {
          depthMarker: depth + 1,
        } as DepthMarker;
        yield {
          text: '',
        } as TextNode;
        yield {
          depthMarker: depth,
        } as DepthMarker;
        continue;
      }
      // Dynamically replace the ref marker with a RefNode element followed by
      // the inner rich text contents
      yield {
        tagName: 'ref',
        ref: v.ref,
        type: v.type,
        isLocal: v.isLocal === true,
        children: [],
      } as RefNode;
      // Open a new level in the tree
      yield {
        depthMarker: depth + 1,
      } as DepthMarker;
      // Pass through all flat atoms of the resolved ref.
      // Note: Replace flattenRichText() with a recursive call to
      // composeRichText() if you wish to recursively resolve inner refs as well
      for (const innerAtom of flattenRichText(replacementRT, local, false)) {
        // Fixup inner depth markers' count
        if (isDepthMarker(innerAtom)) {
          yield {
            depthMarker: depth + 1 + innerAtom.depthMarker,
            isLocal: innerAtom.isLocal === true,
          } as DepthMarker;
        } else {
          yield innerAtom;
        }
      }
      // Close the tree level we opened
      yield {
        depthMarker: depth,
      } as DepthMarker;
    } else {
      if (isDepthMarker(v)) {
        depth = v.depthMarker;
      }
      yield v;
    }
  }
}

function fastComposeRichTextTreeNoPointers(
  resolver: RefResolver,
  parent: ElementNode,
): void {
  const children = parent.children;
  for (let idx = 0; idx < children.length; ++idx) {
    const child = children[idx];
    if (isElementNode(child)) {
      fastComposeRichTextTreeNoPointers(resolver, child);
    } else if (isRefMarker(child)) {
      const replacementRT = resolver(child.ref);
      if (replacementRT === RefPlaceholder.Deleted) {
        // Target is deleted. Skip this ref so it's also deleted in the composed
        // result
        children.splice(idx, 1);
        --idx;
        continue;
      } else if (replacementRT === RefPlaceholder.Loading) {
        // Target is loading. Spit a placeholder that works for Slate.
        children[idx] = {
          tagName: 'ref',
          type: child.type,
          ref: child.ref,
          loading: true,
          isLocal: child.isLocal === true,
          children: [
            {
              text: '',
            },
          ],
        } as RefNode;
      } else {
        assert(
          replacementRT.pointers === undefined ||
            replacementRT.pointers.size === 0,
        );
        // Dynamically replace the ref marker with a RefNode element followed by
        // the inner rich text contents
        children[idx] = {
          tagName: 'ref',
          ref: child.ref,
          type: child.type,
          isLocal: child.isLocal === true,
          children: replacementRT.root.children,
        } as RefNode;
      }
    }
  }
}

/**
 * This function does a full tree scan and checks if the resulting composition
 * has pointers in it or not.
 * @param resolver A resolver function.
 * @param rt The base text.
 * @returns Whether the resulting composition has pointers or not.
 */
function compositeRichTextHasPointers(
  resolver: RefResolver,
  rt: RichText,
): boolean {
  if (rt.pointers !== undefined && rt.pointers.size > 0) {
    return true;
  }
  for (const [node] of dfs(rt.root)) {
    if (isRefMarker(node)) {
      const replacementRT = resolver(node.ref);
      if (
        isRichText(replacementRT) &&
        replacementRT.pointers !== undefined &&
        replacementRT.pointers.size > 0
      ) {
        return true;
      }
    }
  }
  return false;
}

function* decomposeFlatRichText(
  updater: RefUpdater,
  rt: RichText,
  local: boolean,
): Generator<FlatRepAtom> {
  let depth = 0;
  const flatRepGenerator = flattenRichText(rt, local, false);
  for (let atom of flatRepGenerator) {
    // Dynamically replace RefNode elements with a RefMarker leaf, while
    // updating the subtree at the relevant target
    if (isRefNode(atom)) {
      yield _updateLinkedDoc(
        updater,
        atom.ref,
        flatRepGenerator,
        depth,
        atom.isLocal === true,
      );
    } else if (isRefMarker(atom)) {
      // Clean the loading flag from ref markers
      const copy: RefMarker = {
        ref: atom.ref,
        type: atom.type,
      };
      if (atom.isLocal) {
        copy.isLocal = true;
      }
      yield copy;
    } else {
      // Keep track of current depth
      if (isDepthMarker(atom)) {
        depth = atom.depthMarker;
      }
      yield atom;
    }
  }
}

function _updateLinkedDoc(
  updater: RefUpdater,
  key: string,
  flatRepGenerator: Iterator<FlatRepAtom>,
  markerDepth: number,
  local: boolean,
): RefMarker {
  const innerAtoms: FlatRepAtom[] = [];
  // Fast forward our flat rep until we reach the end of this ref element
  let { value: innerAtm, done } = flatRepGenerator.next();
  while (!done) {
    if (isDepthMarker(innerAtm) && innerAtm.depthMarker <= markerDepth) {
      // Reached a depth marker outside our parent.
      // Apply updates
      break;
    } else {
      // All inner atoms (including depth markers) pass unmodified.
      // Inner nodes will naturally collapse into the root of the target.
      innerAtoms.push(innerAtm);
    }
    const next = flatRepGenerator.next();
    innerAtm = next.value;
    done = next.done;
  }

  updater(key, reconstructRichText(innerAtoms));
  // Generate a RefMarker
  const refMarker: RefMarker = {
    ref: key,
    type: RefType.InternalDoc,
  };
  if (local) {
    refMarker.isLocal = true;
  }
  return refMarker;
}

export function extractRefs(
  root: ElementNode,
  local: boolean,
  outSet?: Set<string>,
): Set<string> {
  if (outSet === undefined) {
    outSet = new Set();
  }
  for (const [node] of dfs(root)) {
    if (node.isLocal === true && !local) {
      continue;
    }
    if (isRefMarker(node) || isRefNode(node)) {
      outSet.add(node.ref);
    }
  }
  return outSet;
}

export function extractOrderedRefs(
  root: ElementNode,
  local: boolean,
  outKeys?: string[],
): string[] {
  if (outKeys === undefined) {
    outKeys = [];
  }
  for (const [node] of dfs(root)) {
    if (node.isLocal === true && !local) {
      continue;
    }
    if (isRefMarker(node) || isRefNode(node)) {
      if (!outKeys.includes(node.ref)) {
        outKeys.push(node.ref);
      }
    }
  }
  return outKeys;
}

/**
 * <p>
 * <span>
 * <h1>
 * <h2>
 * <ul>
 * <ol>
 * <li>
 * <ref>
 * <img>
 * <table>
 * <tr>
 * <td>
 */
