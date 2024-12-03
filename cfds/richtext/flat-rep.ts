import { notReached } from '../../base/error.ts';
import { kDMP } from '../base/defs.ts';
import { Dictionary } from '../../base/collections/dict.ts';
import { HashMap, HashSet } from '../../base/collections/hash-map.ts';
import {
  CoreDictionary,
  CoreType,
  CoreValue,
  coreValueClone,
  CoreValueCloneOpts,
  coreValueEquals,
  getCoreType,
  isReadonlyCoreObject,
  ReadonlyCoreObject,
} from '../../base/core-types/index.ts';
import { EqualOptions } from '../../base/core-types/equals.ts';
import { encodableValueHash } from '../../base/core-types/encoding/index.ts';
import { MergeContext } from './merge-context.ts';
import { StringRep } from './string-rep.ts';
import {
  kCoreValueTreeNodeOpts,
  TextNode,
  ElementNode,
  isElementNode,
  isTextNode,
  Pointer,
  RichText,
  TreeNode,
  comparePointers,
  isPointer,
  PointerDirection,
  PointerType,
  RichTextValue,
  isExpiredPointer,
  isTrivialTextNode,
  findLastTextNode,
} from './tree.ts';

/**
 * A representation of a pointer by value. The pointer points at the text node
 * that came right before it in the ordered stream. If no such node exists, an
 * implicit empty text node is assumed.
 */
export interface PointerValue extends RichTextValue {
  key: string;
  type: PointerType;
  dir: PointerDirection;
  expiration?: Date;
}

/**
 * A tree depth marker, used for rebuilding the tree from the flat
 * representation. It determines if newly discovered nodes in the stream will
 * attach inside the current node or next to it.
 */
export interface DepthMarker extends RichTextValue {
  // A bit weird choice of field name, to allow clients to use the more likely
  // 'depth' keyword as custom node property.
  readonly depthMarker: number;
}

/**
 * Used to space element nodes from each other. When converting to a string,
 * spaces are replaced with newlines, which enables the diff match patch by-line
 * optimization to kick in.
 */
interface ElementSpacer extends ReadonlyCoreObject {
  readonly __elementSpacer: true;
}

export const kElementSpacer: ElementSpacer = { __elementSpacer: true };

export type FlatRepAtom = TreeNode | PointerValue | DepthMarker | ElementSpacer;

export function isTreeNode(node: CoreValue): node is TreeNode {
  return (
    isReadonlyCoreObject(node) &&
    !isDepthMarker(node) &&
    !isPointer(node) &&
    !isPointerValue(node) &&
    !isElementSpacer(node)
  );
}

export function isDepthMarker(obj: CoreValue): obj is DepthMarker {
  return isReadonlyCoreObject(obj) && typeof obj.depthMarker === 'number';
}

export function isElementSpacer(obj: CoreValue): obj is ElementSpacer {
  return isReadonlyCoreObject(obj) && obj.__elementSpacer === true;
}

export function isPointerValue<T extends PointerValue>(
  obj: CoreValue,
): obj is T {
  return (
    isReadonlyCoreObject(obj) &&
    typeof obj.key === 'string' &&
    typeof obj.dir === 'number' &&
    typeof obj.type === 'string'
  );
}

/**
 * A pool of cached nodes with values adjusted to their flat rep (single char
 * text, empty children, etc). Used by getFrozenFlatRepNode().
 */
const gFrozenTextNodes: Dictionary<
  TreeNode,
  Dictionary<string | undefined, TreeNode>
> = new HashMap(
  (v) => encodableValueHash(v, kCoreValueTreeNodeOpts),
  (v1, v2) => coreValueEquals(v1, v2, kCoreValueTreeNodeOpts),
  (v) => {
    return coreValueClone(v, {
      ...kCoreValueTreeNodeOpts,
      fieldCloneOverride: (
        obj: ReadonlyCoreObject | CoreDictionary,
        key: string,
      ) => {
        if (getCoreType(obj) === CoreType.Dictionary) {
          return key === 'children' ? [] : (obj as CoreDictionary).get(key);
        }
        return key === 'children' ? [] : (obj as ReadonlyCoreObject)[key];
      },
    });
  },
);

