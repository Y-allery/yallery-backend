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
