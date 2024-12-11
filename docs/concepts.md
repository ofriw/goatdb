# Concepts

**Item**: A basic unit of data, analogous to a row in a relational database or a document in a document database. Each item maintains its own [distributed commit graph](commit-graph.md), serving as its atomic unit. Items guarantee [Causal Consistency](https://en.wikipedia.org/wiki/Causal_consistency) within their respective commit graphs.

**Scheme**: Defines the structure of an item. Schemes are versioned, allowing multiple versions of the same scheme to coexist within the database.

**Repository**: A collection of items and their associated schemes. A repository can contain items with varying schemes. Each repository is synchronized independently, enabling application-level sharding.

**Path**: Objects within GoatDB are uniquely identified by their paths, which follow this structure:

```
/type/repo/item
```

## Repository Types

**sys**: Reserved for system-level operations. This type should not be used in application code.

**data**: A general-purpose repository for storing user data.

**user**: A repository for user-specific data, such as settings and preferences.

## System Repositories

### /sys/sessions

Stores user sessions, including the public keys of authenticated users. These keys are used by nodes to verify commits before accepting them into their local copies. Sessions may be either anonymous or linked to specific users.

**Access Rules:**

- Read-only access for everyone.

### /sys/users

Stores user-specific items, including public profile information and metadata.

**Access Rules:**

- Each user has full read and write access to their own item.
- Read-only access is granted to other users.
