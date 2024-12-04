<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/042011b9-4e06-45f5-b3fb-53f6b0fe9981">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/5c8a5aec-b44a-4aa2-8d15-572eb2ff1486">
  <img alt="Shows an illustrated sun in light mode and a moon with stars in dark mode." src="https://github.com/user-attachments/assets/042011b9-4e06-45f5-b3fb-53f6b0fe9981">
</picture>

---

GoatDB is the world's first database built like a distributed version control system. Think git, but for your app's data that synchronizes in realtime and does merges automatically.

# Status

GoatDB powers Ovvio's realtime collaboration system (https://ovvio.io) in production since January 2024. This project is an effort to separate the underlying DB and offer it as an open source technology for the community to enjoy.

We're working hard on getting ready for a v0.1 launch. We expect it to happen in Q1 2025. Refer to the issues tab for progress.

# Motivation

When building GoatDB, we sought to radically simplify and optimize the traditional cloud-first architecture.

The current cloud-first architecture was first conceived back in the 50's when mainframes where the norm. The mainframe was a centralized computer that acted as a single source of truth, with users time sharing it. Fast forward 70+ years and the modern cloud is basically using the more or less the same architecture of the mainframes of the 50's. This design worked fantastically because it reflected the actual state of hardware in the world, but that all changed near the end of the 2010's. The modern server is no longer stronger than the client it servers but the opposite it true - the modern client is so much better than the slice of server that serves it.

**_So why are we building software that only uses the slow, expansive, part of our hardware (the cloud) and treat the fast, cheap, vastly superior hardware (clients) as a simple cache?_** It's as if we're deliberately trying to work hard and move bits around over and over again. GoatDB seeks to unlock the clients' hardware, and for the first time enable developers to fully utilize 100% of the available hardware resources. By pushing most of the processing to the client, GoatDB radically simplifies the stack making it so much easier to develop robust, scalable, apps.

Check out the [Local First Community](https://localfirstweb.dev/) for some awesome alternative takes on a similar vision.

## Symmetric P2P Architecture

Forget bulky centralized backends. GoatDB pushes most backend tasks directly to the client, creating a streamlined, lightweight, managed private network that’s easy to grow. Rather than doing all of the processing like in a traditional cloud-first architecture, the backend is now simplified mostly into backup and enforcing permissions.

## Isomorphic TypeScript

Write once in TypeScript, and the code runs seamlessly on both the client and server. No more context-switching or redundant logic. The entire stack becomes so thin it’s almost transparent.

## Automatic, Real-Time Version Control

Imagine Git, but live. GoatDB syncs your app's data in real time across all nodes, automatically handling merges without the need for developer intervention. Your clients now actively participate, acting as active data replicas. On the rare occasion where the back experiences any kind of data loss, clients will actively restore it in realtime to the most up to date state.

## Unparalleled Performance

By leveraging the computational power of clients, reduce latency and improve scalability effortlessly. Why use a bunch of expansive and slow cloud machines when we have phones and laptops that are so much more powerful.

## Developer-First Experience

Focus on building features, not managing infrastructure. Our tools are intuitive, efficient, and designed for seamless integration into modern development workflows. Forget about building and maintaining APIs, messy deployments, migrations, or crashes that take the entire service down. Powered by the open source GoatDB.

## Say hi to 100% Uptime

By pushing most of the work to the client and unlocking full offline mode, you gain 100% Availability. Even if the backend goes down, clients will simply switch to offline mode or optionally sync directly with each other using true P2P mode.

# Read More

[Architecture Overview](/docs/architecture.md)

[Conflict Resolution](/docs/conflict-resolution.md)

[Security](/docs/security.md)

[Synchronization Protocol](/docs/sync.md)

# Language

GoatDB is currently written mostly in TypeScript, with some performance critical parts written in C++ using WASM. We're gradually planning on migrating all code to C++ so we can later add other supported languages.
