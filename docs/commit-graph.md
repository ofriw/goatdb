# Commit Graph

The underlying data structure powering GoatDB is a commit graph. If you've ever worked with a Distributed Version Control System (DVCS) like Git, this concept should feel quite familiar. However, unlike some DVCS, GoatDB's commit graph is **append-only**, meaning that commits can only be added, not deleted. Notably, an append-only commit graph is a type of [Conflict-Free Replicated Data Structure (CRDT)](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type), which contributes to GoatDB's scalability and performance.

Simply put, all data creation and editing operations in GoatDB append new commits to the replicated commit graph. The commit graph is then synchronized in the background, in real-time, with other nodes in the network.

Each commit in the graph is signed with the private key of the node that created it. This enables the network to verify the graph and ensures that:

1. All commits were created by known, trusted nodes.
2. Each commit edited only what was allowed, effectively enforcing permissions retroactively. A commit that appears to perform unauthorized modifications is simply ignored by the network.

The length of the commit graph—that is, how much history is retained—determines the maximum supported offline period. For example, if configured to retain two weeks of history, clients can go offline for up to two weeks and still rejoin the network and merge their offline edits.

## Creation Process

When creating a new commit, a node follows the procedure below:

1. Capture the state of the data in a commit format.
2. Apply [delta compression](#delta-compression).
3. Sign the result with the node's private key.
4. Write the new commit to the replicated graph.

## Delta Compression

Like any other compression strategy, delta compression usually reduces the size of the data, but not always. Consider, for example, the case of deleting an entire document. Attempting to delta-compress it would result in the entire original document being encoded as the delta, whereas storing the actual empty document would obviously be more compact. Additionally, reading a delta-compressed commit incurs a small performance penalty, as the system needs to reapply the patches.

To balance these processes, GoatDB's implementation first computes a delta-compressed commit and then compares it with the original full snapshot commit. Only if the delta representation is smaller than a predetermined, fixed threshold will it be used; otherwise, the full snapshot will be chosen instead.

Intuitively, one might be tempted to compute deltas from the previous commit, potentially creating a long chain of delta commits. This approach hurts read performance since, to decompress the latest commit, the system must first decompress all of its ancestors. Instead, GoatDB computes deltas relative to **the last known full commit**.

For example, consider the chain of commits:

```
A < B < C
```

Here, `A` is a full snapshot, while `B` and `C` are delta-compressed. `B` computes its patches relative to `A`, and `C` also computes its patches relative to `A`. This ensures that when reading delta-compressed commits, the reader needs to consider only one other commit. Because this base commit is likely shared by other delta-compressed commits, it is a good candidate for caching.

Another potential issue with delta compression is the loss of the base version. If the base version is lost or corrupted, the entire chain of dependent commits becomes unreadable. To mitigate this risk, GoatDB periodically (approximately every 20 commits) enforces the creation of a full snapshot commit, even if delta compression would otherwise be more efficient. This increases the system's reliability by avoiding long chains of delta-compressed commits, at the cost of minimal performance overhead.
