export const MEDIA_GENERATION_SWAGGER = {
  getPromptImageAISettings: {
    summary: 'Get prompt image AI settings',
    description: `Return the prompt-only image generation settings served by the new \`media-generation\` module.

This endpoint is intentionally separate from the legacy \`image-generation/ai-settings\` endpoint and reads from the new \`media_ai_settings\` table.

**What it returns:**
- prompt-image models only
- normalized default settings for the new flow
- shared colors and styles lists

**What it does not return:**
- legacy \`aiDescription\`
- edit-only models
- video/audio models`,
    responses: {
      success: {
        status: 200,
        description: 'Prompt image AI settings retrieved successfully.',
        schema: {
          type: 'object',
          properties: {
            defaultSettings: {
              type: 'object',
              properties: {
                defaultAI: {
                  type: 'string',
                  example: 'nano_banana',
                  nullable: true,
                },
                defaultOrientations: {
                  type: 'string',
                  enum: ['horizontal', 'vertical'],
                  example: 'vertical',
                },
              },
            },
            aiSettings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  aiService: { type: 'string', example: 'nano_banana' },
                  name: { type: 'string', example: 'Nano Banana' },
                  allowedOrientations: {
                    type: 'array',
                    items: { type: 'string', enum: ['horizontal', 'vertical'] },
                  },
                  cost: { type: 'number', example: 30 },
                  description: {
                    type: 'string',
                    nullable: true,
                    example:
                      'Prompt-to-image generation powered by the public RunPod Google Nano Banana endpoint.',
                  },
                },
              },
            },
            colors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number', example: 1 },
                  name: { type: 'string', example: 'Warm' },
                },
              },
            },
            styles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number', example: 12 },
                  name: { type: 'string', example: 'Cinematic' },
                  imageUrl: {
                    type: 'string',
                    nullable: true,
                    example: 'https://res.cloudinary.com/example/style.png',
                  },
                },
              },
            },
          },
        },
      },
      unauthorized: {
        status: 401,
        description: 'Unauthorized - invalid or missing JWT token.',
      },
    },
  },
  getEditImageAISettings: {
    summary: 'Get image edit AI settings',
    description: `Return the image-edit models served by the new \`media-generation\` module.

This endpoint is separate from the legacy edit flow and reads from the new \`media_ai_settings\` table filtered by \`image_edit\` capability.`,
    responses: {
      success: {
        status: 200,
        description: 'Image edit AI settings retrieved successfully.',
        schema: {
          type: 'object',
          properties: {
            defaultSettings: {
              type: 'object',
              properties: {
                defaultAI: {
                  type: 'string',
                  example: 'qwen_image_edit',
                  nullable: true,
                },
              },
            },
            aiSettings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  aiService: { type: 'string', example: 'qwen_image_edit' },
                  name: { type: 'string', example: 'Qwen Image Edit' },
                  cost: { type: 'number', example: 25 },
                  description: {
                    type: 'string',
                    nullable: true,
                    example: 'Image editing powered by a public RunPod Qwen endpoint.',
                  },
                },
              },
            },
            colors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number', example: 1 },
                  name: { type: 'string', example: 'Warm' },
                },
              },
            },
            styles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number', example: 12 },
                  name: { type: 'string', example: 'Cinematic' },
                  imageUrl: {
                    type: 'string',
                    nullable: true,
                    example: 'https://res.cloudinary.com/example/style.png',
                  },
                },
              },
            },
          },
        },
      },
      unauthorized: {
        status: 401,
        description: 'Unauthorized - invalid or missing JWT token.',
      },
    },
  },
  getAudioAISettings: {
    summary: 'Get audio AI settings',
    description: `Return the audio-generation models served by the new \`media-generation\` module.

This endpoint is separate from the legacy audio flow and reads from the new \`media_ai_settings\` table filtered by \`audio_generate\` capability.`,
    responses: {
      success: {
        status: 200,
        description: 'Audio AI settings retrieved successfully.',
        schema: {
          type: 'object',
          properties: {
            defaultSettings: {
              type: 'object',
              properties: {
                defaultAI: {
                  type: 'string',
                  example: 'mmaudio_v2',
                  nullable: true,
                },
              },
            },
            aiSettings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  aiService: { type: 'string', example: 'mmaudio_v2' },
                  name: { type: 'string', example: 'MMAudio V2' },
                  cost: { type: 'number', example: 20 },
                  description: {
                    type: 'string',
                    nullable: true,
                    example: 'Audio generation powered by Fal AI.',
                  },
                },
              },
            },
          },
        },
      },
      unauthorized: {
        status: 401,
        description: 'Unauthorized - invalid or missing JWT token.',
      },
    },
  },
  getTextVideoAISettings: {
    summary: 'Get text-to-video AI settings',
    description: `Return the text-to-video models served by the new \`media-generation\` module.

This endpoint is separate from the legacy video flow and reads from the new \`media_ai_settings\` table filtered for the new text-to-video route.`,
    responses: {
      success: {
        status: 200,
        description: 'Text-to-video AI settings retrieved successfully.',
        schema: {
          type: 'object',
          properties: {
            defaultSettings: {
              type: 'object',
              properties: {
                defaultAI: { type: 'string', example: 'p_video_text', nullable: true },
              },
            },
            aiSettings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  aiService: { type: 'string', example: 'p_video_text' },
                  name: { type: 'string', example: 'P-Video Text' },
                  cost: { type: 'number', example: 50 },
                  description: { type: 'string', nullable: true },
                  settings: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      durations: {
                        type: 'array',
                        items: { type: 'number', example: 5 },
                        example: [5, 10],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      unauthorized: {
        status: 401,
        description: 'Unauthorized - invalid or missing JWT token.',
      },
    },
  },
  getImageVideoAISettings: {
    summary: 'Get image-to-video AI settings',
    description: `Return the image-to-video models served by the new \`media-generation\` module.

This endpoint is separate from the legacy video flow and reads from the new \`media_ai_settings\` table filtered for the new image-to-video route.`,
    responses: {
      success: {
        status: 200,
        description: 'Image-to-video AI settings retrieved successfully.',
        schema: {
          type: 'object',
          properties: {
            defaultSettings: {
              type: 'object',
              properties: {
                defaultAI: { type: 'string', example: 'p_video_image', nullable: true },
              },
            },
            aiSettings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  aiService: { type: 'string', example: 'p_video_image' },
                  name: { type: 'string', example: 'P-Video Image' },
                  cost: { type: 'number', example: 50 },
                  description: { type: 'string', nullable: true },
                  settings: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      durations: {
                        type: 'array',
                        items: { type: 'number', example: 5 },
                        example: [5, 10],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      unauthorized: {
        status: 401,
        description: 'Unauthorized - invalid or missing JWT token.',
      },
    },
  },
  generatePromptImage: {
    summary: 'Generate prompt-based images through media orchestration',
    description: `Generate images through the new \`media-generation\` orchestration layer.

This endpoint is the new provider-facing abstraction for media generation. It resolves which backend provider should be used for the requested capability and model.

**Current routing behavior:**
- **Nano Banana**: routed through the public RunPod Google Nano Banana endpoint when configured
- **FLUX.1 Schnell**: routed through the public RunPod FLUX.1 Schnell endpoint when configured
- **Other models**: reserved for future migration into the same orchestration layer

**What this endpoint does:**
- Accepts a prompt-driven image generation request
- Resolves the provider through \`media-generation\`
- If \`contest_id\` is provided, resolves the contest model on the backend and can switch into FAL fine-tune mode automatically
- Pushes the request into a dedicated queue
- Deducts credits before persistence is finalized
- Saves generated posts with optional contest context
- Delivers the final result through the \`imageGenerated\` websocket event

**Delivery contract:**
- HTTP returns only queue acknowledgement
- Final images are delivered over websocket
- Offline users receive the same data later through \`undeliveredImages\`
- Unlike the legacy image endpoint, this websocket payload does not include \`activity_type\` or \`isEdit\``,
    responses: {
      success: {
        status: 201,
        description: 'Image generation task has been queued successfully.',
        schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Image generation task has been added to the queue.',
            },
          },
        },
      },
      badRequest: {
        status: 400,
        description: 'Invalid request payload or unsupported model/orientation combination.',
      },
      unauthorized: {
        status: 401,
        description: 'Unauthorized - invalid or missing JWT token.',
      },
      notImplemented: {
        status: 501,
        description: 'No media-generation route/provider is configured for the requested model yet.',
      },
    },
  },
  generateEditImage: {
    summary: 'Edit images through media orchestration',
    description: `Edit an existing image through the new \`media-generation\` orchestration layer.

**Current routing behavior:**
- **Qwen Image Edit**: routed through a public RunPod endpoint when configured

**What this endpoint does:**
- Accepts an image edit request with prompt + source image URL
- Resolves the provider through \`media-generation\`
- Pushes the request into a dedicated queue
- Deducts credits after the image is successfully generated
- Saves the edited image as a post
- Delivers the final result through the \`imageEdited\` websocket event

**Delivery contract:**
- HTTP returns only queue acknowledgement
- Final images are delivered over websocket
- Offline users receive the same data later through \`undeliveredImageEdits\`
- This websocket payload does not include \`activity_type\` or \`isEdit\``,
    responses: {
      success: {
        status: 201,
        description: 'Image editing task has been queued successfully.',
        schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Image editing task has been added to the queue.',
            },
          },
        },
      },
      badRequest: {
        status: 400,
        description: 'Invalid request payload or unsupported image edit model.',
      },
      unauthorized: {
        status: 401,
        description: 'Unauthorized - invalid or missing JWT token.',
      },
      notImplemented: {
        status: 501,
        description: 'No media-generation route/provider is configured for the requested image edit model yet.',
      },
    },
  },
  generateAudio: {
    summary: 'Generate audio through media orchestration',
    description: `Generate audio-enhanced video output through the new \`media-generation\` orchestration layer.

**Current routing behavior:**
- **MMAudio V2**: routed through Fal AI when configured

**What this endpoint does:**
- Accepts a source video URL plus prompt
- Resolves the provider through \`media-generation\`
- Pushes the request into a dedicated queue
- Deducts credits after the audio-enhanced video is successfully generated
- Saves the generated media as a post with \`hasAudio=true\`
- Delivers the final result through the \`audioGenerated\` websocket event

**Delivery contract:**
- HTTP returns only queue acknowledgement
- Final results are delivered over websocket
- Offline users receive the same data later through \`undeliveredAudio\`
- This websocket payload does not include \`activity_type\``,
    responses: {
      success: {
        status: 201,
        description: 'Audio generation task has been queued successfully.',
        schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Audio generation task has been added to the queue.',
            },
          },
        },
      },
      badRequest: {
        status: 400,
        description: 'Invalid request payload or unsupported audio model.',
      },
      unauthorized: {
        status: 401,
        description: 'Unauthorized - invalid or missing JWT token.',
      },
      notImplemented: {
        status: 501,
        description: 'No media-generation route/provider is configured for the requested audio model yet.',
      },
    },
  },
  generateTextVideo: {
    summary: 'Generate text-to-video through media orchestration',
    description: `Generate videos from prompt-only input through the new \`media-generation\` orchestration layer.

**Current routing behavior:**
- **P-Video text-to-video**: routed through the public RunPod \`p-video\` endpoint when configured

**What this endpoint does:**
- Accepts a prompt-driven video generation request
- Resolves the provider through \`media-generation\`
- Pushes the request into a dedicated queue
- Deducts credits after the video is successfully generated
- Saves the generated video as a post
- Delivers the final result through the \`videoGenerated\` websocket event

**Delivery contract:**
- HTTP returns only queue acknowledgement
- Final videos are delivered over websocket
- Offline users receive the same data later through \`undeliveredVideo\`
- Unlike the legacy video endpoint, this websocket payload does not include \`activity_type\``,
    responses: {
      success: {
        status: 201,
        description: 'Text-to-video generation task has been queued successfully.',
        schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Video generation task has been added to the queue.',
            },
          },
        },
      },
      badRequest: {
        status: 400,
        description: 'Invalid request payload or unsupported text-to-video model.',
      },
      unauthorized: {
        status: 401,
        description: 'Unauthorized - invalid or missing JWT token.',
      },
      notImplemented: {
        status: 501,
        description: 'No media-generation route/provider is configured for the requested text-to-video model yet.',
      },
    },
  },
  generateImageVideo: {
    summary: 'Generate image-to-video through media orchestration',
    description: `Generate videos from a source image through the new \`media-generation\` orchestration layer.

**Current routing behavior:**
- **P-Video image-to-video**: routed through the public RunPod \`p-video\` endpoint when configured

**What this endpoint does:**
- Accepts an image-to-video request with prompt + source image URL
- Resolves the provider through \`media-generation\`
- Pushes the request into a dedicated queue
- Deducts credits after the video is successfully generated
- Saves the generated video as a post
- Delivers the final result through the \`videoGenerated\` websocket event

**Delivery contract:**
- HTTP returns only queue acknowledgement
- Final videos are delivered over websocket
- Offline users receive the same data later through \`undeliveredVideo\`
- Unlike the legacy video endpoint, this websocket payload does not include \`activity_type\``,
    responses: {
      success: {
        status: 201,
        description: 'Image-to-video generation task has been queued successfully.',
        schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Video generation task has been added to the queue.',
            },
          },
        },
      },
      badRequest: {
        status: 400,
        description: 'Invalid request payload or unsupported image-to-video model.',
      },
      unauthorized: {
        status: 401,
        description: 'Unauthorized - invalid or missing JWT token.',
      },
      notImplemented: {
        status: 501,
        description: 'No media-generation route/provider is configured for the requested image-to-video model yet.',
      },
    },
  },
  getCapabilities: {
    summary: 'List media-generation capabilities and providers',
    description: `Return the currently declared capabilities and provider adapters available inside the new \`media-generation\` module.

This endpoint is useful for understanding how the orchestration layer is structured while the migration from legacy generation modules is in progress.`,
    responses: {
      success: {
        status: 200,
        description: 'Capabilities and provider declarations returned successfully.',
      },
      unauthorized: {
        status: 401,
        description: 'Unauthorized - invalid or missing JWT token.',
      },
    },
  },
};
