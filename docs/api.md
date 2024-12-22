# GoatDB API

The main API entry point is the `GoatDB` class from [db.ts](../db/db.ts).

## Creating a new DB instance

```javascript
const db = new GoatDB({ path: '/data/db' });
```

When using React hooks, DB creation is handled automatically and will automatically be configured to synchronize with the server.

```javascript
function MyComponent() {
  const db = useDB();
  return <p>DB Path: {db.path}</p>;
}
```

## Working with Repositories

### Opening a Repository

You must open a [repository](concepts.md) and load its contents into memory before accessing it. This process is continuously being optimized for speed.

When designing your application for GoatDB, consider how you partition your data into different repositories. Each repository is synchronized independently, giving you the flexibility to optimize for your app’s specific use case.

Common candidates for separate repositories include:

- User-specific data (e.g., settings)
- Content shared by a group of users (e.g., group chats, shared documents)
- A shared world in an MMO environment

```javascript
await db.open('/data/repoId');
```

**Note:** Opening a repository beforehand isn't mandatory. Calls to access items and queries will automatically open the repository if necessary.

### Closing a Repository

Once you have finished using a repository, you should close it to free up memory. Closing a repository immediately invalidates all items and queries related to it.

```javascript
await db.close('/data/repoId');
```

## Working with Items

A repository is a collection of [items](concepts.md). You can access a specific item through its path:

```javascript
const item = db.item('/data/repoId/itemId');
```

This call returns a [ManagedItem](../db/managed-item.ts) instance. It will automatically commit changes made locally and merge remote changes in real time.

If the repository for the requested item is not open at the time of this call, the returned item will have a null schema and no known fields. This situation triggers the automatic opening of the required repository. Once the repository is fully open, the item will update itself with the most up-to-date values.

### Managed Item

A managed item represents a snapshot of an item that is automatically committed and synchronized with remote updates. Each item provides a map-like interface for working directly with primitive values.

#### Reading a Field

```javascript
const value = item.get('fieldName');
```

The field name must be defined in the item's schema. Attempting to access an undefined field will throw an exception.

#### Writing a Field

```javascript
item.set('fieldName', value);
```

Setting a field updates the item's in-memory representation. In the background, a commit will be generated and persisted locally, and changes will be synchronized over the network. Queries are updated immediately to ensure a consistent view of the data.

#### Listening to Updates

```javascript
item.attach('change', (mutations) => doSomethingOnItemChange());
```

A managed item notifies its observers when changes occur, providing detailed information about the applied [mutations](../db/mutations.ts), including which fields were edited, whether the edit was local or remote, and the previous in-memory values.

When building UI components, consider using React hooks that automatically handle these changes.

### Bulk Loading

Sometimes you need to create items without directly accessing them afterward, for example, when bulk loading data. A dedicated method is available for this scenario, optimizing internal operations:

```javascript
await db.load('/data/repoId/itemId', schema, itemData);
```

The recommended approach for bulk loading data is to invoke this method multiple times concurrently and wait for all calls to complete.

## Querying Items

[Querying](query.md) a repository allows you to efficiently find specific items. Query predicates and sort descriptors are plain JavaScript functions, making it straightforward to build queries. For example, to find all items that begin with a specific prefix:

```javascript
const query = db.query({
  source: '/data/repoId',
  scheme: kSchemeTask,
  predicate: ({ item }) => item.get('text').startsWith('foo'),
});
```

GoatDB uses the provided configuration to uniquely identify queries. When accessing a query with a previously known configuration, its prior state is used to resume execution from the last known position. Refer to the [query architecture](query.md) for more details.

### Accessing Query Results

```javascript
const results = query.results();
```

Query results are updated in real-time as changes occur, either locally or remotely.
