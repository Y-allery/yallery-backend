import { RunpodPayloadBuilder } from './runpod-payload.builder';

describe('RunpodPayloadBuilder', () => {
  const builder = new RunpodPayloadBuilder();

  it('builds MMAudio video-to-audio payload', () => {
    expect(
      builder.buildAudioInput({
        aiService: 'yengine_audio',
        prompt: 'cinematic drums',
        videoUrl: 'https://cdn.test/source.mp4',
      }),
    ).toEqual({
      video_url: 'https://cdn.test/source.mp4',
      prompt: 'cinematic drums',
      negative_prompt: '',
      match_source_duration: true,
      return_base64: true,
      num_steps: 25,
      cfg_strength: 4.5,
    });
  });

  it('requires a validated Krea 2 Turbo LoRA artifact', () => {
    expect(() =>
      builder.buildPromptImageInput({
        aiService: 'yengine_portrait',
        prompt: 'portrait',
        width: 1024,
        height: 1024,
        imageQuantity: 1,
      } as any),
    ).toThrow('Krea 2 Turbo-compatible LoRA artifact');
  });

  it('builds fixed-recipe plain Krea 2 Turbo payload with structured style', () => {
    expect(
      builder.buildPromptImageInput({
        aiService: 'yengine_photo_pro',
        prompt: 'cinematic portrait',
        style: {
          name: 'Anime',
          positive: 'clean cel shading',
          negative: null,
          keywords: ['bold line art'],
        },
        width: 1024,
        height: 1024,
        imageQuantity: 2,
      } as any),
    ).toEqual({
      prompt: 'cinematic portrait',
      style: {
        name: 'Anime',
        positive: 'clean cel shading',
        negative: null,
        keywords: ['bold line art'],
      },
      width: 1024,
      height: 1024,
      numImages: 2,
      numInferenceSteps: 8,
      guidanceScale: 0,
      mu: 1.15,
      outputFormat: 'png',
      upload: true,
      returnBase64: false,
    });
  });

  it('builds fixed-recipe Krea 2 LoRA payload with integrity metadata', () => {
    expect(
      builder.buildPromptImageInput({
        aiService: 'yengine_portrait',
        prompt: 'xoob_character exploring a forest',
        width: 768,
        height: 1344,
        imageQuantity: 1,
        providerSettings: {
          triggerWord: 'xoob_character',
          loraUrl: 'https://cdn.test/xoob.safetensors',
          loraKey: 'xoob-krea2',
          loraScale: 0.9,
          loraSha256: 'a'.repeat(64),
          loraStep: 1000,
          inferenceModel: 'krea/Krea-2-Turbo',
        },
      } as any),
    ).toMatchObject({
      triggerWord: 'xoob_character',
      loraKey: 'xoob-krea2',
      loraScale: 0.9,
      loraSha256: 'a'.repeat(64),
      loraStep: 1000,
      numInferenceSteps: 8,
      guidanceScale: 0,
      mu: 1.15,
      upload: true,
      returnBase64: false,
    });
  });

  it('builds LTX text-to-video payload (720 horizontal, 5s, audio on)', () => {
    const payload = builder.buildTextVideoInput({
      aiService: 'yengine_video_text',
      prompt: 'a red dragon over snowy mountains',
      orientation: 'horizontal',
      duration: 5,
      seed: 123456,
    });

    expect(payload).toEqual({
      prompt: 'a red dragon over snowy mountains',
      width: 1280,
      height: 704,
      frames: 121,
      fps: 24,
      audio: true,
      tier: 'quality',
      seed: 123456,
      cas_amount: 0,
    });
    expect(payload).not.toHaveProperty('decode_noise');
  });

  it('falls back to a random positive int32 seed when the request has none', () => {
    const { seed } = builder.buildTextVideoInput({
      aiService: 'yengine_video_text',
      prompt: 'a red dragon over snowy mountains',
      orientation: 'horizontal',
      duration: 5,
    });

    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(1);
    expect(seed).toBeLessThan(2 ** 31);
  });

  it('maps vertical orientation and 10s duration to a valid LTX frame count', () => {
    const payload = builder.buildTextVideoInput({
      aiService: 'yengine_video_text',
      prompt: 'ocean waves at sunset',
      orientation: 'vertical',
      duration: 10,
    });

    expect(payload).toMatchObject({ width: 704, height: 1280, frames: 241 });
    expect(payload).not.toHaveProperty('decode_noise');
  });

  it('builds LTX image-to-video payload with bare base64 (i2v)', () => {
    expect(
      builder.buildImageVideoInput(
        {
          aiService: 'yengine_video_image',
          prompt: 'animate this',
          imageUrl: 'https://cdn.test/source.png',
          orientation: 'horizontal',
          duration: 5,
        },
        'QkFTRTY0',
      ),
    ).toMatchObject({
      prompt: 'animate this',
      width: 1280,
      height: 704,
      frames: 121,
      image_b64: 'QkFTRTY0',
    });
  });

  it('builds meme animation payload preserving source audio', () => {
    expect(
      builder.buildMemeInput({
        aiService: 'yengine_meme',
        prompt: '',
        imageUrl: 'https://cdn.test/image.png',
        videoUrl: 'https://cdn.test/source.mp4',
        memeId: 1,
      }),
    ).toMatchObject({
      image_url: 'https://cdn.test/image.png',
      video_url: 'https://cdn.test/source.mp4',
      match_source_duration: true,
      output_frame_rate: 30,
      preserve_source_audio: true,
      return_base64: true,
    });
  });

  describe('buildImageEditInput', () => {
    const baseRequest = {
      aiService: 'yengine_edit',
      prompt: 'put him on a beach',
    };

    it('sends a single reference in both the scalar and the array form', () => {
      expect(
        builder.buildImageEditInput({
          ...baseRequest,
          imageUrl: 'https://cdn.test/a.png',
          imageUrls: ['https://cdn.test/a.png'],
        }),
      ).toMatchObject({
        image_url: 'https://cdn.test/a.png',
        image_urls: ['https://cdn.test/a.png'],
        num_images: 1,
      });
    });

    it('sends all three references, with the scalar pinned to the canvas', () => {
      const payload = builder.buildImageEditInput({
        ...baseRequest,
        imageUrl: 'https://cdn.test/canvas.png',
        imageUrls: [
          'https://cdn.test/canvas.png',
          'https://cdn.test/person.png',
          'https://cdn.test/jacket.png',
        ],
      });

      expect(payload.image_urls).toEqual([
        'https://cdn.test/canvas.png',
        'https://cdn.test/person.png',
        'https://cdn.test/jacket.png',
      ]);
      // A rolled-back worker reads only this and degrades to editing the canvas alone.
      expect(payload.image_url).toBe('https://cdn.test/canvas.png');
      // Reference count must never leak into the OUTPUT count.
      expect(payload.num_images).toBe(1);
    });

    it('falls back to the scalar for jobs enqueued before the multi-reference release', () => {
      // BullMQ keeps failed jobs (removeOnFail: false, attempts: 2), so an in-flight job with
      // the old shape can be retried after deploy and must not produce an empty reference list.
      expect(
        builder.buildImageEditInput({
          ...baseRequest,
          imageUrl: 'https://cdn.test/legacy.png',
        }),
      ).toMatchObject({
        image_url: 'https://cdn.test/legacy.png',
        image_urls: ['https://cdn.test/legacy.png'],
      });
    });

    it('hard-caps references at three even if a request somehow carries more', () => {
      const payload = builder.buildImageEditInput({
        ...baseRequest,
        imageUrl: 'https://cdn.test/1.png',
        imageUrls: [
          'https://cdn.test/1.png',
          'https://cdn.test/2.png',
          'https://cdn.test/3.png',
          'https://cdn.test/4.png',
        ],
      });

      expect(payload.image_urls).toHaveLength(3);
      expect(payload.image_urls).not.toContain('https://cdn.test/4.png');
    });
  });
});
