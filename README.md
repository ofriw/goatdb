<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/4975e49c-e73c-435e-8e10-97adc2c0aaeb">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/270caf47-3ed8-49d4-b3b9-74a51bd2d6c0">
  <img alt="GoatDB Logo" src="https://github.com/user-attachments/assets/270caf47-3ed8-49d4-b3b9-74a51bd2d6c0">
</picture>

---

GoatDB is a real-time Distributed Version Control System (RDVCS) that simplifies building modern, responsive applications. Unlike traditional databases, GoatDB runs most of the work—like reading, writing, and querying data—on the client side instead of relying on the server. This approach ensures your app feels fast and always works, even if the network connection is unstable.

GoatDB also guarantees causal consistency, meaning changes are shared in the correct order across clients and servers, so data always makes sense to users. Its edge-native design eliminates many backend challenges, making both development and deployment easier while supporting modern workloads at scale.

## Getting Started

[API Overview](docs/api.md)
• [Architecture Overview](docs/architecture.md)
• [Concepts](docs/concepts.md)
• [FAQ](docs/faq.md)
• [Queries](docs/query.md)
• [Schemas](docs/schema.md)

Detailed setup instructions are coming soon. Follow the Issues tab to track progress toward v0.1.

## Why GoatDB?

GoatDB empowers frontend developers by simplifying the complexities of building modern, distributed applications. It prioritizes:

- **Ease of Development:** Frontend developers work with an in-memory snapshot, while background synchronization keeps updates consistent across devices.
- **Performance:** Local data processing ensures low latency and responsive applications.
- **Scalability:** GoatDB distributes workloads across client devices, reducing infrastructure costs.
- **Freedom to Deploy Anywhere:** GoatDB can be deployed on any cloud or on-premises environment with a single executable file, giving developers complete control and flexibility in choosing their infrastructure.

## Use Cases

### SaaS B2B

GoatDB enhances UI responsiveness and reduces operational costs for SaaS B2B platforms. Its real-time processing, edge-native design, and scalability lower expenses in both cloud infrastructure and personnel needs, optimizing operational efficiency.

### Prototyping

GoatDB simplifies rapid prototyping with minimal setup and intuitive client-side processing. Its version control for both data and schema supports quick iterations and feature testing, making it ideal for fast-paced, innovation-driven teams.

### Consumer Mobile Apps

GoatDB empowers consumer mobile apps with offline-first functionality, instant responsiveness, and real-time data synchronization. Whether for social networking, e-commerce, or fitness tracking, it ensures users can interact seamlessly even without a stable internet connection. Developers benefit from simplified data handling and improved app performance, enhancing user engagement and retention.

### Education and Gaming

GoatDB supports offline-first learning tools and multiplayer games with real-time synchronization and tamper-proof tracking. It delivers seamless interactions and secure progress tracking for diverse user needs.

### Automotive

GoatDB drives automotive innovation with rapid feature rollouts, secure OTA updates, and offline support. It ensures robust performance and reliability for diagnostics, fleet management, and other critical applications.

### Healthcare and Compliance

GoatDB ensures secure, privacy-compliant data storage with a signed audit log for traceability. Single-tenant deployments, packaged as a single executable, simplify installation and management while providing complete control over infrastructure and compliance needs.

### Agents and Telemetry

GoatDB enables efficient telemetry collection for distributed systems with delta compression and rolling deployments. Its architecture ensures low-resource usage and reliable performance for IoT devices and industrial applications.

## Project Status

GoatDB has been production-tested in Ovvio’s real-time collaboration platform since January 2024 ([https://ovvio.io](https://ovvio.io)). This open-source release decouples the database core for broader adoption. Alongside this, an upcoming managed service platform will make deploying GoatDB even easier, offering features like one-click deployment, automated backups, and infrastructure-free operation for developers.

The first public release (v0.1) is targeted for Q1 2025. Progress is tracked in the Issues tab.

Contact: ofri [at] goatdb.com.

## Further Reading

- [Commit Graph](docs/commit-graph.md)
- [Conflict Resolution](docs/conflict-resolution.md)
- [Synchronization Protocol](docs/sync.md)

---

Join us in building the next generation of edge-native, local-first applications!
