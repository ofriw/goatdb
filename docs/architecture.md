# GoatDB Architecture

GoatDB uses an architecture originally designed for distributed version control. It's a managed P2P network where the sever retains authority over all other nodes, while most of the processing is being done by the edge nodes rather than the central server. If you're familiar with how Git works, you should feel right at home.

When a node joins the GoatDB network, it first authenticates with the central server. Once the server had successfully verified the node's identify, it'll send over a (partial) copy of the data's history back to the edge node. Conceptually, this is similar to `git clone`.

After downloading the initial history, the edge node will try to maintain soft realtime synchronization with the server. Up to 3 times a second, the node will capture its current in-memory state, pack it into a commit representation, and append it to the underlying append-only commit graph. Concurrently a synchronization process copies over all missing commits between the local copy of the graph and the remote copy on the server. Conceptually, think how multiple developers read and edit their local copies on their own machines, then sync with the central server on github. It's the same except in realtime and for your app's data.

In order to really be able to commit and sync in realtime, GoatDB must be able to resolve merge conflicts automatically in an efficient enough way. Read more about [Conflict Resolution](./conflict-resolution.md).

GoatDB also employs a probabilistic synchronization protocol based on exchanging Bloom Filters in realtime. Read more about it [here](./sync.md).

GoatDB is designed to run on servers, native clients, and inside the browser. Different storage solutions are used based on the target environment. When running on the server or in a native client, GoatDB stores the underlying commit graph in an append-only log file on disk. When running inside a supporting browser, GoatDB will prefer to use OPFS and the same append-only log file structure. When OPFS isn't available, a fallback IndexedDB based implementation is used instead.