/**
 * Given a text node and a specific character, this function returned a frozen
 * TextNode instance with its text set to the given character. The returned node
 * has the same properties as the provided text node, except its text field.
 * Used when flattening text nodes to avoid costly allocations.
 *
 * NOTE: Each character atom must also hold a full copy of the node's attributes
 * so markers like bold, underline, etc are properly preserved during a merge.
 *
 * @param node The given text node.
 * @param char A single character string.
 * @returns A cached TextNode object.
 */
function getFrozenTextNode(node: TextNode, char: string): TextNode {
  let dict = gFrozenTextNodes.get(node);
  if (dict === undefined) {
    dict = new Map<string, TreeNode>();
    gFrozenTextNodes.set(node, dict);
  }
  let result = dict.get(char);
  if (result === undefined) {
    result = coreValueClone(node, kCoreValueTreeNodeOpts);
    result.text = char;
    result = Object.freeze(result);
    dict.set(char, result);
  }
  return result as TextNode;
}

function unfreezeTextNode(node: TextNode): TextNode {
  if (Object.isFrozen(node)) {
    return coreValueClone(node);
  }
  return node;
}

/**
 * Filters and returns the pointers for a specific node:offset combination.
 *
 * @param ptrSet An iterable of pointers for the rich text.
 * @param node The specific text node.
 * @param local Flag indicating whether local pointers are returned or not.
 * @param offset The pointer's specific index.
 * @returns A stream of Pointer objects.
 */
function* pointersForNode(
  ptrSet: Iterable<Pointer> | undefined,
  node: TextNode,
  local: boolean,
  offset?: number,
): Generator<Pointer> {
  if (ptrSet === undefined) {
    return;
  }
  for (const ptr of ptrSet) {
    if (!local && ptr.isLocal === true) {
      continue;
    }
    if (ptr.node === node && (offset === undefined || ptr.offset === offset)) {
      yield ptr;
    }
  }
}

/**
 * Given a text node and all pointers, this function breaks it to a stream of
 * character and pointer atoms. Each output atom is a standalone unit and can
 * be reconstructed to a text node on its own. Multiple atoms may be grouped
 * to a single text node during reconstruction where appropriate.
 */
export function* flattenTextNode(
  node: TextNode,
  local: boolean,
  sortedPointers?: Pointer[],
  trailingTextNode = true,
): Generator<TextNode | PointerValue> {
  // Go over each character in the text. We're using for...of on a string so the
  // code natively accounts for unicode surrogate pairs.
  let idx = 0;
  for (const c of node.text) {
    // Node comes before its pointers
    yield getFrozenTextNode(node, c);
    // Process all pointers on this character
    if (sortedPointers !== undefined) {
      for (const ptrAtom of pointersForNode(sortedPointers, node, local, idx)) {
        // A Pointer is field-compatible with PointerValue so we just spit the
        // original pointers unmodified
        yield ptrAtom;
      }
    }
    ++idx;
  }
  // Reserve an empty text node for pointers at the end of this text node
  let emittedEmptyText = false;
  if (trailingTextNode || node.text.length === 0) {
    yield getFrozenTextNode(node, '');
    emittedEmptyText = true;
  }
  if (sortedPointers !== undefined) {
    for (const ptrAtom of pointersForNode(sortedPointers, node, local, idx)) {
      if (!emittedEmptyText) {
        yield getFrozenTextNode(node, '');
        emittedEmptyText = true;
      }
      yield ptrAtom;
    }
  }
}

/**
 * If we're not interested in character level text node, we still want to break
 * text nodes on pointer edges so we can flatten their pointers. This
 * transformation is considerably faster than per character flattening, while
 * still being consistent with flat rep logic.
 *
 * @param node The node to split to atoms.
 * @param local Whether to include local pointers or not.
 * @param sortedPointers All pointers available in the rich text.
 * @param direction Whether to emit the pointers before their respective node
 *                  or after (default).
 */
