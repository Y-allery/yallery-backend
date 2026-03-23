## Media Generation

This module is the isolated home for the new self-hosted media stack.

Rules:
- keep legacy generation modules and endpoints unchanged
- put provider-specific integrations under `providers/`
- build new image, video, audio, and meme flows here as separate subdomains

Initial structure:
- `../upload-v2/` holds the new shared Cloudinary storage layer for generated assets
- `providers/runpod/` holds the RunPod Serverless adapter layer
- `shared/` holds reusable generation context resolution for tag/style/color/contest-like metadata
- `image/` holds the first prompt-to-image workflow, including:
  - DTO and HTTP routes
  - prompt composition
  - model/profile-based orientation -> width/height resolution
  - request building before the RunPod provider call
- `video/`, `audio/`, and `meme/` are reserved for the next migrations

RunPod note:
- `ttl` must cover queue time and execution time together
- keep the default aligned with RunPod's 24h default unless a flow has a shorter
  deliberate lifetime
