# GoatDB Architecture Overview

GoatDB is designed around principles from [distributed version control systems](https://en.wikipedia.org/wiki/Distributed_version_control), functioning as a managed peer-to-peer (P2P) network. In this architecture, the central server retains authority over all nodes, while computational and data synchronization tasks are predominantly handled by edge nodes.

## Node Authentication and Data Initialization

When a node joins the GoatDB network, it authenticates with the central server. Upon successful authentication, the server provides the node with a partial copy of the data's [history](commit-graph.md). This process is conceptually similar to a `git clone` operation, where the node retrieves an initial dataset to begin participating in the network.

## Real-Time Data Synchronization

Once initialized, the edge node maintains a soft real-time synchronization with the server. This process involves:

1. Capturing the in-memory state of the node (up to three times per second).
2. Packaging this state into a commit representation.
3. Appending the new commit to the [append-only commit graph](commit-graph.md).

Nodes participates in a [synchronization process](sync.md), which exchanges missing commits between the edge node and the central server. This mechanism ensures consistent data propagation across the network, resembling the behavior of distributed version control systems but operating in near-real-time. The same mechanism also used server-to-server.

## Conflict Resolution

GoatDB incorporates automated and efficient conflict resolution to facilitate real-time operations. Details on the conflict resolution strategy are available in the [Conflict Resolution documentation](./conflict-resolution.md).

## Synchronization Protocol

To optimize real-time data exchange, GoatDB employs a probabilistic synchronization protocol based on Bloom Filters. This approach minimizes the overhead of comparing data across nodes. Additional details are provided in the [synchronization documentation](./sync.md).

## Storage Model

GoatDB supports diverse runtime environments, with a storage model tailored to the underlying platform:

- **Server and Native Clients**: Data is stored as an append-only log file on disk.
- **Browsers**: When available, GoatDB uses the Origin Private File System (OPFS) to maintain an append-only log structure. In environments lacking OPFS support, it defaults to an IndexedDB-based implementation.

## Development and Deployment

### Development Workflow

GoatDB abstracts most network and synchronization logic, allowing developers to focus on application-level logic. Applications interact with a fully synchronous, in-memory data representation, while GoatDB handles the underlying data transmission using delta-compressed commit batches. This approach reduces the complexity associated with traditional REST APIs.

For applications using React, GoatDB provides a state management package that integrates seamlessly with modern React hooks. This integration supports real-time data synchronization, state management, and efficient UI updates.

### Deployment Process

GoatDB simplifies deployment by embedding the database alongside application code and static assets into a single executable. This unified artifact is compatible with standard servers and on-premises environments, reducing operational overhead.

### Operational Considerations

- **Active Replication**: Clients maintain local copies of data, acting as active replicas. In the event of server data loss, client nodes can restore the server state.
- **Offline Mode**: If the server becomes unavailable, clients automatically switch to offline mode, preserving their ability to function. Future updates will introduce WebRTC-based peer-to-peer synchronization to further enhance resilience.
- **Backup and Restore**: Backup functionality is inherently supported by the distributed design. Nodes store partial data replicas, facilitating recovery and redundancy.

## Advanced Features

### Debugging and Troubleshooting

GoatDB compresses the application stack into a single executable, simplifying debugging workflows. Developers can replay specific sequences of commits using a "History Playback" feature, enabling precise analysis of data changes.

### Compliance and Auditability

The append-only signed commit graph serves as a built-in audit log, providing traceability for all data modifications. This design supports regulatory compliance by ensuring transparency and the ability to revert changes to the last valid state.

### Schema and Data Migration

GoatDB uses version control principles for schema management. When deploying new schema versions, changes are applied to a separate branch. This approach ensures backward compatibility and allows rolling updates without disrupting existing data workflows. If issues arise, changes can be reverted seamlessly.

### Integration with Data Warehousing

Data organization in GoatDB is schema-based, facilitating straightforward integration with data warehouses. The structured approach to data storage ensures compatibility with analytical workflows.

---

This architecture balances the benefits of distributed version control with the requirements of real-time data processing, offering a robust solution for modern application development.
