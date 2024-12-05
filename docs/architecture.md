# GoatDB Architecture

GoatDB uses an architecture originally designed for distributed version control. It's a managed P2P network where the sever retains authority over all other nodes, while most of the processing is being done by the edge nodes rather than the central server. If you're familiar with how Git works, you should feel right at home.

When a node joins the GoatDB network, it first authenticates with the central server. Once the server had successfully verified the node's identify, it'll send over a (partial) copy of the data's history back to the edge node. Conceptually, this is similar to `git clone`.

After downloading the initial history, the edge node will try to maintain soft realtime synchronization with the server. Up to 3 times a second, the node will capture its current in-memory state, pack it into a commit representation, and append it to the underlying append-only commit graph. Concurrently a synchronization process copies over all missing commits between the local copy of the graph and the remote copy on the server. Conceptually, think how multiple developers read and edit their local copies on their own machines, then sync with the central server on github. It's the same except in realtime and for your app's data.

In order to really be able to commit and sync in realtime, GoatDB must be able to resolve merge conflicts automatically and efficiently. Read more about [Conflict Resolution](./conflict-resolution.md).

GoatDB also employs a probabilistic synchronization protocol based on exchanging Bloom Filters in realtime. Read more about it [here](./sync.md).

GoatDB is designed to run on servers, native clients, and inside the browser. Different storage solutions are used based on the target environment. When running on the server or in a native client, GoatDB stores the underlying commit graph in an append-only log file on disk. When running inside a supporting browser, GoatDB will prefer to use OPFS and the same append-only log file structure. When OPFS isn't available, a fallback IndexedDB based implementation is used instead.

# Simplicity and Independence

## Build

From your first line of code, GoatDB hides the vast majority of network logic and handling behind its realtime synchronization, so there's no need to build and maintain APIs. Instead, you get to work with an in-memory representation that's totally synchronous and lives on the client's side. What gets sent over the wire are batches of delta compressed commits which actually ends up more efficient that your typical run-of-the-mill REST API.

And if you're using React, you actually get a full state management package that's already wired down to the DB level. You get to read, edit and query in-memory items, while in the background GoatDB commits and merges changes in real time all while orchestrating re-rendering efficiently and conveniently using modern react hooks.

## Deploy

When the time comes to deploy your app to the cloud, GoatDB enables you to radically simplify your deployment. We pack the embedded DB alongside your code and static assets and compile them into a single executable that acts as a lightweight container. The result is that your entire stack is compressed into a single executable that you can simply stick on any common server in your favorite cloud or even in an on-prem deployment.

If you mostly care about this ability but wish to work with a standard SQL DB, check out the awesome [PocketBase](https://pocketbase.io/).

## Operate

Internally, GoatDB is designed to work with a Peer-to-Peer configuration. As such, operating the GOAT stack from a backend perspective is much more similar to operating a typical stateless micro-service rather than operating a complex stateful stack.

Unlike other technologies, since GoatDB keeps local copies of the data on client machines, clients act as active replicas under GOAT architecture. We've had our production servers crash, loose their data, have have clients fully restore the server. Currently clients simply revert to offline mode when the server is unavailable, but in the future we're planning an optional WebRTC synchronization that'll enable the network to continue online operations even under server failure.

Backup and restore are already baked in to the fundamental design of GoatDB. Since each client holds a partial copy of the data, they actively participate in backup and restoration of the network.

GoatDB scales both horizontally and vertically, enabling huge flexibility in deployment and operations.

## Support

The best modern databases offer today is Point-In-Time Recovery (PIT). GoatDB takes backup and restoration a step further by enabling full version control and realtime history tracking. If a user experiences a bug, you can simply revert the changes that happened in this specific session on your live production environment, even when the specific user is actively using the app. Reverting simply appends new commits to the commit graph with older snapshots of the items, thus it's identical to a conventional edit. This means that if anything goes wrong during the revert process, you can simply revert the revert and start over (we really had that happen to us in our production systems).

## Fix

Since GoatDB compresses the entire stack to a single executable, it becomes orders of magnitude easier to debug and fix. Simply load the affected data or user, and attach your debugger to see what's going on. You can even replicate specific user sessions using History Playback - essentially instructing GoatDB to replay a specific sequence of commits as if they're happening right now. Treat your data as if it's video playback and easily narrow the source of the bug.

## Compliance

So you have successful product, you easily deployed and scaled it, and now you need to comply with some annoying regulation your customers require. The typical approach would be to start adding layers on top of the existing stack, starting with an audit log layer. GoatDB was designed to make this process easy, and it is, in fact, your audit log - no external services needed. The append-only signed commit graph is replicated and validated by the entire network, thus ensuring no data manipulation can happen without the writer being fully known and identified. And if a malicious or unexpected corruption happens, you can simply revert the data to the last known good state.

Single tenant deployment becomes a breeze, while some regulations can be completely bypassed if using on-prem deployment which GoatDB makes easy.

We're also planning on adding E2E encryption so the server only moves opaque commits between clients. Combined with sync over WebRTC, this will offer truly a new category of security and privacy.

## Migration and Data Warehouse

GoatDB makes it super easy to deploy new versions of your app. GoatDB applies version control both to the data and the scheme so when a new scheme version is deployed, it'll coexist on its own branch alongside the previous versions. GoatDB will then perform one-way merges so the branch of the new scheme sees changes from the old scheme, but not the other way around. This enables sane Red/Black rolling deployments, and if something goes wrong you can simply revert the changes.

When the time comes to setup a data warehouse on top of GoatDB, using the scheme of each item makes it easy as natural as possible.
