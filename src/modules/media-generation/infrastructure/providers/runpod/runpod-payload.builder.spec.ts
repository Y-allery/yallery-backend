import { RunpodPayloadBuilder } from './runpod-payload.builder';

describe('RunpodPayloadBuilder', () => {
  const builder = new RunpodPayloadBuilder();

  it('builds MMAudio video-to-audio payload', () => {
    expect(
      builder.buildAudioInput({
        aiService: 'mmaudio_v2',
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

  it('requires LoRA settings for SDXL LoRA generation', () => {
    expect(() =>
      builder.buildPromptImageInput({
        aiService: 'sdxl_lora_generation',
        prompt: 'portrait',
        width: 1024,
        height: 1024,
        imageQuantity: 1,
      } as any),
    ).toThrow('sdxl_lora_generation requires loraUrl');
  });

  it('builds SDXL prompt image payload with raw prompt + style (worker owns steps/cfg)', () => {
    expect(
      builder.buildPromptImageInput({
        aiService: 'sdxl',
        prompt: 'cinematic portrait',
        width: 1024,
        height: 1024,
        imageQuantity: 2,
      } as any),
    ).toEqual({
      prompt: 'cinematic portrait',
      style: undefined,
      width: 1024,
      height: 1024,
      num_images: 2,
      output_format: 'png',
      return_base64: true,
      return_data_uri: true,
    });
  });

  it('builds LTX text-to-video payload (720 horizontal, 5s, audio on)', () => {
    expect(
      builder.buildTextVideoInput({
        aiService: 'p_video_text',
        prompt: 'a red dragon over snowy mountains',
        orientation: 'horizontal',
        duration: 5,
        seed: 123456,
      }),
    ).toEqual({
      prompt: 'a red dragon over snowy mountains',
      width: 1280,
      height: 704,
      frames: 121,
      fps: 24,
      audio: true,
      tier: 'quality',
      seed: 123456,
      decode_noise: 0.05,
      cas_amount: 0,
    });
  });

  it('falls back to a random positive int32 seed when the request has none', () => {
    const { seed } = builder.buildTextVideoInput({
      aiService: 'p_video_text',
      prompt: 'a red dragon over snowy mountains',
      orientation: 'horizontal',
      duration: 5,
    });

    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(1);
    expect(seed).toBeLessThan(2 ** 31);
  });

  it('maps vertical orientation and 10s duration to LTX dims/frames', () => {
    expect(
      builder.buildTextVideoInput({
        aiService: 'p_video_text',
        prompt: 'ocean waves at sunset',
        orientation: 'vertical',
        duration: 10,
      }),
    ).toMatchObject({ width: 704, height: 1280, frames: 240 });
  });

  it('builds LTX image-to-video payload with bare base64 (i2v)', () => {
    expect(
      builder.buildImageVideoInput(
        {
          aiService: 'p_video_image',
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
        aiService: 'wan22_animate_native',
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
});
