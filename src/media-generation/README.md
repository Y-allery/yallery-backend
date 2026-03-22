## Media Generation

This module is the isolated home for the new self-hosted media stack.

Rules:
- keep legacy generation modules and endpoints unchanged
- put provider-specific integrations under `providers/`
- build new image, video, audio, and meme flows here as separate subdomains

Initial structure:
- `providers/runpod/` holds the RunPod Serverless adapter layer
- `image/` holds the first prompt-to-image workflow
- `video/`, `audio/`, and `meme/` are reserved for the next migrations