export function* splitTextNodeOnPointers(
  node: TextNode,
  local: boolean,
  sortedPointers?: Pointer[],
  direction: 'before' | 'after' = 'after',
): Generator<TextNode | PointerValue> {
  if (!sortedPointers || !sortedPointers.length) {
    yield Object.freeze(coreValueClone(node));
    return;
  }
  // First, get a list of all pointers for this node sorted by offset
  const sortedPtrsForNode = Array.from(
    pointersForNode(sortedPointers, node, local),
  ).sort((p1, p2) =>
    p1.offset === p2.offset ? comparePointers(p1, p2) : p1.offset - p2.offset,
  );
  // Break the node to a stream of text nodes and pointer values
  const nodeText = node.text;
  let start = 0;
  for (const ptr of sortedPtrsForNode) {
    const offset = ptr.offset;
    let emittedPtr = false;
    if (offset >= start) {
      // The reconstruction logic assumes pointer values appear after single
      // character text nodes. Thus, we can keep everything before the pointer's
      // offset as a single text node.
      if (offset !== start) {
        yield Object.freeze({
          ...node,
          text: nodeText.substring(start, offset),
        });
      }
      if (direction === 'before') {
        yield ptr as PointerValue;
        emittedPtr = true;
      }
      // The actual single character target of our pointer
      yield getFrozenTextNode(
        node,
        offset < nodeText.length ? nodeText[offset] : '',
      );
      // Don't repeat the text nodes if there are multiple pointers at the same
      // offset
      start = ptr.offset + 1;
    }
    if (!emittedPtr || direction !== 'before') {
      // The actual pointer can be returned
      yield ptr as PointerValue;
    }
  }
  // Handle any remaining text after the last pointer
  if (start < node.text.length) {
    yield Object.freeze({
      ...node,
      text: nodeText.substring(start),
    });
  } else if (start === node.text.length) {
    // If there are no pointers at the end of this node, then we need to produce
    // an empty text node at the end so pointers can be placed there in future
    // edits down the line
    yield getFrozenTextNode(node, '');
  }
}

/**
 * Given a parent node, this function yields all of its children's flat
 * representation, recursively.
 * @param parent Parent node.
 * @param parentDepth The depth of the parent node
 * @param local Whether to include local children or not.
 * @param sortedPointers Sorted array of pointers of the entire tree.
 */
function* flattenChildNodes(
  parent: ElementNode,
  parentDepth: number,
  local: boolean,
  sortedPointers: Pointer[] | undefined,
  flattenText: boolean,
): Generator<FlatRepAtom> {
  const children = parent.children;
  let didOpen = false;
  for (const child of children) {
    // Skip local children on non-local run
    if (!local && child.isLocal === true) {
      continue;
    }
    // Lazily create an opening depth marker. This won't generate any depth
    // markers on parents where all children were skipped.
    if (!didOpen) {
      yield {
        depthMarker: parentDepth + 1,
      } as DepthMarker;
      didOpen = true;
    }
    // Recursively flatten this child
    for (const atom of flattenTreeNode(
      child,
      parentDepth + 1,
      local,
      sortedPointers,
      flattenText,
    )) {
      yield atom;
    }
  }
  // Emit a closing depth marker if needed
  if (didOpen) {
    yield {
      depthMarker: parentDepth,
    } as DepthMarker;
  }
}

/**
 * Recursively flattens a subtree, including the root.
 *
 * @param node The root of the subtree.
 * @param depth The depth of the root node in its parent tree. Pass 0 if its the
 *              actual root of the tree.
 * @param local Should local nodes be included or not.
 * @param sortedPointers A sorted array of all pointers in the tree.
 * @returns A stream of tree atoms.
 */
function* flattenTreeNode(
  node: TreeNode,
  depth: number,
  local: boolean,
  sortedPointers: Pointer[] | undefined,
  flattenText: boolean,
): Generator<FlatRepAtom> {
  if (!local && node.isLocal === true) {
    return;
  }
  if (isTextNode(node)) {
    if (flattenText) {
      for (const v of flattenTextNode(node, local, sortedPointers)) {
        yield v;
      }
    } else {
      // yield node;
      for (const v of splitTextNodeOnPointers(node, local, sortedPointers)) {
        yield v;
      }
    }
  } else if (isElementNode(node)) {
    yield kElementSpacer;
    yield node;
    for (const v of flattenChildNodes(
      node,
      depth,
      local,
      sortedPointers,
      flattenText,
    )) {
      yield v;
    }
  } else {
    yield node;
  }
}
/**
 * Flattens a given RichText to a linear stream of atoms.
 * @param rt The RichText to flatten.
 * @param local Whether to include local nodes or note.
 */
export function flattenRichText(
  rt: RichText,
  local: boolean,
  flattenText = true,
): Generator<FlatRepAtom> {
  return flattenSiblingNodes(
    rt.root.children,
    0,
    local,
    rt.pointers,
    flattenText,
  );
}

