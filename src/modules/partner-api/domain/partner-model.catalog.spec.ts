import {
  PARTNER_MODELS,
  describePartnerModel,
  findPartnerModel,
  partnerModelsFor,
} from './partner-model.catalog';

describe('partner model catalog', () => {
  it('never publishes the backend or our cost', () => {
    for (const model of PARTNER_MODELS) {
      const published = describePartnerModel(model);
      expect(published).not.toHaveProperty('backend');
      expect(published).not.toHaveProperty('costUsd');
      expect(published).not.toHaveProperty('target');
      expect(JSON.stringify(published)).not.toContain(model.target);
    }
  });

  it('sells every model above what it costs us', () => {
    for (const model of PARTNER_MODELS) {
      expect(model.priceUsd).toBeGreaterThan(model.costUsd);
    }
  });

  it('keeps every id free of vendor names', () => {
    const vendors = /pruna|wan|qwen|krea|flux|sdxl|ltx|z-image|kling|bytedance/i;
    for (const model of PARTNER_MODELS) {
      expect(model.id).not.toMatch(vendors);
      expect(model.description).not.toMatch(vendors);
    }
  });

  // We advertised "720p with audio" on two video models for a day. The output has no
  // audio track at all — verified with ffprobe against a real generation — and a promised
  // feature that does not exist is the kind of thing an integrator builds on.
  it('claims no audio, because no video model here produces any', () => {
    for (const model of PARTNER_MODELS) {
      expect(model.description).not.toMatch(/\baudio\b/i);
    }
  });

  it('gives every model at least one size, with the default first', () => {
    for (const model of PARTNER_MODELS) {
      expect(model.sizes.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate ids', () => {
    const ids = PARTNER_MODELS.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('offers all three capabilities', () => {
    expect(partnerModelsFor('text_to_image').length).toBeGreaterThan(0);
    expect(partnerModelsFor('image_to_image').length).toBeGreaterThan(0);
    expect(partnerModelsFor('image_to_video').length).toBeGreaterThan(0);
  });

  it('resolves ids exactly, ignoring surrounding whitespace', () => {
    expect(findPartnerModel(' yengine-photo ')?.id).toBe('yengine-photo');
    expect(findPartnerModel('yengine-photo-nope')).toBeNull();
    expect(findPartnerModel('')).toBeNull();
  });
});
