import { assert, notReached } from '../../base/error.ts';
import { Dictionary } from '../../base/collections/dict.ts';
import {
  CoreDictionary,
  CoreObject,
  CoreType,
  CoreValue,
  coreValueClone,
  CoreValueCloneOpts,
  getCoreType,
  isReadonlyCoreObject,
  ReadonlyCoreObject,
} from '../../base/core-types/index.ts';
import { OrderedMap } from '../../base/collections/orderedmap.ts';
import { FlatRepAtom, kElementSpacer } from './flat-rep.ts';

export const kCoreValueTreeNodeOpts = {
  objectFilterFields: treeAtomKeyFilterIgnoreText,
};

export interface RichText extends CoreObject {
  root: ElementNode;
  pointers?: Set<Pointer>;
}

export function isRichText(v: CoreValue): v is RichText {
  return isReadonlyCoreObject(v) && isElementNode(v.root);
}

export function onlyNoneLocal(v: CoreValue) {
  return isReadonlyCoreObject(v) && v.isLocal !== true;
}

/**
 * Base type for all rich text values in both tree and flat representations.
 */
export interface RichTextValue extends CoreObject {
  isLocal?: boolean;
}

export type TreeNode = TextNode | ElementNode | RichTextValue;

export interface TextNode extends RichTextValue {
  text: string;
}

export interface ElementNode extends RichTextValue {
  children: TreeNode[];
}

export type PointerType = 'anchor' | 'focus';

export enum PointerDirection {
  Forward = 1,
  Backward = -1,
  None = 0,
}

export interface Point extends CoreObject {
  local?: boolean;
  node: TextNode;
  offset: number;
}

export interface Pointer extends Point {
  key: string;
  type: PointerType;
  dir: PointerDirection;
  expiration?: Date;
}

export function treeAtomKeyFilterIgnoreText(
  key: string,
  obj: CoreValue,
): boolean {
  if (key === 'children' && isElementNode(obj)) {
    return false;
  }
  if ((key === 'node' || key === 'offset') && isPointer(obj)) {
    return false;
  }
  return true;
}

export function treeAtomKeyFilter(key: string, obj: CoreValue): boolean {
  if (key === 'text' && isTextNode(obj)) {
    return false;
  }
  return treeAtomKeyFilterIgnoreText(key, obj);
}

export function isTextNode(node: CoreValue): node is TextNode {
  return isReadonlyCoreObject(node) && typeof node.text === 'string';
}

export function isElementNode(node: CoreValue): node is ElementNode {
  return isReadonlyCoreObject(node) && node.children instanceof Array;
}

export function isPointer(obj: CoreValue): obj is Pointer {
  return isReadonlyCoreObject(obj) && isTextNode(obj.node);
}

export function isNodeSameLocality(n1: TreeNode, n2: TreeNode) {
  if (n1.isLocal === true) {
    return n2.isLocal === true;
  }

  if (n2.isLocal === true) {
    return false;
  }

  return true;
}

export function isTrivialTextNode(node: TreeNode): node is TextNode {
  if (!isTextNode(node)) {
    return false;
  }
  for (const k in node) {
    // deno-lint-ignore no-prototype-builtins
    if (node.hasOwnProperty(k) && k !== 'text') {
      return false;
    }
  }
  return true;
}

export function copyTreeAtom<T extends FlatRepAtom>(node: FlatRepAtom): T {
  if (node === kElementSpacer) {
    return node as T;
  }
  const result = coreValueClone(node, {
    objectFilterFields: treeAtomKeyFilter,
  });
  if (isTextNode(node)) {
    (result as TextNode).text = '';
  } else if (isElementNode(node)) {
    (result as ElementNode).children = [];
  }
  return result as T;
}