export function stripDuplicatePointers(ptrs: Set<Pointer>): Set<Pointer> {
  const result = new HashSet<Pointer>(
    encodableValueHash,
    (p1, p2) => comparePointers(p1, p2) === 0,
  );
  for (const p of ptrs) {
    result.add(p);
  }
  return new Set(result);
}

/**
 * Flatten an iterable of sibling nodes.
 * @param iter All siblings
 * @param parentDepth The depth of the parent of all children
 * @param local Should local nodes be included
 * @param pointers All pointers of the tree
 */
export function* flattenSiblingNodes(
  iter: Iterable<FlatRepAtom>,
  parentDepth: number,
  local: boolean,
  pointers: Set<Pointer> | undefined,
  flattenText: boolean,
): Generator<FlatRepAtom> {
  // Sort all pointers so our flat representation is consistent where multiple
  // pointers are present at the same location.
  const sortedPointers =
    pointers !== undefined
      ? Array.from<Pointer>(stripDuplicatePointers(pointers)).sort(
          comparePointers,
        )
      : undefined;
  for (const atom of iter) {
    for (const flatAtom of flattenTreeNode(
      atom,
      parentDepth,
      local,
      sortedPointers,
      flattenText,
    )) {
      yield flatAtom;
    }
  }
}

function cleanCloneTreeAtomField(
  obj: ReadonlyCoreObject | CoreDictionary,
  key: string,
  _opts?: CoreValueCloneOpts,
): CoreValue {
  if (key === 'children' && isElementNode(obj as CoreValue)) {
    return [];
  }

  const type = getCoreType(obj);
  if (type === CoreType.Dictionary) {
    return (obj as Dictionary).get(key);
  } else {
    return (obj as ReadonlyCoreObject)[key];
  }
}

/**
 * Given a flat representation, this function filters out the pointer values
 * and reconstructs a set of pointers. It assumes the flat rep has text nodes
 * still broken to single char nodes. Yielded text nodes already have their
 * pointers populated in outPtrs at the time of yield.
 *
 * @param flatRep An existing flat representation.
 * @param outPtrs A mapping from text nodes to their pointers
 * @returns A filtered flat rep without pointer values.
 */
function* reconstructPointers(
  flatRep: Iterable<FlatRepAtom>,
  outPtrs: Map<TextNode, Set<Pointer>>,
): Generator<FlatRepAtom> {
  let pendingTextNode: TextNode | undefined;
  for (const atom of flatRep) {
    if (isPointerValue(atom)) {
      // Create an implicit empty text node if no text node came before this
      // pointer.
      if (pendingTextNode === undefined) {
        pendingTextNode = { text: '' };
      }
      // Get the set of pointers for our text node
      let ptrSet = outPtrs.get(pendingTextNode);
      if (ptrSet === undefined) {
        ptrSet = new Set();
        outPtrs.set(pendingTextNode, ptrSet);
      }
      // Add the pointer at offset 0 since we're still assuming single character
      // text nodes at this point
      ptrSet.add({
        ...atom,
        node: pendingTextNode,
        offset: Math.max(pendingTextNode.text.length - 1, 0),
      });
    } else {
      // Found a non-pointer value. Yield any pending text node
      if (pendingTextNode !== undefined) {
        yield pendingTextNode;
      }
      if (isTextNode(atom)) {
        // New text node found. Wait for read ahead before doing anything with
        // it
        pendingTextNode = unfreezeTextNode(atom);
      } else {
        // Not a text node. Reset and yield unmodified.
        pendingTextNode = undefined;
        yield atom;
      }
    }
  }
  // Handle any pending text node at the end of the stream
  if (pendingTextNode !== undefined) {
    yield pendingTextNode;
  }
}

const kFilterTextField: EqualOptions = {
  objectFilterFields: (key: string) => key !== 'text',
};

/**
 * Given a flat rep, this function reconstructs text nodes and their pointers.
 * It'll concat individual text nodes, and rebuild any pointer values.
 *
 * @param flatRep A flat rep.
 * @param ptrOffsetter An optional function used to correct pointers from
 *                     deleted text nodes to their new ones.
 * @returns A flat rep with full text nodes.
 */
