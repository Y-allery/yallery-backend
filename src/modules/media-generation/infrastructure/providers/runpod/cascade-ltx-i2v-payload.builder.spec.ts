import * as sharp from 'sharp';
import {
  buildCascadeLtxI2VPayload,
  CascadeLtxI2VPayloadError,
} from './cascade-ltx-i2v-payload.builder';

describe('buildCascadeLtxI2VPayload', () => {
  let landscapePng: Buffer;
  let portraitPng: Buffer;
  let palettedPng: Buffer;

  beforeAll(async () => {
    landscapePng = await createCanonicalPng(1280, 704);
    portraitPng = await createCanonicalPng(704, 1280);
    palettedPng = await sharp({
      create: {
        width: 1280,
        height: 704,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    })
      .png({ palette: true })
      .toBuffer();
  });

  it.each([
    ['landscape Buffer', 1280, 704, 121, () => landscapePng],
    ['portrait base64', 704, 1280, 241, () => portraitPng.toString('base64')],
  ] as const)(
    'builds a strict %s cascade payload',
    (_, width, height, frames, source) => {
      const prompt = 'One dancer turns slowly in an empty studio.';
      const image = source();
      const payload = buildCascadeLtxI2VPayload({
        prompt,
        canonicalPng: image,
        width,
        height,
        frames,
        seed: 43103,
      });

      expect(payload).toEqual({
        prompt,
        image_b64: Buffer.isBuffer(image) ? image.toString('base64') : image,
        width,
        height,
        frames,
        fps: 24,
        audio: true,
        tier: 'quality',
        seed: 43103,
        cas_amount: 0,
        enhance: true,
      });
      expect(Object.keys(payload).sort()).toEqual(
        [
          'prompt',
          'image_b64',
          'width',
          'height',
          'frames',
          'fps',
          'audio',
          'tier',
          'seed',
          'cas_amount',
          'enhance',
        ].sort(),
      );
      expect(payload.image_b64).not.toContain('data:');
    },
  );

  it('enforces the serialized RunPod request cap including the input wrapper', () => {
    const request = {
      prompt: 'A waterfall in a forest clearing.',
      canonicalPng: landscapePng,
      width: 1280 as const,
      height: 704 as const,
      frames: 121 as const,
      seed: 33104,
    };
    const payload = buildCascadeLtxI2VPayload(request);
    const exactBytes = Buffer.byteLength(
      JSON.stringify({ input: payload }),
      'utf8',
    );

    expect(() =>
      buildCascadeLtxI2VPayload({
        ...request,
        maxSerializedRequestBytes: exactBytes - 1,
      }),
    ).toThrow(
      expect.objectContaining({
        message: 'LTX_CASCADE_PAYLOAD_TOO_LARGE',
        reasonCode: 'LTX_CASCADE_PAYLOAD_TOO_LARGE',
      }),
    );
    expect(
      buildCascadeLtxI2VPayload({
        ...request,
        maxSerializedRequestBytes: exactBytes,
      }),
    ).toEqual(payload);
  });

  it.each([
    [
      'data URI',
      () =>
        buildCascadeLtxI2VPayload({
          prompt: 'A valid prompt.',
          canonicalPng: `data:image/png;base64,${landscapePng.toString(
            'base64',
          )}`,
          width: 1280,
          height: 704,
          frames: 121,
          seed: 1,
        }),
    ],
    [
      'dimension mismatch',
      () =>
        buildCascadeLtxI2VPayload({
          prompt: 'A valid prompt.',
          canonicalPng: landscapePng,
          width: 704,
          height: 1280,
          frames: 121,
          seed: 1,
        }),
    ],
    [
      'paletted PNG',
      () =>
        buildCascadeLtxI2VPayload({
          prompt: 'A valid prompt.',
          canonicalPng: palettedPng,
          width: 1280,
          height: 704,
          frames: 121,
          seed: 1,
        }),
    ],
    [
      'truncated PNG',
      () =>
        buildCascadeLtxI2VPayload({
          prompt: 'A valid prompt.',
          canonicalPng: landscapePng.subarray(0, landscapePng.byteLength - 12),
          width: 1280,
          height: 704,
          frames: 121,
          seed: 1,
        }),
    ],
    [
      'invalid frame tier',
      () =>
        buildCascadeLtxI2VPayload({
          prompt: 'A valid prompt.',
          canonicalPng: landscapePng,
          width: 1280,
          height: 704,
          frames: 120 as 121,
          seed: 1,
        }),
    ],
  ])('rejects %s without transforming the checkpoint', (_, action) => {
    expect(action).toThrow(
      expect.objectContaining({
        message: 'LTX_CASCADE_PAYLOAD_INVALID',
        reasonCode: 'LTX_CASCADE_PAYLOAD_INVALID',
      }),
    );
  });

  it('keeps prompt and base64 out of validation errors', () => {
    const prompt =
      'raw-prompt https://private.example/image.png api-key raw-base64';
    let caught: unknown;
    try {
      buildCascadeLtxI2VPayload({
        prompt: ` ${prompt} `,
        canonicalPng: landscapePng,
        width: 1280,
        height: 704,
        frames: 121,
        seed: 1,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CascadeLtxI2VPayloadError);
    const serialized = JSON.stringify(caught);
    expect(serialized).toBe(
      JSON.stringify({ reasonCode: 'LTX_CASCADE_PAYLOAD_INVALID' }),
    );
    expect(serialized).not.toContain(prompt);
    expect(serialized).not.toContain(landscapePng.toString('base64'));
  });
});

async function createCanonicalPng(
  width: number,
  height: number,
): Promise<Buffer> {
  const rgb = Buffer.allocUnsafe(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      rgb[offset] = Math.floor(x / 8) % 256;
      rgb[offset + 1] = Math.floor(y / 4) % 256;
      rgb[offset + 2] = ((Math.floor(x / 32) + Math.floor(y / 32)) * 17) % 256;
    }
  }
  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: false,
      palette: false,
    })
    .toBuffer();
}
