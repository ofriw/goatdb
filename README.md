<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/4975e49c-e73c-435e-8e10-97adc2c0aaeb">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/270caf47-3ed8-49d4-b3b9-74a51bd2d6c0">
  <img alt="GoatDB Logo" src="https://github.com/user-attachments/assets/270caf47-3ed8-49d4-b3b9-74a51bd2d6c0">
</picture>

---

GoatDB is an open-source, distributed database system built on principles similar to Git and other distributed version control systems (DVCS). By leveraging Git-inspired data management techniques, GoatDB provides a robust framework for managing application data changes, merging updates, and synchronizing across devices—all fully automated. By pushing most computation to the edge, GoatDB empowers frontend developers to build the next generation of applications with minimal backend dependencies. Developers can focus on delivering rich, responsive user experiences while GoatDB seamlessly handles synchronization, conflict resolution, and offline functionality, ensuring real-time collaboration and reliable data consistency.

## Getting Started

Detailed setup instructions are coming soon. Follow the Issues tab to track progress toward v0.1.

## Documentation

[API Overview](docs/api.md)
• [Architecture Overview](docs/architecture.md)
• [Concepts](docs/concepts.md)
• [Queries](docs/query.md)
• [Schemas](docs/schema.md)

[Commit Graph](docs/commit-graph.md)
• [Conflict Resolution](docs/conflict-resolution.md)
• [Synchronization Protocol](docs/sync.md)

## Why GoatDB?

GoatDB empowers frontend developers by simplifying the complexities of building modern, distributed applications. It prioritizes:

- **Ease of Development:** Frontend developers work with an in-memory snapshot, while background synchronization keeps updates consistent across devices.
- **Performance:** Local data processing ensures low latency and responsive applications.
- **Scalability:** GoatDB distributes workloads across client devices, reducing infrastructure costs.
- **Freedom to Deploy Anywhere:** GoatDB can be deployed on any cloud or on-premises environment with a single executable file, giving developers complete control and flexibility in choosing their infrastructure.

## Use Cases

### Automotive

GoatDB ensures reliable automotive systems with real-time synchronization and offline functionality, accelerating delivery, diagnostics, and fleet management applications.

### Productivity Tools

Ideal for collaborative document editors, task managers, and real-time note-taking apps. GoatDB ensures offline access, real-time updates and automatic merges.

### Enterprise Apps

GoatDB powers enterprise applications with secure, real-time collaboration and scalable data management, enabling faster delivery of CRMs, ERPs, and collaboration tools.

### Education Platforms

Enables offline-first learning tools and collaborative classroom apps for regions with unreliable connectivity.

### Healthcare and Compliance

GoatDB ensures secure, privacy-compliant data storage with a signed audit log for traceability. Single-tenant deployments provide complete control over infrastructure and compliance needs.

### Gaming Applications

GoatDB enables real-time synchronization for multiplayer games, ensuring seamless player interactions and reliable progress tracking, even with intermittent connectivity. Its signed audit log prevents cheating by providing a tamper-proof record of player actions.

## Project Status

GoatDB has been production-tested in Ovvio’s real-time collaboration platform since January 2024 ([https://ovvio.io](https://ovvio.io)). This open-source release decouples the database core for broader adoption. Alongside this, an upcoming managed service platform will make deploying GoatDB even easier, offering features like one-click deployment, automated backups, and infrastructure-free operation for developers.

The first public release (v0.1) is targeted for Q1 2025. Progress is tracked in the Issues tab.

Contact: ofri [at] goatdb.com.

---

Join us in building the next generation of edge-native, local-first applications!
