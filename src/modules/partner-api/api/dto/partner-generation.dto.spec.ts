import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  IsPublicImageUrl,
  PartnerImageEditDto,
  PartnerImageGenerationDto,
  PartnerVideoGenerationDto,
} from './partner-generation.dto';

const errorsFor = (dto: object, payload: Record<string, unknown>) =>
  validateSync(plainToInstance(dto as never, payload)).map(
    (error) => error.property,
  );

describe('partner generation DTOs', () => {
  describe('reference image URLs', () => {
    const validator = new IsPublicImageUrl();

    it.each([
      'https://cdn.example.com/a.jpg',
      'http://images.example.com/b.png?x=1',
    ])('accepts %s', (url) => {
      expect(validator.validate(url)).toBe(true);
    });

    // A partner-supplied URL is fetched by us or by the upstream, so an internal
    // address here is a request-forgery primitive, not a bad input.
    it.each([
      'http://localhost/a.png',
      'http://127.0.0.1/a.png',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5/a.png',
      'http://192.168.1.1/a.png',
      'http://172.16.0.9/a.png',
      'http://[::1]/a.png',
      'http://redis.internal/a.png',
      'file:///etc/passwd',
      'gopher://example.com/',
      'not-a-url',
    ])('rejects %s', (url) => {
      expect(validator.validate(url)).toBe(false);
    });

    it('checks every entry of a list, not just the first', () => {
      expect(
        validator.validate([
          'https://cdn.example.com/a.jpg',
          'http://127.0.0.1/b.png',
        ]),
      ).toBe(false);
    });
  });

  it('accepts a single image string where a list is expected', () => {
    const dto = plainToInstance(PartnerImageEditDto, {
      model: 'yengine-edit',
      prompt: 'make it snow',
      images: 'https://cdn.example.com/a.jpg',
    });

    expect(dto.images).toEqual(['https://cdn.example.com/a.jpg']);
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('requires model and prompt on a video request', () => {
    expect(errorsFor(PartnerVideoGenerationDto, {})).toEqual(
      expect.arrayContaining(['model', 'prompt']),
    );
  });

  // Text-to-video draws its own opening frame, so the field cannot be mandatory here —
  // which model needs it is decided in the service, against the catalog.
  it('leaves the image optional and still validates it when present', () => {
    expect(
      errorsFor(PartnerVideoGenerationDto, {
        model: 'yengine-video-text',
        prompt: 'a kite over a beach',
      }),
    ).toEqual([]);

    expect(
      errorsFor(PartnerVideoGenerationDto, {
        model: 'yengine-video',
        prompt: 'x',
        image: 'http://127.0.0.1/a.png',
      }),
    ).toContain('image');
  });

  describe('callback_url', () => {
    const withCallback = (callback_url: unknown) =>
      errorsFor(PartnerImageGenerationDto, {
        model: 'yengine-photo',
        prompt: 'a cat',
        callback_url,
      });

    it('is optional', () => {
      expect(
        errorsFor(PartnerImageGenerationDto, {
          model: 'yengine-photo',
          prompt: 'a cat',
        }),
      ).toEqual([]);
    });

    it('accepts a public endpoint', () => {
      expect(withCallback('https://partner.example/hooks/yallery')).toEqual([]);
    });

    // We POST to this address ourselves, so it is the same forgery primitive as an
    // inbound image URL — pointed at our own network from the other direction.
    it.each([
      'http://localhost:3000/hook',
      'http://169.254.169.254/latest',
      'ftp://partner.example/hook',
      'nonsense',
    ])('rejects %s', (url) => {
      expect(withCallback(url)).toContain('callback_url');
    });
  });

  it('rejects more than three reference images', () => {
    expect(
      errorsFor(PartnerImageEditDto, {
        model: 'yengine-edit',
        prompt: 'x',
        images: [
          'https://a/1.png',
          'https://a/2.png',
          'https://a/3.png',
          'https://a/4.png',
        ],
      }),
    ).toContain('images');
  });
});
