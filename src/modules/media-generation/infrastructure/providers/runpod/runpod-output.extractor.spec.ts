import { BadGatewayException } from '@nestjs/common';
import { RunpodOutputExtractor } from './runpod-output.extractor';

describe('RunpodOutputExtractor', () => {
  const extractor = new RunpodOutputExtractor();

  it('extracts nested image URLs and data URIs', () => {
    expect(
      extractor.extractImageSources({
        output: {
          images: [
            'https://cdn.test/image.png',
            { data_uri: 'data:image/png;base64,AAAA' },
            { base64: 'BBBB', format: 'jpg' },
          ],
        },
      }),
    ).toEqual([
      'https://cdn.test/image.png',
      'data:image/png;base64,AAAA',
      'data:image/jpeg;base64,BBBB',
    ]);
  });

  it('extracts video base64 output', () => {
    expect(
      extractor.extractVideoSource({
        videos: [{ base64: 'CCCC', format: 'video/mp4' }],
      }),
    ).toBe('data:video/mp4;base64,CCCC');
  });

  it('extracts the LTX worker video_b64 output field', () => {
    expect(
      extractor.extractVideoSource({ output: { video_b64: 'EEEE' } }),
    ).toBe('data:video/mp4;base64,EEEE');
  });

  it('throws cleanly when output is missing', () => {
    expect(() => extractor.extractVideoSource({})).toThrow(BadGatewayException);
  });
});
