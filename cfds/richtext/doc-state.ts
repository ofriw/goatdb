import { CoreObject } from '../../base/core-types/index.ts';
import {
  dfs,
  ElementNode,
  findFirstTextNode,
  findLastTextNode,
  isElementNode,
  isPointer,
  isTextNode,
  pathToNode,
  Point,
  Pointer,
  PointerDirection,
  PointerType,
  RichText,
  TextNode,
  TreeNode,
} from './tree.ts';
import { assert, notReached } from '../../base/error.ts';
import { TreeKeys } from './tree-keys.ts';
import {
  flattenRichText,
  PointerValue,
  projectPointers,
  reconstructRichText,
} from './flat-rep.ts';
import { Dictionary } from '../../base/collections/dict.ts';
import {
  resolveWritingDirection,
  WritingDirection,
} from '../../base/string.ts';
import { isRefNode, MarkupElement, MarkupNode } from './model.ts';

export interface Range extends CoreObject {
  anchor: Point;
  focus: Point;
  dir: PointerDirection;
  isLocal?: boolean;
  expiration?: Date;
}

export interface DocumentRanges extends CoreObject {
  [key: string]: Range;
}

export interface UnkeyedDocument extends CoreObject {
  root: ElementNode;
  ranges?: DocumentRanges;
}

export interface Document extends UnkeyedDocument {
  nodeKeys: TreeKeys;
}

export function docFromRT(rt: RichText | UnkeyedDocument): Document {
  const result: Document = {
    root: rt.root,
    nodeKeys: new TreeKeys(rt.root),
  };

  // if (rt.ranges !== undefined) {
  //   result.ranges = rt.ranges as DocumentRanges;
  // }

  if (rt.pointers !== undefined) {
    result.ranges = composeRanges(rt);
  }

  return result;
}

export function docToRT(doc: RichText | UnkeyedDocument): RichText {
  const result: RichText = {
    root: doc.root,
  };
  // if (doc.pointers !== undefined) {
  //   result.pointers = doc.pointers as Set<Pointer>;
  // }
  if (doc.ranges !== undefined) {
    const pointers = decomposeRanges(doc);
    if (pointers.size > 0) {
      result.pointers = pointers;
    }
  }
  return result;
}

export function docClone(doc: Document): Document {
  return docFromRT(
    reconstructRichText(flattenRichText(docToRT(doc), true, false)),
  );
}

export function isDocument(doc: UnkeyedDocument): doc is Document {
  return doc.nodeKeys instanceof TreeKeys;
}

export function unkeyedDocToDoc(doc: UnkeyedDocument): Document {
  if (isDocument(doc)) {
    return doc;
  }
  return {
    ...doc,
    nodeKeys: new TreeKeys(doc.root),
  };
}

export function composeRanges(rt: RichText): DocumentRanges {
  const result: DocumentRanges = {};
  if (rt.pointers === undefined) {
    return result;
  }
  let lastTextNode: TextNode | undefined;
  let firstTextNode: TextNode | undefined;
  for (const ptr of rt.pointers) {
    if (isPointer(ptr)) {
      // Skip expired pointers
      // if (ptr.expiration && ptr.expiration.getTime() < now) {
      //   continue;
      // }
      let range = result[ptr.key];
      if (range === undefined) {
        if (ptr.type === 'anchor') {
          if (ptr.dir === PointerDirection.Forward) {
            if (lastTextNode === undefined) {
              lastTextNode = findLastTextNode(rt.root)!;
            }
            range = {
              anchor: {
                node: ptr.node,
                offset: ptr.offset,
              },
              focus: {
                node: lastTextNode,
                offset: lastTextNode.text.length,
              },
              dir: ptr.dir,
            };
          } else if (ptr.dir === PointerDirection.Backward) {
            if (firstTextNode === undefined) {
              firstTextNode = findFirstTextNode(rt.root)!;
            }
            range = {
              anchor: {
                node: ptr.node,
                offset: ptr.offset,
              },
              focus: {
                node: firstTextNode,
                offset: 0,
              },
              dir: ptr.dir,
            };
          }
        } else {
          assert(ptr.type === 'focus');
          if (ptr.dir === PointerDirection.Backward) {
            if (lastTextNode === undefined) {
              lastTextNode = findLastTextNode(rt.root)!;
            }
            range = {
              anchor: {
                node: lastTextNode,
                offset: lastTextNode.text.length,
              },
              focus: {
                node: ptr.node,
                offset: ptr.offset,
              },
              dir: ptr.dir,
            };
          } else if (ptr.dir === PointerDirection.Forward) {
            if (firstTextNode === undefined) {
              firstTextNode = findFirstTextNode(rt.root)!;
            }
            range = {
              anchor: {
                node: firstTextNode,
                offset: 0,
              },
              focus: {
                node: ptr.node,
                offset: ptr.offset,
              },
              dir: ptr.dir,
            };
          }
        }
        if (range === undefined) {
          assert(ptr.dir === PointerDirection.None);
          range = {
            anchor: {
              node: ptr.node,
              offset: ptr.offset,
            },
            focus: {
              node: ptr.node,
              offset: ptr.offset,
            },
            dir: ptr.dir,
          };
        }
        // Update in resulting map
        result[ptr.key] = range;
      } else {
        // Update an existing range entry
        // TODO(ofri): Only allow expansion of the range
        range[ptr.type] = {
          node: ptr.node,
          offset: ptr.offset,
        };
      }

      // Bump expiration up if needed
      if (
        ptr.expiration &&
        (range.expiration === undefined ||
          range.expiration.getTime() < ptr.expiration.getTime())
      ) {
        range.expiration = ptr.expiration;
      }
      // Copy local flag
      if (ptr.isLocal) {
        range.isLocal = true;
      }
    }
  }
  return result;
}

