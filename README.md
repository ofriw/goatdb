<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/4975e49c-e73c-435e-8e10-97adc2c0aaeb">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/270caf47-3ed8-49d4-b3b9-74a51bd2d6c0">
  <img alt="GoatDB Logo" src="https://github.com/user-attachments/assets/270caf47-3ed8-49d4-b3b9-74a51bd2d6c0">
</picture>

---

GoatDB is the world's first database built like a distributed version control system. Think Git, but for your app's data, synchronizing in real time and merging automatically.

# Status

GoatDB has powered Ovvio's real-time collaboration system (https://ovvio.io) in production since January 2024. This project aims to separate the underlying database and offer it as an open-source technology for the community.

We are working hard toward a v0.1 launch, expected in Q1 2025. Refer to the Issues tab for progress.

If you're interested in what we're building, say hi at ofri [at] goatdb.com.

# Motivation

When building GoatDB, we sought to radically simplify and optimize the traditional cloud-first architecture.

The current cloud-first architecture was conceived in the 1950s when mainframes were the norm. Mainframes were centralized computers acting as single sources of truth, with users time-sharing access. Fast forward 70+ years, and the modern cloud architecture mirrors the same centralized design. This design reflected hardware realities at the time but is increasingly outdated. By the late 2010s, modern clients (phones, laptops, etc.) surpassed servers in computational power if you look at them collectively.

**_So why do we build software that relies primarily on the slow, expensive part of our hardware (the cloud) while underutilizing the fast, cheap, and powerful hardware (clients)?_** GoatDB unlocks client-side computational power, enabling developers to fully utilize 100% of available hardware resources. By shifting most processing to the client, GoatDB simplifies the stack, making it easier to build robust, scalable apps.

Check out the [Local First Community](https://localfirstweb.dev/) for other exciting perspectives on similar visions.

## Symmetric P2P Architecture

Forget bulky centralized backends. GoatDB offloads most backend tasks to the client, creating a streamlined, lightweight, managed private network that’s easy to scale. Instead of performing all processing in a centralized backend, GoatDB’s backend is simplified mainly to focus on backups and enforcing permissions.

## Isomorphic TypeScript

Write your code once in TypeScript, and run it seamlessly on both the client and server. Eliminate context-switching and redundant logic. The entire stack becomes so lightweight, it’s almost transparent.

## Automatic, Real-Time Version Control

Imagine Git, but live. GoatDB synchronizes your app's data in real time across all nodes, handling merges automatically without developer intervention. Clients act as active data replicas. In the rare case of backend data loss, clients restore the data in real time to the latest state.

## Unparalleled Performance

By leveraging client-side computational power, GoatDB reduces latency and improves scalability effortlessly. Why depend on slow, expensive cloud machines when modern devices are significantly more powerful?

## Developer-First Experience

Focus on building features, not managing infrastructure. GoatDB’s intuitive tools integrate seamlessly into modern development workflows. Say goodbye to building and maintaining APIs, messy deployments, migrations, or service crashes that disrupt your app. With GoatDB, developers enjoy a simpler, more reliable stack.

## Say Hi to 100% Uptime

By shifting work to the client and enabling full offline functionality, GoatDB delivers 100% availability. Even if the backend goes down, clients seamlessly switch to offline mode or synchronize directly with each other in true P2P mode.

# Read More

[Architecture Overview](/docs/architecture.md)

[Commit Graph](docs/commit-graph.md)

[Conflict Resolution](/docs/conflict-resolution.md)

[Security](/docs/security.md)

[Synchronization Protocol](/docs/sync.md)

# Language

GoatDB is currently written primarily in TypeScript, with performance-critical components written in C++ using WebAssembly (WASM). Over time, we plan to migrate the codebase to C++ to support additional languages.
