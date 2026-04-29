# Media Generation

`media-generation` is the orchestration layer for all AI media work in the
backend. Public `/media-generation/*` routes stay stable while the module owns
the shared flow for image, edit, audio, video, and meme generation.

The `meme` domain module still owns meme templates and admin CRUD. Only the
generation workflow lives here.

## Folder layout

- `api/`
  - HTTP controller, request DTOs, and response contracts exposed by `/media-generation/*`.
- `application/`
  - Use-case services: AI settings, enqueue, execution, finalization, guards, pricing, prompt enhancement, and contest media resolution.
- `domain/`
  - Provider-neutral capabilities, contracts, enums, orientation presets, and generation request/result types.
- `infrastructure/`
  - Provider adapters, RunPod client/payload/output helpers, route registry, BullMQ processors, websocket presenters, post factory, preview helpers, and tag helpers.
- `persistence/entities/`
  - TypeORM entities owned by the media generation module, plus the legacy `ai_settings` read model.

## Runtime Flow

1. `MediaGenerationController` asks `MediaAISettingsService` for settings/capabilities or `MediaGenerationEnqueueService` to enqueue work.
2. `MediaGenerationGuardsService` checks active routes, user credits, contest capability rules, and source entities before billing/enqueue.
3. BullMQ processors call `MediaGenerationFinalizeService`.
4. Finalization calls `MediaGenerationExecutionService`, which dispatches to the selected provider via `MediaProviderRegistryService`.
5. `GeneratedPostFactory` creates posts, `MediaPreviewService` derives previews, and contest v2 completion is reported through `ContestFlowService`.
6. Processors emit websocket payloads through small notification presenters.

There is no god-service facade in this module. Controllers and processors inject
the specific application service they need.

## RunPod Boundaries

- `RunpodEndpointResolver`: maps active `aiService` names to required endpoint env vars.
- `RunpodPayloadBuilder`: builds provider payloads for prompt image, LoRA image, edit, audio, video, and meme.
- `RunpodMediaClient`: owns `/run`, `/runsync`, `/status`, polling, timeouts, and RunPod headers.
- `RunpodOutputExtractor`: extracts URL, data URI, and base64 image/video outputs.
- `RunpodOpenEndpointMediaProvider`: thin adapter that coordinates those helpers and uploads provider output to Cloudinary.