export function* reconstructTextNodes(
  flatRep: Iterable<FlatRepAtom>,
  ptrOffsetter?: (
    deletedNode: TextNode,
    newNode: TextNode,
    newOffset: number,
  ) => void,
): Generator<FlatRepAtom> {
  let lastTextNode: TextNode | undefined;
  for (const atom of flatRep) {
    if (
      isTextNode(atom) &&
      // If we have an offsetter, we can handle empty text nodes that exist for
      // pointers. Otherwise, we must leave them unmodified so later steps can
      // handle them
      (ptrOffsetter || atom.text.length > 0) &&
      coreValueEquals(atom, lastTextNode, kFilterTextField)
    ) {
      // The current atom is equal (ignoring text field) to the last text node
      // we yielded. We can safely append its text to the last node and skip it.
      // NOTE: This mutates nodes that we have already yielded. Make sure the
      // caller isn't copying nodes as it receives them.
      lastTextNode!.text += atom.text;
      if (ptrOffsetter !== undefined) {
        // New pointer offset is length of string before concatenation
        const offset = lastTextNode!.text.length - atom.text.length;
        ptrOffsetter(atom, lastTextNode!, offset);
      }
    } else {
      // Current text node isn't equal to last next node
      if (isTextNode(atom)) {
        // First, copy it as we're probably dealing with a frozen instance from
        // getFrozenTextNode().
        lastTextNode = unfreezeTextNode(atom);
        // Yield it
        yield lastTextNode;
        // Fixup any pointers that pointed at the frozen text node.
        if (ptrOffsetter !== undefined) {
          ptrOffsetter(atom, lastTextNode!, 0);
          for (let i = 1; i < lastTextNode!.text.length; ++i) {
            ptrOffsetter(atom, lastTextNode!, i);
          }
        }
      } else {
        // Current node isn't a text node. Clear our state and spit it out
        // unmodified.
        lastTextNode = undefined;
        yield atom;
      }
    }
  }
}

/**
 * Given a flat rep, this function reconstructs a RichText representation from
 * it.
 *
 * @param flatRep A flat rep
 * @returns A new RichText object (with internal copies of the flat rep as
 *          needed).
 */
export function reconstructRichText(flatRep: Iterable<FlatRepAtom>): RichText {
  const root: ElementNode = { children: [] };
  const pointers = new Set<Pointer>();
  const path: ElementNode[] = [root];
  const charPointersMap = new Map<TextNode, Set<Pointer>>();
  // Rebuild pointers from pointer values
  flatRep = reconstructPointers(flatRep, charPointersMap);
  // Concat single char text nodes to full text nodes while re-aligning pointers
  flatRep = reconstructTextNodes(flatRep, (deletedNode, newNode, newOffset) => {
    const ptrs = charPointersMap.get(deletedNode);
    if (ptrs) {
      for (const p of ptrs) {
        p.node = newNode;
        p.offset = newOffset;
        pointers.add(p);
      }
    }
  });
  // At this point our flat rep has no pointers, and text nodes have been
  // rebuilt with full length strings. Proceed to reconstruct the tree.
  for (let value of flatRep) {
    if (isElementSpacer(value)) {
      continue; // Skip diff speedup spacers
    } else if (isDepthMarker(value)) {
      // Depth marker found. If it's bigger than current depth, try to drill one
      // level in
      if (value.depthMarker >= path.length) {
        const curParent = path[path.length - 1];
        const children = curParent.children;
        if (children.length > 0) {
          const lastChild = children[children.length - 1];
          if (isElementNode(lastChild)) {
            path.push(lastChild);
          }
        }
      }
      // As long as our marker is lesser than current depth, back up one level
      while (value.depthMarker < path.length - 1) {
        path.pop();
      }
    } else if (isTreeNode(value)) {
      // Found a node. Append it to current parent
      const parent = path[path.length - 1];
      const children = parent.children;
      if (!isTextNode(value)) {
        // Next nodes have already been copied by reconstructTextNodes().
        // We must copy other nodes ourselves.
        value = coreValueClone(value, {
          fieldCloneOverride: cleanCloneTreeAtomField,
        });
      }
      children.push(value);
    } else {
      notReached('Unknown atom');
    }
  }
  const result: RichText = {
    root,
  };
  if (pointers.size > 0) {
    result.pointers = pointers;
  }
  return result;
}

const kCoreValuePtrToValue: CoreValueCloneOpts = {
  objectFilterFields: (key: string) => key !== 'node' && key !== 'offset',
};

