# GoatDB FAQ

- [What is GoatDB?](#what-is-goatdb)
- [Won't This Architecture Overload the Client?](#wont-this-architecture-overload-the-client)
- [Won't it expose sensitive data to clients?](#wont-it-expose-sensitive-data-to-clients)
- [What workload is GoatDB optimized for?](#what-workload-is-goatdb-optimized-for)
- [Can you delete data from GoatDB?](#can-you-delete-data-from-goatdb)
- [How does synchronization work in GoatDB?](#how-does-synchronization-work-in-goatdb)
- [Can GoatDB operate offline?](#can-goatdb-operate-offline)
- [How does GoatDB handle data conflicts?](#how-does-goatdb-handle-data-conflicts)
- [How does GoatDB simplify development?](#how-does-goatdb-simplify-development)
- [What is the deployment process for GoatDB?](#what-is-the-deployment-process-for-goatdb)
- [How does GoatDB ensure data reliability?](#how-does-goatdb-ensure-data-reliability)
- [Does GoatDB support schema migrations?](#does-goatdb-support-schema-migrations)
- [Can GoatDB integrate with data warehouses?](#can-goatdb-integrate-with-data-warehouses)
- [What debugging tools does GoatDB provide?](#what-debugging-tools-does-goatdb-provide)
- [How does GoatDB ensure compliance and auditability?](#how-does-goatdb-ensure-compliance-and-auditability)
- [What is the performance impact of GoatDB on client devices?](#what-is-the-performance-impact-of-goatdb-on-client-devices)
- [How does distributed local querying differ from centralized queries?](#how-does-distributed-local-querying-differ-from-centralized-queries)
- [What licensing options does GoatDB offer?](#what-licensing-options-does-goatdb-offer)

## What is GoatDB?

GoatDB is a distributed database designed for edge-native applications. Inspired by distributed version control systems, GoatDB focuses on maximizing client-side processing, reducing server dependency, and supporting real-time synchronization across nodes.

## Won't This Architecture Overload the Client?

No. Modern cloud-first applications already perform similar operations under the guise of temporary caching. Any data rendered on the client’s screen has already been downloaded to the client, aligning with GoatDB’s approach. Modern client devices are significantly more powerful than the fraction of a server's resources allocated to serve them, enabling them to handle such workloads efficiently.

## Won't it expose sensitive data to clients?

No. GoatDB establishes a private network, unlike public approaches such as Bitcoin or IPFS. Clients only access data explicitly granted by developers, adhering to the same principles as cloud-first applications.

## What workload is GoatDB optimized for?

GoatDB is optimized for read-heavy workloads, where reads significantly outnumber writes. For the occasional writes, GoatDB supports concurrent operations with distributed, lockless [concurrency control](architecture.md). It is ideal for use cases that naturally segment into logical data repositories.

## Can you delete data from GoatDB?

Yes. Although the underlying structure is an [append-only commit graph](commit-graph.md), GoatDB employs garbage collection. Data deletion involves marking items as deleted, with garbage collection handling eventual removal.

## How does synchronization work in GoatDB?

GoatDB employs a soft [real-time synchronization](sync.md) mechanism that captures in-memory states of nodes up to three times per second. These states are packaged into signed commits and appended to an append-only commit graph. Synchronization uses a probabilistic protocol with Bloom Filters to minimize data comparison overhead, ensuring efficient and consistent propagation of updates across nodes.

## Can GoatDB operate offline?

Yes. GoatDB supports offline mode [by design](architecture.md). When the server is unavailable, nodes continue functioning autonomously. Updates made offline are synchronized with the server once connectivity is restored. Future updates will also introduce WebRTC-based peer-to-peer synchronization for added resilience.

## How does GoatDB handle data conflicts?

Conflict resolution is automated and optimized for real-time operations. Detailed strategies for resolving conflicts are outlined in the [Conflict Resolution documentation](./conflict-resolution.md). By leveraging distributed version control principles, GoatDB ensures that conflicts are resolved efficiently and transparently.

## How does GoatDB simplify development?

GoatDB abstracts network and synchronization complexities, providing developers with a synchronous, in-memory data representation. This design reduces the need for traditional REST APIs and streamlines application development. Debugging and deploying GoatDB as a single executable is simpler compared to managing multiple microservices. A single executable consolidates the application stack, reducing inter-service communication issues and deployment overhead. For React applications, GoatDB offers a state management package that integrates with React hooks, supporting real-time updates and efficient UI state handling.

## What is the deployment process for GoatDB?

Deployment is simplified through a unified artifact that combines the database, application code, and static assets into a single executable. This approach ensures compatibility with standard servers and on-premises environments while reducing operational complexity. Additionally, an upcoming managed service will make deployment and rolling updates a one-click process, further streamlining operations for developers and reducing the need for manual interventions.

## How does GoatDB ensure data reliability?

- **Active Replication:** Each client node maintains a local copy of the data, serving as an active replica. In case of server data loss, these replicas can restore the server state.
- **Backup and Restore:** The distributed design inherently supports backup and redundancy. Nodes store partial replicas, facilitating recovery. Backing up the data is as simple as zipping the live directory of data, making it straightforward to preserve and restore states.

## Does GoatDB support schema migrations?

Yes. GoatDB employs version control principles for schema management. Changes are applied to a separate branch, ensuring backward compatibility. Rolling updates are supported without disrupting workflows, and problematic changes can be reverted seamlessly.

## Can GoatDB integrate with data warehouses?

Yes. GoatDB’s schema-based data organization supports straightforward integration with data warehouses. Its structured approach aligns well with analytical workflows.

## What debugging tools does GoatDB provide?

GoatDB includes a "History Playback" feature that allows developers to replay specific commit sequences. This functionality simplifies debugging by enabling precise analysis of data changes over time.

## How does GoatDB ensure compliance and auditability?

The append-only signed [commit graph](commit-graph.md) acts as a built-in audit log. This log provides full traceability for data modifications, ensuring transparency and compliance with regulatory requirements. Additionally, it allows reversion to the last valid state if needed.

## What is the performance impact of GoatDB on client devices?

GoatDB is optimized for lightweight operations on client devices. The append-only storage model and delta-compressed synchronization reduce computational overhead while maintaining real-time responsiveness.

## How does distributed local querying differ from centralized queries?

In GoatDB, each node performs local querying on its own data subset, eliminating the need to query a centralized data repository. This approach offers several benefits:

- **Latency Reduction:** Queries are executed directly on the local node, reducing the round-trip time to a central server.
- **Scalability:** Each node handles its own query load, allowing the system to scale horizontally as more nodes are added.
- **Resilience:** Local querying ensures continued functionality even if the central server becomes unavailable, supporting offline operations.
- **Focused Query Scope:** By segmenting data logically across nodes, queries are inherently limited to relevant subsets, improving performance and efficiency.

In contrast, centralized queries require all data to be processed in a single location, often resulting in bottlenecks, increased latency, and reduced fault tolerance.

## What licensing options does GoatDB offer?

As a developer considering GoatDB for your project, you have two licensing options tailored to different use cases:

- AGPL (Affero General Public License): For open-source projects, this license ensures compatibility with open-source principles, fostering transparency and collaboration.

- ELv2 (Elastic License v2): Allows use in closed-source projects but prohibits redistributing GoatDB as a service, making it ideal for commercial applications.

Choosing between these options depends on whether your project aligns more with open-source principles or requires a proprietary approach.
