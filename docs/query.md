# Real-Time Query Mechanism

In GoatDB, every node in the network maintains an independent, fully functional local copy of the database. Queries are executed locally, providing low-latency access and enabling offline capabilities. The real-time query mechanism ensures that query results are dynamically updated as the underlying data changes through incremental processing of updates.

## Overview

### Storage

The local source of truth is the history storage containing the [commit graph](commit-graph.md). This storage is [synchronized in the background](sync.md) in real-time. To facilitate queries, whenever a new commit is persisted to the local storage, it is assigned a monotonically increasing age number. Notably, this age value is local to the processing node and is never synchronized with the network.

A separate storage is used for query results, which acts as a cache. It stores the result set of the query alongside the age of the repository at the time the result set was generated.

### Executing a Query

When executing a new query, GoatDB first scans all available items in the repository, tracking the age of all items included in the result set. The result set is periodically persisted to disk during the initial scan and after the query completes.

Once the initial scan is complete, the query remains open in the client code. Any incoming commits trigger a re-check of the modified item by the query, updating the result set as necessary.

If a previously executed query is reopened, the initial scan leverages previously saved results to resume execution, skipping unmodified items that have already been processed.

### Query Chaining

GoatDB supports chaining queries—using the results of one query as the input to another. This enables dependent queries to scan smaller subsets of data, effectively acting as lightweight indexing.

### Consistency

This strategy ensures a fully consistent view for queries while enabling background storage maintenance when resources are available. Writes to the query storage are typically much slower than writes to the history storage and benefit from batching. By periodically caching query results in the background, batch updates enable faster bulk writes. Alternatively, if resources are scarce, query storage updates can be temporarily suspended with minimal performance penalties for queries.

### Intermittent Results and React UI Integration

GoatDB's real-time query mechanism provides intermittent query results during the initial scan and incremental updates as new data becomes available. This feature is particularly useful for building responsive and dynamic user interfaces in React.

#### Handling Intermittent Results

While executing a query, GoatDB progressively refines the result set. Developers can use this behavior to provide users with partial results immediately, improving the perceived performance of the application. For example:

1. **Initial Loading State:** Display a loading spinner or skeleton UI while the query begins scanning the repository.
2. **Partial Results:** As query results are refined, progressively update the UI to reflect the growing dataset.
3. **Final State:** When the query completes, present the full dataset to the user.

#### Leveraging React Hooks

GoatDB integrates seamlessly with React's declarative paradigm. By combining GoatDB’s real-time queries with custom hooks, developers can build components that automatically update as query results change:

```javascript
function ItemList() {
  const { query } = useQuery({
    scheme: kSchemeTask,
    source: '/data/tasks',
    predicate: ({ item }) => item.get('text').startsWith('lorem'),
  });

  if (query.loading) {
    return <div>Loading...</div>;
  }

  return (
    <ul>
      {query.results().map(({ key, item }) => (
        <li key={key}>{item.get('text')}</li>
      ))}
    </ul>
  );
}
```

This example demonstrates how to create a list that dynamically updates as the underlying data changes, ensuring the UI remains responsive and accurate.

#### Benefits of Intermittent Results

- **Improved User Experience:** Users see data sooner, even during large queries.
- **Seamless Updates:** UI components remain synchronized with the latest data without additional developer effort.
- **Efficient Resource Use:** Partial updates minimize unnecessary computations and reduce perceived latency.

By combining intermittent query results with React, GoatDB enables developers to deliver fluid, real-time user experiences with minimal complexity.
