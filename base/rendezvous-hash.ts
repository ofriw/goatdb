import { murmur3 } from './hash.ts';

const K_MURMUR_SEED = 7366173373169631;

export class RendezvousHash<T extends string | number> {
  private readonly _peers: Set<T>;

  constructor(peers?: Iterable<T>) {
    this._peers = new Set(peers);
  }

  addPeer(p: T): void {
    this._peers.add(p);
  }

  removePeer(p: T): void {
    this._peers.delete(p);
  }

  peerForKey(key: string | null): T | undefined {
    const peers = this._peers;
    if (!peers.size) {
      return undefined;
    }
    const entries: RendezvousEntry<T>[] = [];
    const normalizedKey = key === null ? 'null' : `"${key}"`;
    for (const p of peers) {
      entries.push([p, murmur3(`${p}/${normalizedKey}`, K_MURMUR_SEED)]);
    }
    entries.sort(compareRendezvousEntries);
    return entries[0][0];
  }
}

type RendezvousEntry<T extends string | number> = [server: T, hash: number];
function compareRendezvousEntries<T extends string | number>(
  e1: RendezvousEntry<T>,
  e2: RendezvousEntry<T>,
): number {
  return e1[1] - e2[1];
}
