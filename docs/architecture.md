# GoatDB Architecture

GoatDB employs an architecture originally designed for distributed version control. It operates as a managed P2P network where the server retains authority over all nodes, but most processing occurs at the edge nodes rather than the central server. If you're familiar with Git, this approach should feel intuitive.

When a node joins the GoatDB network, it first authenticates with the central server. Once the server successfully verifies the node's identity, it sends a (partial) copy of the data's history to the edge node. Conceptually, this is similar to a `git clone`.

After downloading the initial history, the edge node maintains soft real-time synchronization with the server. Up to three times per second, the node captures its current in-memory state, packs it into a commit representation, and appends it to the append-only commit graph. Simultaneously, a synchronization process exchanges missing commits between the local and remote copies of the graph. Think of multiple developers working on local Git repositories and syncing with a central server—except this happens in real time for your app's data.

To enable real-time commits and synchronization, GoatDB resolves merge conflicts automatically and efficiently. Read more about [Conflict Resolution](./conflict-resolution.md).

GoatDB also employs a probabilistic synchronization protocol using Bloom Filters for real-time data exchange. Read more about it [here](./sync.md).

GoatDB is designed to run on servers, native clients, and within browsers. Storage solutions vary by environment:

- **Server/Native Clients:** Data is stored in an append-only log file on disk.
- **Browsers:** When supported, GoatDB uses OPFS with the same append-only log file structure. If OPFS is unavailable, it falls back to an IndexedDB-based implementation.

## Simplicity and Independence

### Build

From your first line of code, GoatDB abstracts most network logic and handling through real-time synchronization. There’s no need to build or maintain APIs. Instead, you work with an in-memory representation that is fully synchronous and client-side. Changes are sent as batches of delta-compressed commits, often more efficient than traditional REST APIs.

For React users, GoatDB includes a state management package pre-wired to the database. You can read, edit, and query in-memory items while GoatDB handles real-time commits, merges, and efficient re-rendering using modern React hooks.

### Deploy

Deploying your app to the cloud becomes radically simpler with GoatDB. The database is embedded alongside your code and static assets, compiled into a single executable. This lightweight container combines your entire stack into a single deployable artifact that works on any common server or on-prem deployment.

If you prefer working with a standard SQL database, consider the awesome [PocketBase](https://pocketbase.io/) as an alternative.

### Operate

Operating GoatDB’s architecture is akin to managing stateless microservices rather than complex stateful stacks. GoatDB’s P2P configuration ensures simplicity:

- **Clients as Active Replicas:** Since clients maintain local copies of the data, they act as active replicas. Even if production servers crash or lose data, clients can restore the server fully.
- **Offline Mode:** Clients revert to offline mode if the server becomes unavailable. Future updates will introduce optional WebRTC synchronization for continued online operations in case of server failures.
- **Backup and Restore:** Backups are inherent to GoatDB’s design. Clients hold partial copies of the data and actively participate in the network’s backup and restoration.

GoatDB scales both horizontally and vertically, offering flexibility in deployment and operations.

### Support

Traditional databases offer Point-In-Time Recovery (PIT), but GoatDB goes further with full version control and real-time history tracking. If a user encounters a bug, you can revert changes from that session directly in production, even while the user is active. Reverts append new commits with older snapshots, making them identical to conventional edits. If issues arise during the revert process, you can safely undo the revert and start over.

### Fix

Debugging and fixing issues is easier with GoatDB. Compressing the stack into a single executable allows you to load affected data or users and attach a debugger for detailed analysis. History Playback lets you replay specific sequences of commits as if they were happening live, treating data like video playback for precise troubleshooting.

### Compliance

When your product needs to comply with regulations, GoatDB simplifies the process. Its append-only signed commit graph serves as a built-in audit log, ensuring data manipulation is transparent and traceable. Malicious or unexpected corruption can be reverted to the last known good state.

GoatDB supports single-tenant deployment with ease. On-prem deployments can bypass some regulations, while planned E2E encryption and WebRTC synchronization will enhance security and privacy further.

### Migration and Data Warehouse

GoatDB simplifies deploying new app versions. Version control applies to both data and schemas. When a new schema version is deployed, it coexists on a separate branch alongside previous versions. GoatDB performs one-way merges, ensuring the new schema sees changes from the old schema but not vice versa. This enables safe rolling deployments. If issues arise, simply revert changes.

Setting up a data warehouse is straightforward with GoatDB. Schema-based organization ensures compatibility and ease of integration.
