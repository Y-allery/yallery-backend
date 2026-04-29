import { MediaPreviewService } from 'src/modules/media-generation/infrastructure/previews/media-preview.service';

describe('MediaPreviewService', () => {
  const service = new MediaPreviewService();

  it('builds Cloudinary frame preview URLs', () => {
    expect(
      service.generateCloudinaryVideoPreviewUrl(
        'https://res.cloudinary.com/demo/video/upload/v1/sample.mp4?x=1',
      ),
    ).toBe('https://res.cloudinary.com/demo/video/upload/so_0/v1/sample.jpg');
  });

  it('builds simple video previews for non-Cloudinary URLs', () => {
    expect(
      service.generateCloudinaryVideoPreviewUrl('https://cdn.test/a/b.webm'),
    ).toBe('https://cdn.test/a/b.jpg');
  });

  it('returns null for invalid input', () => {
    expect(service.generateCloudinaryVideoPreviewUrl('')).toBeNull();
  });
});
