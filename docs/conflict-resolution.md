# Conflict Resolution

Whenever a node in the network detects more than one differing values at the leaves of of the commit graph, it'll perform a [three-way merge](<https://en.wikipedia.org/wiki/Merge_(version_control)#Three-way_merge>) in order to recover. Internally, a conflict-free patch function is used only for the duration of the merge.

## CTDTs

Conflict-Free Replicated Data structures were designed to enable concurrent editing without any central synchronization, and as such are especially suited for conflict resolution. While elegantly solving conflicts, CRDTs are typically hard to scale due to their tendency to inspect the entire history in order to produce the latest value.

GoatDB avoids the traditional scale challenges of CRDTs by restricting their use to the context of a three-way merge. When a merge is performed, the base version is first transformed into a short-lived CRDT. Next, changes computed by the diff function are applied to the previously generated CRDT. Finally, the resulting output of the CRDT is captured and saved as the commit's contents, while the CRDT itself is discarded. This way the changeset of the CRDT is limited to the number of changes that happen inside a single 3-way merge.

## Exploiting 3-Way Merge

While our initial implementations indeed used a short-lived CRDT, we found there's a better way to merge conflicts under the specific context of a 3-way merge.

First, let's consider the basic idea behind the [Logoot CRDT](https://inria.hal.science/inria-00432368/document) - _**Continuity**_. Logoot's brilliance is to stop looking at indexes and instead treat them like IDs. So for example, if we're starting with the value "ABC"

```
Value:  A B C
        - - -
Index:  0 1 2
```

Then node N1 changes it to "BCY", which would traditionally be represented as

```
Value:  B C Y
        - - -
Index:  0 1 2

Changes: [-A, 0], [+Y, 2]
```

Simultaneously, node N2 changes "ABC" to "ABX" which would also traditionally be represented as

```
Value:  A B X
        - - -
Index:  0 1 2

Changes: [-C, 2], [+X, 2]
```

and now if we start by removing "A" at 0, all other changes need to be handled differently. However Logoot suggests we fix the initial indexes, treat them as a continuous numbers. Combine that with the following observations:

- Deletions can only apply to values that exists in the base version
- Insertions can only happen in between values that exists in the base version

and now our example becomes:

#### Base

```
Value:    A   B   C
        - - - - - - -
Index:  0 1 2 3 4 5 6
```

#### N1

```
Value:        B   C Y
        - - - - - - -
Index:  0 1 2 3 4 5 6

Changes: [-A, 1], [+Y, 6]
```

#### N2

```
Value:    A   B     X
        - - - - - - -
Index:  0 1 2 3 4 5 6

Changes: [-C, 5], [+X, 6]
```

Notice how now we have a single insertion conflict at ID 6. To resolve it, we employ three different resolution strategies. Note that all of them require an external, predefined, order source that’s agreed upon all nodes in the network. We're using the random IDs of the commits here to fix a predefined random order. Armed with this global random order our resolution strategies are:

1. **Either**: The result would be BY or BX, depending on the chosen order.
2. **Both**: The result would be either BYX or BXY.
3. **Merged**: Order the changes globally, then compute a union diff of the conflicting insertions. For instance, replacing Y and X with "cat" and "hat" yields changes [+"cat", 6] and [+"hat", 6]. A union diff resolves conflicts to "chat" (or "hcat" based on the order), resulting in "Bchat" or "Bhcat".
