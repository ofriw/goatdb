import { assert } from './error.ts';
import { unionIter } from './set.ts';
import { Dictionary } from './collections/dict.ts';
import { HashSet } from './collections/hash-map.ts';

export interface Edge {
  vertex: string;
  fieldName: string;
}

function hashEdge(edge: Edge): string {
  return `${edge.vertex}/${edge.fieldName}`;
}

function eqEdges(e1: Edge, e2: Edge): boolean {
  return e1.vertex === e2.vertex && e1.fieldName === e2.fieldName;
}

export class AdjacencyList {
  private _inEdges: Dictionary<string, HashSet<Edge>>;
  private _outEdges: Dictionary<string, HashSet<Edge>>;

  constructor() {
    this._inEdges = new Map();
    this._outEdges = new Map();
  }

  get isEmpty(): boolean {
    return this._inEdges.size === 0 && this._outEdges.size === 0;
  }

  hasInEdges(vertKey: string): boolean {
    const set = this._inEdges.get(vertKey);
    return set !== undefined && set.size > 0;
  }

  addEdge(src: string, dst: string, fieldName: string): boolean {
    let outSet = this._outEdges.get(src);
    if (outSet === undefined) {
      outSet = new HashSet(hashEdge, eqEdges);
      this._outEdges.set(src, outSet);
    }
    const success = outSet.add({
      vertex: dst,
      fieldName,
    });
    let inSet = this._inEdges.get(dst);
    if (inSet === undefined) {
      inSet = new HashSet(hashEdge, eqEdges);
      this._inEdges.set(dst, inSet);
    }
    // Sanity check. Both sides must be in sync
    assert(
      success ===
        inSet.add({
          vertex: src,
          fieldName,
        }),
      `addEdge failed. src: ${src}, dest: ${dst}, fieldName: ${fieldName}`,
    );
    return success;
  }

  deleteEdge(src: string, dst: string, fieldName: string): boolean {
    const outSet = this._outEdges.get(src);
    const inSet = this._inEdges.get(dst);
    const success = Boolean(outSet?.delete({ vertex: dst, fieldName }));
    // Sanity check. Both sides must be in sync
    assert(
      success ===
        Boolean(
          inSet?.delete({
            vertex: src,
            fieldName,
          }),
        ),
      `deleteEdge failed. src: ${src}, dest: ${dst}, fieldName: ${fieldName}`,
    );
    return success;
  }

  inEdges(vertKey: string, fieldName?: string): Generator<Edge> {
    return filterEdges(vertKey, fieldName, this._inEdges);
  }

  outEdges(vertKey: string, fieldName?: string): Generator<Edge> {
    return filterEdges(vertKey, fieldName, this._outEdges);
  }

  *uniqueEdges(vertKey: string, fieldName?: string): Generator<string> {
    const seenKeys = new Set<string>();
    for (const { vertex: key } of this.outEdges(vertKey, fieldName)) {
      seenKeys.add(key);
      yield key;
    }
    for (const { vertex: key } of this.inEdges(vertKey, fieldName)) {
      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
      yield key;
    }
  }

  *uniqueVertexKeys(): Generator<string> {
    for (const key of unionIter(this._inEdges.keys(), this._outEdges.keys())) {
      // If this generator is broken to chunks by a background coroutine, we may
      // return old results here
      if (this.hasVertex(key)) {
        yield key;
      }
    }
  }

  hasVertex(key: string): boolean {
    return this._inEdges.has(key) || this._outEdges.has(key);
  }

  hasEdge(src: string, dst: string, fieldName?: string): boolean {
    if (fieldName) {
      return this._outEdges.get(src)?.has({ vertex: dst, fieldName }) === true;
    }
    for (const edge of this.outEdges(src)) {
      if (edge.vertex === dst) {
        return true;
      }
    }
    return false;
  }
}

function* filterEdges(
  vertKey: string,
  fieldName: string | undefined,
  dict: Dictionary<string, HashSet<Edge>>,
): Generator<Edge> {
  const edges = dict.get(vertKey);
  if (edges === undefined) {
    return;
  }
  for (const edge of edges) {
    if (fieldName === undefined || edge.fieldName === fieldName) {
      yield edge;
    }
  }
}