/**
 * Converts pointers to pointer values.
 */
export function* convertPtrsToValues(
  flatRep: Iterable<FlatRepAtom>,
): Generator<FlatRepAtom> {
  for (const atom of flatRep) {
    if (isPointer(atom)) {
      yield coreValueClone(atom, kCoreValuePtrToValue);
    } else {
      yield atom;
    }
  }
}

/**
 * @param pointers A set of pointers.
 * @returns A set of all pointer keys.
 */
function keysFromPointers(pointers: Set<Pointer> | undefined): Set<string> {
  const result = new Set<string>();
  if (pointers === undefined) {
    return result;
  }
  for (const ptr of pointers) {
    result.add(ptr.key);
  }
  return result;
}

/**
 * An [index, pointer] tuple.
 */
export type IndexedPointerValue = [index: number, ptr: PointerValue];

function* filterExpiredPointers(
  flatRep: Iterable<FlatRepAtom>,
): Generator<FlatRepAtom> {
  for (const atom of flatRep) {
    if (!isPointerValue(atom) || !isExpiredPointer(atom)) {
      yield atom;
    }
  }
}

/**
 * Given a flat rep, this function filters out pointers as per the given filter
 * function.
 *
 * @param flatRep The flat rep to filter.
 * @param outFilteredPointers An array to which the removed pointers and their
 *                            corresponding indexes will be added.
 * @param filter A filter function.
 *
 * @returns A flat rep with the filtered out pointers removed.
 */
export function* filteredPointersRep(
  flatRep: Iterable<FlatRepAtom>,
  filter: (ptr: PointerValue) => boolean,
  outFilteredPointers?: IndexedPointerValue[],
): Generator<FlatRepAtom> {
  let idx = 0;
  for (let atom of flatRep) {
    if (isPointerValue(atom) && filter(atom)) {
      // Convert pointers to values
      if (isPointer(atom)) {
        atom = coreValueClone(atom, kCoreValuePtrToValue);
      }
      if (outFilteredPointers) {
        outFilteredPointers.push([Math.max(0, idx - 1), atom as PointerValue]);
      }
    } else {
      yield atom;
      ++idx;
    }
  }
}

function flatDestForPointerProjection(
  dstRt: RichText,
  needFilter: boolean,
  filter: (ptr: PointerValue) => boolean,
) {
  const flat = flattenRichText(dstRt, true, true);
  if (needFilter) {
    return filteredPointersRep(flat, filter);
  }
  return flat;
}

export function pointerIsExpired(ptr: PointerValue): boolean {
  const expiration = ptr.expiration;
  return expiration !== undefined && expiration.getTime() < Date.now();
}

function hasPointersToProject(
  ptrSet: Set<Pointer>,
  filter: (ptr: PointerValue) => boolean,
  skipExpired: boolean,
): boolean {
  for (const ptr of ptrSet) {
    if (filter(ptr) && (!skipExpired || !pointerIsExpired(ptr))) {
      return true;
    }
  }
  return false;
}

/**
 * Given two rich texts, this function:
 * 1. Finds which pointers are present in the source but are missing in the
 *    destination.
 * 2. Projects all missing pointers into the destination text's domain.
 * 3. Constructs and returns a new rich text containing all missing pointers
 *    from the source text.
 * @param srcRt The source text.
 * @param dstRt The destination text.
 * @returns A new RichText instance with all missing pointers.
 */