export function comparePointers(ptr1: Pointer, ptr2: Pointer): number {
  // Compare by keys
  if (ptr1.key !== ptr2.key) {
    if (ptr1.key < ptr2.key) {
      return -1;
    } else {
      return 1;
    }
  }
  // Keys equal. Compare by types
  if (ptr1.type !== ptr2.type) {
    if (ptr1.type < ptr2.type) {
      return -1;
    } else {
      return 1;
    }
  }
  // Types equal. Compare by directions
  if (ptr1.dir !== ptr2.dir) {
    return ptr1.dir - ptr2.dir;
  }
  // Directions equal. Compare by expiration
  if (!ptr1.expiration) {
    if (ptr2.expiration) {
      return -1;
    }
  } else if (!ptr2.expiration) {
    return 1;
  } else if (ptr1.expiration.getTime() !== ptr2.expiration.getTime()) {
    return ptr1.expiration.getTime() - ptr2.expiration.getTime();
  }
  return 0;
}

export function initRichText(): RichText {
  return {
    root: initRichTextRoot(),
  };
}

export function initRichTextRoot(): ElementNode {
  return {
    children: [
      {
        tagName: 'p',
        children: [
          {
            text: '',
          },
        ],
      },
    ],
  };
}

export function* dfs(
  root: ElementNode,
  mutate = false,
  _depth = 0,
  _path: ElementNode[] = [],
): Generator<readonly [TreeNode, number, readonly ElementNode[]]> {
  const children = mutate ? Array.from(root.children) : root.children;
  for (const child of children) {
    yield [child, _depth, _path];
    if (isElementNode(child)) {
      _path.push(child);
      for (const value of dfs(child, mutate, _depth + 1, _path)) {
        yield value;
      }
      assert(_path.pop() === child);
    }
  }
}

export function pointToAbsOffset(
  offsetsMap: OrderedMap<TreeNode, number>,
  ptr: Point,
): number {
  const nodeOffset = offsetsMap.get(ptr.node);
  assert(nodeOffset !== undefined);
  return offsetsMap.get(ptr.node)! + ptr.offset;
}

function* lookupNeighbors(
  offsetsMap: OrderedMap<TreeNode, number>,
  src: TreeNode,
): Generator<[TreeNode, number]> {
  let next = offsetsMap.next(src);
  let prev = offsetsMap.prev(src);
  while (!(next === undefined && prev === undefined)) {
    if (prev !== undefined) {
      yield [prev, -1];
      prev = offsetsMap.prev(prev);
    }
    if (next !== undefined) {
      yield [next, 1];
      next = offsetsMap.next(next);
    }
  }
}

/**
 * Translates an absolute offset to a relative pointer.
 *
 * @param offsetsMap The offsets map of our rich text.
 * @param offset The offset to translate.
 * @returns A relative pointer.
 */
export function pointFromAbsOffset(
  offsetsMap: OrderedMap<TreeNode, number>,
  offset: number,
): Point {
  // First, find the node which holds our absolute offset
  let targetNodeOffset = 0;
  let targetNode = offsetsMap.startKey!;
  for (const [node, nodeOffset] of offsetsMap) {
    if (nodeOffset > offset) {
      break;
    }
    targetNode = node;
    targetNodeOffset = nodeOffset;
  }
  // If we're lucky, our pointer falls inside a text node. Convert to relative
  // offset and we're done.
  if (isTextNode(targetNode)) {
    return {
      node: targetNode,
      offset: offset - targetNodeOffset,
    };
  }
  // Our target node isn't a text node. Start a lookup in both directions to
  // find the nearest text node
  for (const [candidate, dir] of lookupNeighbors(offsetsMap, targetNode)) {
    if (isTextNode(candidate)) {
      return {
        node: candidate,
        // If we landed on a previous node, place the pointer at its end.
        // If we landed on a later node, place the pointer at its start.
        offset:
          offsetsMap.get(candidate)! + (dir < 0 ? candidate.text.length : 0),
      };
    }
  }
  // Lookup failed. A pointer can't be rebuilt from the given offset since the
  // tree has no text nodes
  notReached('Rich text has no text nodes');
}

/**
 * @param v
 * @param buffer in milliseconds
 * @returns
 */
