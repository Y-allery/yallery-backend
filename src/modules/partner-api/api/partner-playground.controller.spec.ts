import { PartnerPlaygroundController } from './partner-playground.controller';
import { PARTNER_MODELS } from '../domain/partner-model.catalog';

describe('PartnerPlaygroundController', () => {
  const html = new PartnerPlaygroundController().playground();

  it('ships the catalog with the page so the form is usable before a key is pasted', () => {
    for (const model of PARTNER_MODELS) {
      expect(html).toContain(model.id);
    }
  });

  // A grid track defaults to its content's min-width, so the long curl line grew the
  // column — and the result image with it — on every keystroke.
  it('pins the result column so typing cannot resize it', () => {
    expect(html).toContain('minmax(0, 1fr)');
  });

  // The page runs in the partner's browser: anything embedded here is published.
  it('carries no backend or cost into the browser', () => {
    for (const model of PARTNER_MODELS) {
      expect(html).not.toContain(model.target);
      expect(html).not.toContain(`"costUsd"`);
      expect(html).not.toContain(`"backend"`);
    }
  });
});
