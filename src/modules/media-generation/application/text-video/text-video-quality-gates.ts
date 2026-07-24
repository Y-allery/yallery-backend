import { Injectable } from '@nestjs/common';
import {
  TextVideoQcResult,
  TextVideoStillQcInput,
  TextVideoStillQcPort,
  TextVideoVideoQcInput,
  TextVideoVideoQcPort,
} from './text-video-pipeline.ports';

export class TextVideoQcNotConfiguredError extends Error {
  readonly reasonCode = 'LTX_CASCADE_QC_NOT_CONFIGURED' as const;

  constructor() {
    super('LTX_CASCADE_QC_NOT_CONFIGURED');
    this.name = 'TextVideoQcNotConfiguredError';
  }

  toJSON(): { reasonCode: 'LTX_CASCADE_QC_NOT_CONFIGURED' } {
    return { reasonCode: this.reasonCode };
  }
}

@Injectable()
export class DisabledTextVideoStillQc implements TextVideoStillQcPort {
  isConfigured(): boolean {
    return false;
  }

  evaluate(
    _input: Readonly<TextVideoStillQcInput>,
  ): Promise<TextVideoQcResult> {
    return Promise.reject(new TextVideoQcNotConfiguredError());
  }
}

@Injectable()
export class DisabledTextVideoVideoQc implements TextVideoVideoQcPort {
  isConfigured(): boolean {
    return false;
  }

  evaluate(
    _input: Readonly<TextVideoVideoQcInput>,
  ): Promise<TextVideoQcResult> {
    return Promise.reject(new TextVideoQcNotConfiguredError());
  }
}
