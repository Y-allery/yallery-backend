import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import { PostDownloadService } from './post-download.service';

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock('sharp', () => {
  const toBuffer = jest.fn();
  const composite = jest.fn(() => ({ toBuffer }));
  const sharpMock: any = jest.fn(() => ({ composite }));
  sharpMock.__composite = composite;
  sharpMock.__toBuffer = toBuffer;
  return sharpMock;
});

import axios from 'axios';

const axiosGet = axios.get as jest.Mock;
const sharpMock = require('sharp');

describe('PostDownloadService', () => {
  const createService = () => {
    const postRepository = {
      findOne: jest.fn(),
    };

    return {
      service: new PostDownloadService(postRepository as any),
      postRepository,
    };
  };

  const imagePost = (id: number) => ({
    id,
    imageUrl: `https://cdn.test/post_${id}.png`,
    videoUrl: null,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest
      .spyOn(fs.promises, 'readFile')
      .mockResolvedValue(Buffer.from('watermark'));
    sharpMock.__toBuffer.mockResolvedValue(Buffer.from('watermarked'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws NotFoundException when post is missing', async () => {
    const { service, postRepository } = createService();
    postRepository.findOne.mockResolvedValue(null);

    await expect(service.getPostImageWithWatermark(1)).rejects.toThrow(
      new NotFoundException('Post not found'),
    );
  });

  it('returns the video as-is without watermarking', async () => {
    const { service, postRepository } = createService();
    postRepository.findOne.mockResolvedValue({
      id: 5,
      imageUrl: null,
      videoUrl: 'https://cdn.test/post_5.mp4',
    });
    axiosGet.mockResolvedValue({ data: Buffer.from('video-bytes') });

    const result = await service.getPostImageWithWatermark(5);

    expect(result).toEqual({
      buffer: Buffer.from('video-bytes'),
      contentType: 'video/mp4',
      filename: 'post_5.mp4',
    });
    expect(sharpMock).not.toHaveBeenCalled();
    expect(axiosGet).toHaveBeenCalledWith('https://cdn.test/post_5.mp4', {
      responseType: 'arraybuffer',
      timeout: 30_000,
      maxContentLength: 100 * 1024 * 1024,
    });
  });

  it('does not cache video results', async () => {
    const { service, postRepository } = createService();
    postRepository.findOne.mockResolvedValue({
      id: 5,
      imageUrl: null,
      videoUrl: 'https://cdn.test/post_5.mp4',
    });
    axiosGet.mockResolvedValue({ data: Buffer.from('video-bytes') });

    await service.getPostImageWithWatermark(5);
    await service.getPostImageWithWatermark(5);

    expect(axiosGet).toHaveBeenCalledTimes(2);
  });

  it('watermarks images and returns a png attachment payload', async () => {
    const { service, postRepository } = createService();
    postRepository.findOne.mockResolvedValue(imagePost(7));
    axiosGet.mockResolvedValue({ data: Buffer.from('original') });

    const result = await service.getPostImageWithWatermark(7);

    expect(result).toEqual({
      buffer: Buffer.from('watermarked'),
      contentType: 'image/png',
      filename: 'post_7.png',
    });
    expect(axiosGet).toHaveBeenCalledWith('https://cdn.test/post_7.png', {
      responseType: 'arraybuffer',
      timeout: 30_000,
      maxContentLength: 100 * 1024 * 1024,
    });
    expect(sharpMock.__composite).toHaveBeenCalledWith([
      { input: Buffer.from('watermark'), gravity: 'southeast' },
    ]);
  });

  it('serves cached image results without refetching or reprocessing', async () => {
    const { service, postRepository } = createService();
    postRepository.findOne.mockResolvedValue(imagePost(7));
    axiosGet.mockResolvedValue({ data: Buffer.from('original') });

    const first = await service.getPostImageWithWatermark(7);
    const second = await service.getPostImageWithWatermark(7);

    expect(second).toEqual(first);
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(sharpMock).toHaveBeenCalledTimes(1);
  });

  it('reads the watermark file only once across requests', async () => {
    const { service, postRepository } = createService();
    postRepository.findOne
      .mockResolvedValueOnce(imagePost(1))
      .mockResolvedValueOnce(imagePost(2));
    axiosGet.mockResolvedValue({ data: Buffer.from('original') });

    await service.getPostImageWithWatermark(1);
    await service.getPostImageWithWatermark(2);

    expect(fs.promises.readFile).toHaveBeenCalledTimes(1);
  });

  it('evicts the oldest cached entry beyond the entry cap', async () => {
    const { service, postRepository } = createService();
    axiosGet.mockResolvedValue({ data: Buffer.from('original') });

    for (let id = 1; id <= 31; id++) {
      postRepository.findOne.mockResolvedValueOnce(imagePost(id));
      await service.getPostImageWithWatermark(id);
    }

    const cache = (service as any).downloadCache as Map<number, unknown>;
    expect(cache.size).toBe(30);
    expect(cache.has(1)).toBe(false);
    expect(cache.has(31)).toBe(true);
  });

  it('evicts by total bytes cap', async () => {
    const { service, postRepository } = createService();
    axiosGet.mockResolvedValue({ data: Buffer.from('original') });
    sharpMock.__toBuffer.mockResolvedValue(Buffer.alloc(60 * 1024 * 1024));

    postRepository.findOne
      .mockResolvedValueOnce(imagePost(1))
      .mockResolvedValueOnce(imagePost(2));
    await service.getPostImageWithWatermark(1);
    await service.getPostImageWithWatermark(2);

    const cache = (service as any).downloadCache as Map<number, unknown>;
    expect(cache.has(1)).toBe(false);
    expect(cache.has(2)).toBe(true);
    expect((service as any).downloadCacheBytes).toBe(60 * 1024 * 1024);
  });

  it('throws NotFoundException when the image fetch fails', async () => {
    const { service, postRepository } = createService();
    postRepository.findOne.mockResolvedValue(imagePost(7));
    axiosGet.mockRejectedValue(new Error('timeout'));

    await expect(service.getPostImageWithWatermark(7)).rejects.toThrow(
      new NotFoundException('Error fetching image from URL'),
    );
  });

  it('throws NotFoundException when the watermark file is missing', async () => {
    const { service, postRepository } = createService();
    postRepository.findOne.mockResolvedValue(imagePost(7));
    axiosGet.mockResolvedValue({ data: Buffer.from('original') });
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    await expect(service.getPostImageWithWatermark(7)).rejects.toThrow(
      new NotFoundException('Watermark file not found'),
    );
  });

  it('throws a plain error when sharp fails', async () => {
    const { service, postRepository } = createService();
    postRepository.findOne.mockResolvedValue(imagePost(7));
    axiosGet.mockResolvedValue({ data: Buffer.from('original') });
    sharpMock.__toBuffer.mockRejectedValue(new Error('bad image'));

    await expect(service.getPostImageWithWatermark(7)).rejects.toThrow(
      'Error processing image',
    );
  });
});