function nodesByFlatIndexes(rt: RichText): Dictionary<TreeNode, number> {
  const result = new Map<TreeNode, number>();
  let idx = 0;
  for (const [node] of dfs(rt.root)) {
    result.set(node, idx);
    if (isTextNode(node)) {
      idx += node.text.length;
    }
    idx += 1;
  }
  return result;
}

export function decomposeRanges(doc: UnkeyedDocument): Set<Pointer> {
  if (doc.ranges === undefined) {
    return new Set();
  }
  const result = new Set<Pointer>();
  // const now = Date.now();
  const nodesToIndexes = nodesByFlatIndexes({ root: doc.root });
  for (const [key, range] of Object.entries(doc.ranges)) {
    // if (range.expiration !== undefined && range.expiration.getTime() < now) {
    //   continue;
    // }
    const anchorNodeOffset = nodesToIndexes.get(range.anchor.node)!;
    const focusNodeOffset = nodesToIndexes.get(range.focus.node)!;
    const dir =
      anchorNodeOffset < focusNodeOffset
        ? PointerDirection.Forward
        : anchorNodeOffset > focusNodeOffset
        ? PointerDirection.Backward
        : range.anchor.offset < range.focus.offset
        ? PointerDirection.Forward
        : range.anchor.offset > range.focus.offset
        ? PointerDirection.Backward
        : PointerDirection.None;
    result.add(buildRangePointer(key, range, 'anchor', dir));
    result.add(buildRangePointer(key, range, 'focus', dir));
  }
  return result;
}

function buildRangePointer(
  key: string,
  range: Range,
  type: PointerType,
  dir: PointerDirection,
): Pointer {
  const result: Pointer = {
    key,
    type,
    dir,
    node: range[type].node,
    offset: range[type].offset,
  };
  if (range.expiration !== undefined) {
    result.expiration = range.expiration;
  }
  if (range.isLocal) {
    result.isLocal = true;
  }
  return result;
}

export interface RangeFilter {
  (key: string): boolean;
}

/**
 * Given two documents, this function projects pointers from the source to
 * destination doc, adjusting for any edits that happened between the two docs.
 *
 * Use this function before updating a note's body to project ranges other than
 * the ones you've changed.
 *
 * @param src Source document
 * @param dst Destination document. This function updates the destination in
 *            place.
 * @returns The updated destination document.
 */
export function projectRanges(
  src: UnkeyedDocument,
  dst: UnkeyedDocument,
  filter: (ptr: PointerValue) => boolean,
): Document {
  if (src.ranges === undefined) {
    return unkeyedDocToDoc(dst);
  }
  return unkeyedDocToDoc(
    docFromRT(projectPointers(docToRT(src), docToRT(dst), filter)),
  );
}

function nodePathToIndexPath(
  root: ElementNode,
  nodePath: readonly ElementNode[],
): number[] {
  const result: number[] = [];
  let parent: ElementNode = root;
  for (const element of nodePath) {
    const idx = parent.children.indexOf(element);
    assert(idx >= 0);
    result.push(idx);
    parent = element;
  }
  return result;
}

export function pointToPath(
  document: UnkeyedDocument,
  point: Point,
): { path: number[]; offset: number } {
  for (const [node, _depth, path] of dfs(document.root)) {
    if (node === point.node) {
      const indexPath = nodePathToIndexPath(document.root, path);
      indexPath.push(path[path.length - 1].children.indexOf(node));
      return {
        path: indexPath,
        offset: point.offset,
      };
    }
  }
  notReached();
}

export function findEndOfDocument(document: Document): TextNode | ElementNode {
  let lastTextNode: TextNode | undefined;
  let lastParent: ElementNode = document.root;
  for (const [node] of dfs(document.root)) {
    if (isTextNode(node)) {
      lastTextNode = node;
    } else if (isElementNode(node)) {
      lastParent = node;
    }
  }
  return lastTextNode || lastParent;
}

export function writingDirectionAtTextNode(
  doc: Document,
  node: TextNode,
  baseDirection: WritingDirection = 'auto',
): WritingDirection {
  const focusPath = pathToNode<MarkupElement>(doc.root, node);
  if (!focusPath) {
    return baseDirection;
  }
  for (let i = focusPath.length - 1; i >= 0; --i) {
    const node = focusPath[i];
    if (node.dir && node.dir !== 'auto') {
      return node.dir;
    }
  }
  const dir = resolveWritingDirection(node.text);
  return dir === 'auto' ? baseDirection : dir;
}

export function writingDirectionAtNode(
  doc: Document,
  node: MarkupNode,
  baseDirection: WritingDirection = 'auto',
): WritingDirection {
  if (!isTextNode(node)) {
    const path = pathToNode<MarkupElement>(doc.root, node)!;
    // For tasks, look at the previous task and copy its direction, meaning
    // first tasks dictates the direction.
    // if (!path.length && isRefNode(node)) {
    //   const root = doc.root;
    //   const idx = root.children.indexOf(node);
    //   if (idx > 0) {
    //     const maybePrevRef = root.children[idx - 1];
    //     if (isRefNode(maybePrevRef)) {
    //       return writingDirectionAtNode(doc, maybePrevRef, baseDirection);
    //     }
    //   }
    // }
    for (const parent of path) {
      const dir = writingDirectionAtNode(doc, parent, baseDirection);
      if (dir !== 'auto') {
        return dir;
      }
    }
  }
  const textNode = isTextNode(node) ? node : findFirstTextNode(node, true);
  return textNode
    ? writingDirectionAtTextNode(doc, textNode, baseDirection)
    : baseDirection;
}