export function projectPointers(
  srcRt: RichText,
  dstRt: RichText,
  filter: (ptr: PointerValue) => boolean,
  skipExpired = true,
  filterDest = false,
): RichText {
  // Shortcut if we don't need to do any work
  if (
    srcRt.pointers === undefined ||
    srcRt.pointers.size === 0 ||
    !hasPointersToProject(srcRt.pointers, filter, skipExpired) ||
    coreValueEquals(srcRt, dstRt)
  ) {
    return coreValueClone(dstRt);
  }
  const ptrsToProject: IndexedPointerValue[] = [];
  // Flatten our source text while stripping out pointers that need to be
  // projected. This transforms the src text to the same domain as the
  // destination text, making a diff meaningful. Without filtering, all missing
  // pointers would count as deleted in the destination.
  let flatRepSrc: Iterable<FlatRepAtom> = flattenRichText(srcRt, true, true);
  // flatRepSrc = Array.from(flatRepSrc);
  if (skipExpired) {
    flatRepSrc = filterExpiredPointers(flatRepSrc);
    // flatRepSrc = Array.from(flatRepSrc);
  }
  flatRepSrc = filteredPointersRep(flatRepSrc, filter, ptrsToProject);
  // flatRepSrc = Array.from(flatRepSrc);
  // Flatten normally the destination text, including its pointers
  const strRep = new StringRep(kCoreValueTreeNodeOpts);
  const str1 = strRep.encode(flatRepSrc);

  const str2 = strRep.encode(
    flatDestForPointerProjection(dstRt, filterDest, filter),
  );
  // Compute a diff from our filtered source to our unmodified destination
  const textDiffs = kDMP.diff_main(str1, str2, true);
  const mergeCtx = new MergeContext(
    flatDestForPointerProjection(dstRt, filterDest, filter),
    kCoreValueTreeNodeOpts,
  );
  // For every pointer that need to be projected, we take its index in the
  // filtered source, project it to an index in the destination text, then
  // merge the pointer in at that index.
  for (const [srcIdx, ptrValue] of ptrsToProject) {
    // PointerValue must appear after the text node it points at so add 1 to
    // the destination index
    mergeCtx.insert(kDMP.diff_xIndex(textDiffs, srcIdx) + 1, ptrValue);
  }
  // Now our merge context holds the destination text with projected pointers
  // inserted in the correct places. We can safely reconstruct the updated tree.
  const result = reconstructRichText(mergeCtx.finalize());

  // Some pointers may be missing from the result, if they point after the end
  // of the merged text. Manually copy them to the end of the document.
  let lastTextNode = findLastTextNode(result.root);
  if (!lastTextNode) {
    debugger;
    lastTextNode = { text: '' };
    result.root.children.push({ children: lastTextNode, tagName: 'p' });
  }
  const ptrs = Array.from(result.pointers || []);
  for (const [_, candidate] of ptrsToProject) {
    let found = false;
    for (const p of ptrs) {
      if (p.key === candidate.key) {
        found = true;
        break;
      }
    }
    if (found) {
      continue;
    }
    ptrs.push({
      ...candidate,
      node: lastTextNode,
      offset: lastTextNode.text.length,
    });
  }
  if (ptrs.length > 0) {
    result.pointers = new Set(ptrs);
  }
  return result;
}

/**
 * Given a flat rep, this function filters out any non-local formatting. The
 * resulting representation contains a single paragraph with all leaf nodes,
 * as all as any local elements.
 * @param flatRep
 */
export function* stripFormattingFilter(
  flatRep: Iterable<FlatRepAtom>,
): Generator<FlatRepAtom> {
  let depth = 0;
  let hasOpenParagraph = false;
  for (const atom of flatRep) {
    if (isDepthMarker(atom)) {
      depth = atom.depthMarker;
    }
    if (!isTreeNode(atom)) {
      yield atom;
      continue;
    }
    if (isTextNode(atom) || !isElementNode(atom)) {
      // Found a leaf. First open a paragraph if needed.
      if (!hasOpenParagraph) {
        ++depth;
        yield {
          tagName: 'p',
          children: [],
        } as ElementNode;
        yield {
          depthMarker: depth,
        } as DepthMarker;
        hasOpenParagraph = true;
      }
      // Trivial or non text nodes can be returned as is
      const isText = isTextNode(atom);
      if (
        (isText && isTrivialTextNode(atom)) ||
        (!isText && !isElementNode(atom))
      ) {
        yield atom;
      } else if (isText) {
        // Non-trivial text nodes need to have their formatting stripped out
        // (i.e make them trivial)
        const copy: TextNode = {
          text: (atom as unknown as TextNode).text,
        };
        if (atom.isLocal === true) {
          copy.isLocal = true;
        }
        yield copy;
      }
    } else if (isElementNode(atom) && atom.isLocal === true) {
      // Close our open paragraph if we found a local element
      if (hasOpenParagraph) {
        yield {
          depthMarker: --depth,
        } as DepthMarker;
        hasOpenParagraph = false;
      }
      yield atom;
    }
  }
  if (hasOpenParagraph) {
    yield {
      depthMarker: --depth,
    } as DepthMarker;
    hasOpenParagraph = false;
  }
}
