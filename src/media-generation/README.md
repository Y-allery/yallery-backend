# Media Generation

`media-generation` is the orchestration layer for all AI media work in the backend.

It is meant to sit above the remaining domain modules and replace legacy generation entry points:

- `image-generation`
- `meme`

The `meme` domain module still owns meme templates and admin CRUD. Only the
generation workflow lives here.

The goal is to centralize three decisions in one place:

1. Which capability is being requested.
2. Which provider should handle it.
3. How that provider is dispatched.

## Folder layout

- `capabilities/`
  - Describes the product-level operations we support, such as image generation or audio generation.
- `providers/`
  - Provider-specific adapters and metadata for Fal, RunPod/open endpoints, X Router, or internal queues.
- `routing/`
  - Future orchestration services that resolve provider selection and normalize routing output.
- `contracts/`
  - Shared interfaces for requests, routes, providers, and capability descriptors.
- `config/`
  - Config shapes for provider overrides and future rollout toggles.
- `constants/`
  - Injection tokens and shared constants for the module.
- `enums/`
  - Normalized enums for capabilities, providers, and dispatch strategies.

## Intended flow

`feature service -> media-generation resolver -> provider adapter -> queue/http/open endpoint`

This folder is the active orchestration layer for the new media API surface.