export function isExpiredPointer(v: CoreValue, buffer = 0): boolean {
  return (
    isPointer(v) &&
    v.expiration !== undefined &&
    v.expiration.getTime() + buffer < Date.now()
  );
}

/**
 * @param rt
 * @param buffer in milliseconds
 * @returns
 */
export function purgeExpiredPointers(
  rt: RichText,
  buffer = 0,
): RichText | undefined {
  if (rt.pointers === undefined || rt.pointers.size === 0) {
    return undefined;
  }
  const now = Date.now();
  let foundExpired = false;
  for (const ptr of rt.pointers) {
    if (
      ptr.expiration !== undefined &&
      ptr.expiration.getTime() + buffer < now
    ) {
      foundExpired = true;
      break;
    }
  }
  if (foundExpired) {
    const newPtrs = new Set<Pointer>();
    for (const ptr of rt.pointers) {
      if (ptr.expiration === undefined || ptr.expiration.getTime() >= now) {
        newPtrs.add(ptr);
      }
    }
    const result: RichText = {
      root: rt.root,
    };
    if (newPtrs.size > 0) {
      result.pointers = newPtrs;
    }
    return result;
  }
  return undefined;
}

export function* pointersForNode(
  ptrSet: Iterable<Pointer> | undefined,
  node: TreeNode,
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

export function cleanCloneTreeAtom(
  obj: ReadonlyCoreObject | CoreDictionary,
  key: string,
  _opts?: CoreValueCloneOpts,
): CoreValue {
  if (key === 'children' && isElementNode(obj as CoreValue)) {
    return [];
  }

  if (key === 'text' && isTextNode(obj as CoreValue)) {
    return '';
  }

  const type = getCoreType(obj);
  if (type === CoreType.Dictionary) {
    return (obj as Dictionary).get(key);
  } else {
    return (obj as ReadonlyCoreObject)[key];
  }
}

export function treeIsSubtree(root: ElementNode, subtree: TreeNode): boolean {
  if (root === subtree) {
    return true;
  }
  for (const [node] of dfs(root)) {
    if (node === subtree) {
      return true;
    }
  }
  return false;
}

export function treeToPlaintext(root: ElementNode | undefined): string {
  if (!root) {
    return '';
  }
  let result = '';
  let prevDepth = 1;
  let idx = 0;
  for (const [node, depth] of dfs(root)) {
    if (depth !== prevDepth) {
      prevDepth = depth;
    }

    if (isElementNode(node) && idx > 1) {
      result += '\n';
    }

    if (isTextNode(node)) {
      result += node.text;
    }
    ++idx;
  }
  return result;
}

export function plaintextToTree(text: string): ElementNode {
  return {
    children: [
      {
        text,
      },
    ],
  };
}

export function pathToNode<T extends ElementNode>(
  root: ElementNode,
  searchNode: TreeNode,
): readonly T[] | undefined {
  for (const [node, _depth, path] of dfs(root)) {
    if (node === searchNode) {
      return path as T[];
    }
  }
  return undefined;
}

export function findLastTextNode(
  root: ElementNode,
  notEmpty = false,
): TextNode | undefined {
  let textNode: TextNode | undefined;
  for (const [node] of dfs(root)) {
    if (isTextNode(node) && (notEmpty === false || node.text.length > 0)) {
      textNode = node;
    }
  }
  return textNode;
}

export function findFirstTextNode(
  root: ElementNode,
  notEmpty = false,
): TextNode | undefined {
  for (const [node] of dfs(root)) {
    if (isTextNode(node) && (notEmpty === false || node.text.length > 0)) {
      return node;
    }
  }
  return undefined;
}

export function findNode<T extends TreeNode>(
  root: ElementNode,
  predicate: (node: T) => boolean,
): [T, number, T[]] | undefined {
  for (const [node, depth, path] of dfs(root)) {
    if (predicate(node as T)) {
      return [node as T, depth, path as T[]];
    }
  }
  return undefined;
}
