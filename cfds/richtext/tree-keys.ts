import { Dictionary } from '../../base/collections/dict.ts';
import { HashMap } from '../../base/collections/hash-map.ts';
import {
  Clonable,
  Equatable,
  CoreValue,
  coreValueEquals,
} from '../../base/core-types/index.ts';
import { encodableValueHash } from '../../base/core-types/encoding/index.ts';
import { dfs, ElementNode, kCoreValueTreeNodeOpts } from './tree.ts';
import { isElementNode } from './tree.ts';
import { isTextNode } from './tree.ts';

export type NodeKey = string;

export class TreeKeys implements Clonable, Equatable<TreeKeys> {
  private readonly _root: ElementNode;
  private readonly _nodeToKey: Dictionary<CoreValue, string>;
  private readonly _keyToNode: Dictionary<string, CoreValue>;
  private readonly _hashToCount: Dictionary<string, number>;

  constructor(root: ElementNode) {
    this._root = root;
    this._nodeToKey = new HashMap<CoreValue, string>(
      encodableValueHash,
      (n1, n2) => n1 === n2,
    );
    this._keyToNode = new Map();
    this._hashToCount = new Map();
    for (const [node] of dfs(root)) {
      this.keyFor(node);
    }
  }

  keyFor(node: CoreValue): NodeKey {
    let result = this._nodeToKey.get(node);
    if (!result) {
      const hash = encodableValueHash(node, kCoreValueTreeNodeOpts);
      const idx: number = this._hashToCount.get(hash) || 0;
      const tagName =
        (isElementNode(node) && node.tagName) ||
        (isTextNode(node) && 'text') ||
        undefined;
      result = `${tagName || ''}/${hash}/${idx}`;
      this._hashToCount.set(hash, idx + 1);
      this._nodeToKey.set(node, result);
      this._keyToNode.set(result, node);
    }
    return result;
  }

  clone(): TreeKeys {
    return new TreeKeys(this._root);
  }

  isEqual(other: TreeKeys): boolean {
    const thisCounts = this._nodeToKey;
    const otherCounts = other._nodeToKey;
    for (const [key, value] of thisCounts) {
      if (otherCounts.get(key) !== value) {
        return false;
      }
    }
    for (const key of otherCounts.keys()) {
      if (!thisCounts.has(key)) {
        return false;
      }
    }
    return true;
  }

  nodeFromKey(key: string): CoreValue | undefined {
    return this._keyToNode.get(key);
  }
}
