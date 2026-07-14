import {
  MEDIA_TRANSFORMATIONS,
  derivedObjectKey,
  parseMediaPath,
  posterObjectKey,
} from './media-transformations';

describe('parseMediaPath', () => {
  it('parses a plain original key', () => {
    expect(parseMediaPath('octoai_images/abc.png')).toEqual({
      transformationName: null,
      transformation: null,
      posterOfVideo: false,
      key: 'octoai_images/abc.png',
    });
  });

  it('parses a named transformation', () => {
    const parsed = parseMediaPath(
      't_yallery_thumb_image_v2/octoai_images/abc.png',
    );
    expect(parsed?.transformationName).toBe('t_yallery_thumb_image_v2');
    expect(parsed?.transformation).toBe(
      MEDIA_TRANSFORMATIONS.t_yallery_thumb_image_v2,
    );
    expect(parsed?.key).toBe('octoai_images/abc.png');
  });

  it('strips version segments like Cloudinary URLs', () => {
    const parsed = parseMediaPath(
      't_yallery_preview_image_v2/v1699999999/octoai/abc.jpg',
    );
    expect(parsed?.transformationName).toBe('t_yallery_preview_image_v2');
    expect(parsed?.key).toBe('octoai/abc.jpg');
  });

  it('flags legacy so_0 poster segments', () => {
    const parsed = parseMediaPath('so_0/octoai_videos/xyz.jpg');
    expect(parsed?.posterOfVideo).toBe(true);
    expect(parsed?.transformationName).toBeNull();
    expect(parsed?.key).toBe('octoai_videos/xyz.jpg');
  });

  it('accepts a named transformation inserted before a poster segment', () => {
    const parsed = parseMediaPath(
      't_yallery_video_720_v2/so_0/octoai_videos/xyz.jpg',
    );
    expect(parsed?.posterOfVideo).toBe(true);
    expect(parsed?.transformationName).toBe('t_yallery_video_720_v2');
    expect(parsed?.key).toBe('octoai_videos/xyz.jpg');
  });

  it('skips raw comma-separated transform chains', () => {
    const parsed = parseMediaPath('w_300,h_200,c_fill/octoai/abc.png');
    expect(parsed?.transformationName).toBeNull();
    expect(parsed?.key).toBe('octoai/abc.png');
  });

  it('rejects unknown named transformations', () => {
    expect(parseMediaPath('t_unknown/octoai/abc.png')).toBeNull();
  });

  it('rejects path traversal and unsafe keys', () => {
    expect(parseMediaPath('../secrets')).toBeNull();
    expect(parseMediaPath('octoai/../../etc/passwd')).toBeNull();
    expect(parseMediaPath('')).toBeNull();
    expect(parseMediaPath('octoai/a b.png')).toBeNull();
  });

  it('keeps nested folders inside the key', () => {
    const parsed = parseMediaPath(
      't_yallery_feed_image_v2/folder/sub_folder/asset-1.webp',
    );
    expect(parsed?.key).toBe('folder/sub_folder/asset-1.webp');
  });
});

describe('registry', () => {
  it('contains every transformation the mobile app uses', () => {
    expect(Object.keys(MEDIA_TRANSFORMATIONS).sort()).toEqual(
      [
        't_yallery_download_watermarked_v1',
        't_yallery_feed_image_v2',
        't_yallery_preview_image_v2',
        't_yallery_thumb_image_v2',
        't_yallery_video_720_v2',
        't_yallery_video_download_v1',
        't_yallery_video_preview_v2',
      ].sort(),
    );
  });

  it('marks download variants as attachments', () => {
    expect(
      MEDIA_TRANSFORMATIONS.t_yallery_download_watermarked_v1.attachment,
    ).toBe(true);
    expect(MEDIA_TRANSFORMATIONS.t_yallery_video_download_v1.attachment).toBe(
      true,
    );
  });

  it('derives cache keys under t/', () => {
    expect(derivedObjectKey('t_yallery_thumb_image_v2', 'octoai/a.png')).toBe(
      't/t_yallery_thumb_image_v2/octoai/a.png',
    );
    expect(posterObjectKey('octoai_videos/x.jpg')).toBe(
      't/poster/octoai_videos/x.jpg',
    );
  });
});
