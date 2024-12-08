# Conflict Resolution

Whenever a node in the network detects more than one differing value at the leaves of the [commit graph](commit-graph.md), it performs a [three-way merge](<https://en.wikipedia.org/wiki/Merge_(version_control)#Three-way_merge>) to resolve the conflict. Internally, a conflict-free patch function is used temporarily during the merge process.

## CRDTs

Conflict-Free Replicated Data Structures (CRDTs) were designed to enable concurrent editing without centralized synchronization, making them particularly well-suited for conflict resolution. While CRDTs elegantly resolve conflicts, they are often difficult to scale due to their tendency to inspect the entire history to produce the latest value.

GoatDB overcomes the traditional scaling challenges of CRDTs by restricting their usage to the context of a three-way merge. During a merge, the base version is first transformed into a short-lived CRDT. Changes computed by the diff function are then applied to the generated CRDT. Finally, the resulting output from the CRDT is captured and saved as the commit's contents, while the CRDT itself is discarded. This approach ensures that the CRDT’s changeset is limited to the scope of a single three-way merge.

## Exploiting Three-Way Merge

While early implementations of GoatDB utilized a short-lived CRDT for merging conflicts, a more efficient approach was developed for the specific context of three-way merges.

First, consider the core principle behind the [Logoot CRDT](https://inria.hal.science/inria-00432368/document): **continuity**. Logoot's innovation lies in abandoning fixed indexes in favor of treating them as continuous identifiers. For example, starting with the value "ABC":

```
Value:  A B C
        - - -
Index:  0 1 2
```

If Node N1 changes the value to "BCY," it would traditionally be represented as:

```
Value:  B C Y
        - - -
Index:  0 1 2

Changes: [-A, 0], [+Y, 2]
```

Simultaneously, if Node N2 changes "ABC" to "ABX," it would traditionally be represented as:

```
Value:  A B X
        - - -
Index:  0 1 2

Changes: [-C, 2], [+X, 2]
```

Using fixed indexes, removing "A" at index 0 affects how subsequent changes are interpreted. However, Logoot resolves this by treating indexes as continuous identifiers. GoatDB supplements this idea with the following rules:

- Deletions can only apply to values that exist in the base version.
- Insertions can only occur between values in the base version.

Revisiting the example, the updates become:

### Base Version

```
Value:    A   B   C
        - - - - - - -
Index:  0 1 2 3 4 5 6
```

### Node N1

```
Value:        B   C Y
        - - - - - - -
Index:  0 1 2 3 4 5 6

Changes: [-A, 1], [+Y, 6]
```

### Node N2

```
Value:    A   B     X
        - - - - - - -
Index:  0 1 2 3 4 5 6

Changes: [-C, 5], [+X, 6]
```

Now, there is a single insertion conflict at index 6. To resolve this, GoatDB employs three resolution strategies, all of which rely on an external, predefined order agreed upon by all nodes in the network. In the current implementation, we use the random IDs of the commits to establish a global order. The resolution strategies are as follows:

1. **Either**: Select one of the conflicting changes based on the predefined order. The result could be "BY" or "BX."
2. **Both**: Include both changes, resulting in either "BYX" or "BXY."
3. **Merged**: Globally order the changes and compute a union diff. For instance, if "Y" and "X" are replaced with "cat" and "hat" respectively, the changes ["+cat", 6] and ["+hat", 6] resolve to "chat" (or "hcat" depending on the order). The final result could be "Bchat" or "Bhcat."

This approach ensures efficient conflict resolution tailored to the requirements of a three-way merge while maintaining scalability and performance.
