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
                  example: 'yengine_photo_lite',
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
                  aiService: { type: 'string', example: 'yengine_photo_lite' },
                  name: { type: 'string', example: 'YEngine Photo Lite' },
                  allowedOrientations: {
                    type: 'array',
                    items: { type: 'string', enum: ['horizontal', 'vertical'] },
                  },
                  maxPromptLength: {
                    type: 'number',
                    description:
                      'Prompt-length budget in characters. Always present (defaults to 500); a per-model settings row can override it.',
                    example: 500,
                  },
                  cost: { type: 'number', example: 11 },
                  description: {
                    type: 'string',
                    nullable: true,
                    example:
                      'Prompt-to-image generation powered by the YEngine image pipeline.',
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
                    example:
                      'https://yallery-api-prod.org/media/image/upload/octoai_images/style.png',
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
  getFineTunePromptImageAISettings: {
    summary: 'Get fine-tune prompt image AI settings',
    description: `Return prompt-image settings for fine-tune contests.

This endpoint intentionally exposes only the active \`yengine_portrait\` model so clients do not need to filter regular image generation models before entering a fine-tune contest flow.`,
    responses: {
      success: {
        status: 200,
        description:
          'Fine-tune prompt image AI settings retrieved successfully.',
        schema: {
          type: 'object',
          properties: {
            defaultSettings: {
              type: 'object',
              properties: {
                defaultAI: {
                  type: 'string',
                  example: 'yengine_portrait',
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
                  aiService: {
                    type: 'string',
                    example: 'yengine_portrait',
                  },
                  name: { type: 'string', example: 'YEngine Portrait' },
                  allowedOrientations: {
                    type: 'array',
                    items: { type: 'string', enum: ['horizontal', 'vertical'] },
                  },
                  minImages: { type: 'number', example: 1 },
                  maxImages: { type: 'number', example: 1 },
                  maxPromptLength: {
                    type: 'number',
                    description:
                      'Prompt-length budget in characters. Always present (defaults to 500); a per-model settings row can override it.',
                    example: 500,
                  },
                  cost: { type: 'number', example: 20 },
                  description: {
                    type: 'string',
                    nullable: true,
                    example:
                      'Fine-tune contest image generation powered by the YEngine portrait pipeline.',
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
                    example:
                      'https://yallery-api-prod.org/media/image/upload/octoai_images/style.png',
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
                  example: 'yengine_edit',
                  nullable: true,
                },
              },
            },
            aiSettings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  aiService: {
                    type: 'string',
                    example: 'yengine_edit',
                  },
                  name: { type: 'string', example: 'YEngine Edit' },
                  minImages: {
                    type: 'number',
                    description:
                      'OUTPUT images produced per edit. Stays 1/1 — not the reference count.',
                    example: 1,
                  },
                  maxImages: { type: 'number', example: 1 },
                  minReferenceImages: {
                    type: 'number',
                    description:
                      'INPUT reference images the model accepts. Drives the multi-slot picker.',
                    example: 1,
                  },
                  maxReferenceImages: { type: 'number', example: 3 },
                  maxPromptLength: {
                    type: 'number',
                    description:
                      'Prompt-length budget in characters. Always present (defaults to 500); a per-model settings row can override it.',
                    example: 500,
                  },
                  cost: { type: 'number', example: 25 },
                  description: {
                    type: 'string',
                    nullable: true,
                    example: 'Image editing powered by the YEngine pipeline.',
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
                    example:
                      'https://yallery-api-prod.org/media/image/upload/octoai_images/style.png',
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
                  example: 'yengine_audio',
                  nullable: true,
                },
              },
            },
            aiSettings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  aiService: { type: 'string', example: 'yengine_audio' },
                  name: { type: 'string', example: 'YEngine Audio' },
                  maxPromptLength: {
                    type: 'number',
                    description:
                      'Prompt-length budget in characters. Always present (defaults to 500); a per-model settings row can override it.',
                    example: 500,
                  },
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
                defaultAI: {
                  type: 'string',
                  example: 'yengine_video_text',
                  nullable: true,
                },
              },
            },
            aiSettings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  aiService: { type: 'string', example: 'yengine_video_text' },
                  name: { type: 'string', example: 'YEngine' },
                  maxPromptLength: {
                    type: 'number',
                    description:
                      'Prompt-length budget in characters. Always present (defaults to 500); a per-model settings row can override it.',
                    example: 500,
                  },
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
                      pricing: {
                        type: 'object',
                        nullable: true,
                        properties: {
                          strategy: {
                            type: 'string',
                            enum: ['fixed', 'per_second'],
                            example: 'per_second',
                          },
                          creditsPerSecond: {
                            type: 'number',
                            example: 10,
                          },
                          durationCosts: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                duration: { type: 'number', example: 5 },
                                cost: { type: 'number', example: 50 },
                              },
                            },
                            example: [
                              { duration: 5, cost: 50 },
                              { duration: 10, cost: 100 },
                            ],
                          },
                        },
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
                defaultAI: {
                  type: 'string',
                  example: 'yengine_video_image',
                  nullable: true,
                },
              },
            },
            aiSettings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  aiService: { type: 'string', example: 'yengine_video_image' },
                  name: { type: 'string', example: 'YEngine' },
                  maxPromptLength: {
                    type: 'number',
                    description:
                      'Prompt-length budget in characters. Always present (defaults to 500); a per-model settings row can override it.',
                    example: 500,
                  },
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
                      pricing: {
                        type: 'object',
                        nullable: true,
                        properties: {
                          strategy: {
                            type: 'string',
                            enum: ['fixed', 'per_second'],
                            example: 'per_second',
                          },
                          creditsPerSecond: {
                            type: 'number',
                            example: 10,
                          },
                          durationCosts: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                duration: { type: 'number', example: 5 },
                                cost: { type: 'number', example: 50 },
                              },
                            },
                            example: [
                              { duration: 5, cost: 50 },
                              { duration: 10, cost: 100 },
                            ],
                          },
                        },
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
  getMemeAISettings: {
    summary: 'Get meme AI settings',
    description: `Return the meme-generation models served by the new \`media-generation\` module.

This endpoint is separate from the meme template catalog. It reads from the new \`media_ai_settings\` table filtered by \`meme_generate\` capability, while template selection still comes from \`GET /memes\`.`,
    responses: {
      success: {
        status: 200,
        description: 'Meme AI settings retrieved successfully.',
        schema: {
          type: 'object',
          properties: {
            defaultSettings: {
              type: 'object',
              properties: {
                defaultAI: {
                  type: 'string',
                  example: 'yengine_meme',
                  nullable: true,
                },
              },
            },
            aiSettings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  aiService: {
                    type: 'string',
                    example: 'yengine_meme',
                  },
                  name: { type: 'string', example: 'Meme v2' },
                  maxPromptLength: {
                    type: 'number',
                    description:
                      'Prompt-length budget in characters. Always present (defaults to 500); a per-model settings row can override it.',
                    example: 500,
                  },
                  cost: { type: 'number', example: 100 },
                  description: { type: 'string', nullable: true },
                  settings: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      characterOrientations: {
                        type: 'array',
                        items: { type: 'string', enum: ['image', 'video'] },
                        example: ['image', 'video'],
                      },
                      defaultCharacterOrientation: {
                        type: 'string',
                        enum: ['image', 'video'],
                        example: 'video',
                      },
                      keepOriginalSound: {
                        type: 'boolean',
                        example: true,
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
- **YEngine Photo Lite**: routed through the configured YEngine pipeline
- **YEngine Photo Pro**: routed through the configured YEngine pipeline

**What this endpoint does:**
- Accepts a prompt-driven image generation request
- Resolves the provider through \`media-generation\`
- If \`contest_id\` is provided, resolves the contest model on the backend and can switch into YEngine LoRA fine-tune mode automatically
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
            taskId: {
              type: 'string',
              description:
                'Queue task identifier. The same taskId is included in the websocket completion event (`imageGenerated`) and in `mediaGenerationError`.',
              example: '3f2b6d1c-8a4e-4c1d-9f6b-2f1a7e5c9d10',
            },
          },
        },
      },
      badRequest: {
        status: 400,
        description:
          'Invalid request payload or unsupported model/orientation combination.',
      },
      unauthorized: {
        status: 401,
        description: 'Unauthorized - invalid or missing JWT token.',
      },
      notImplemented: {
        status: 501,
        description:
          'No media-generation route/provider is configured for the requested model yet.',
      },
    },
  },
  generateEditImage: {
    summary: 'Edit images through media orchestration',
    description: `Edit an existing image through the new \`media-generation\` orchestration layer.

**Current routing behavior:**
- **YEngine Edit**: routed through the configured YEngine pipeline

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
            taskId: {
              type: 'string',
              description:
                'Queue task identifier. The same taskId is included in the websocket completion event (`imageEdited`) and in `mediaGenerationError`.',
              example: '3f2b6d1c-8a4e-4c1d-9f6b-2f1a7e5c9d10',
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
        description:
          'No media-generation route/provider is configured for the requested image edit model yet.',
      },
    },
  },
  generateAudio: {
    summary: 'Generate audio through media orchestration',
    description: `Generate audio-enhanced video output through the new \`media-generation\` orchestration layer.

**Current routing behavior:**
- **YEngine Audio**: routed through Fal AI when configured

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
            taskId: {
              type: 'string',
              description:
                'Queue task identifier. The same taskId is included in the websocket completion event (`audioGenerated`) and in `mediaGenerationError`.',
              example: '3f2b6d1c-8a4e-4c1d-9f6b-2f1a7e5c9d10',
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
        description:
          'No media-generation route/provider is configured for the requested audio model yet.',
      },
    },
  },
  generateTextVideo: {
    summary: 'Generate text-to-video through media orchestration',
    description: `Generate videos from prompt-only input through the new \`media-generation\` orchestration layer.

**Current routing behavior:**
- **YEngine text-to-video**: routed through the public YEngine \`yengine\` endpoint when configured

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
        description:
          'Text-to-video generation task has been queued successfully.',
        schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Video generation task has been added to the queue.',
            },
            taskId: {
              type: 'string',
              description:
                'Queue task identifier. The same taskId is included in the websocket completion event (`videoGenerated`) and in `mediaGenerationError`.',
              example: '3f2b6d1c-8a4e-4c1d-9f6b-2f1a7e5c9d10',
            },
          },
        },
      },
      badRequest: {
        status: 400,
        description:
          'Invalid request payload or unsupported text-to-video model.',
      },
      unauthorized: {
        status: 401,
        description: 'Unauthorized - invalid or missing JWT token.',
      },
      notImplemented: {
        status: 501,
        description:
          'No media-generation route/provider is configured for the requested text-to-video model yet.',
      },
    },
  },
  generateImageVideo: {
    summary: 'Generate image-to-video through media orchestration',
    description: `Generate videos from a source image through the new \`media-generation\` orchestration layer.

**Current routing behavior:**
- **YEngine image-to-video**: routed through the public YEngine \`yengine\` endpoint when configured

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
        description:
          'Image-to-video generation task has been queued successfully.',
        schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Video generation task has been added to the queue.',
            },
            taskId: {
              type: 'string',
              description:
                'Queue task identifier. The same taskId is included in the websocket completion event (`videoGenerated`) and in `mediaGenerationError`.',
              example: '3f2b6d1c-8a4e-4c1d-9f6b-2f1a7e5c9d10',
            },
          },
        },
      },
      badRequest: {
        status: 400,
        description:
          'Invalid request payload or unsupported image-to-video model.',
      },
      unauthorized: {
        status: 401,
        description: 'Unauthorized - invalid or missing JWT token.',
      },
      notImplemented: {
        status: 501,
        description:
          'No media-generation route/provider is configured for the requested image-to-video model yet.',
      },
    },
  },
  generateMeme: {
    summary: 'Generate meme video through media orchestration',
    description: `Generate meme motion-transfer videos through the new \`media-generation\` orchestration layer.

**Current routing behavior:**
- **YEngine Meme**: routed through the YEngine pipeline when configured

**What this endpoint does:**
- Accepts a meme template ID plus a user source image
- Resolves the reference video from the selected meme template on the backend
- Pushes the request into a dedicated queue
- Deducts credits after the meme video is successfully generated
- Saves the generated meme as a post
- Delivers the final result through the \`memeGenerated\` websocket event
- Emits \`profileUpdate\` after points are deducted

**Delivery contract:**
- HTTP returns only queue acknowledgement
- Final meme videos are delivered over websocket
- Offline users receive the same data later through \`undeliveredMemes\``,
    responses: {
      success: {
        status: 201,
        description: 'Meme generation task has been queued successfully.',
        schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Meme generation task has been added to the queue.',
            },
            taskId: {
              type: 'string',
              description:
                'Queue task identifier. The same taskId is included in the websocket completion event (`memeGenerated`), in `memeGenerationProgress` (as jobId) and in `mediaGenerationError`.',
              example: '3f2b6d1c-8a4e-4c1d-9f6b-2f1a7e5c9d10',
            },
          },
        },
      },
      badRequest: {
        status: 400,
        description:
          'Invalid request payload, inactive meme template, or not enough credits.',
      },
      unauthorized: {
        status: 401,
        description: 'Unauthorized - invalid or missing JWT token.',
      },
      notImplemented: {
        status: 501,
        description:
          'No media-generation route/provider is configured for the requested meme model yet.',
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
        description:
          'Capabilities and provider declarations returned successfully.',
      },
      unauthorized: {
        status: 401,
        description: 'Unauthorized - invalid or missing JWT token.',
      },
    },
  },
};
