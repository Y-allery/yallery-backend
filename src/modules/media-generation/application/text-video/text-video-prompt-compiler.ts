import { Injectable } from '@nestjs/common';
import {
  CompiledTextVideoPrompts,
  TextVideoPromptCompilerPort,
} from './text-video-pipeline.ports';

const MAX_PROMPT_UTF8_BYTES = 32 * 1024;

/**
 * Deliberately non-generative compiler. It never invents scene content:
 * both provider prompts are the exact trimmed user instruction.
 */
@Injectable()
export class VerbatimTextVideoPromptCompiler
  implements TextVideoPromptCompilerPort
{
  readonly version = 'verbatim-v1';

  isConfigured(): boolean {
    return true;
  }

  compile(prompt: string): CompiledTextVideoPrompts {
    const normalized = typeof prompt === 'string' ? prompt.trim() : '';
    if (
      !normalized ||
      Buffer.byteLength(normalized, 'utf8') > MAX_PROMPT_UTF8_BYTES
    ) {
      throw new TextVideoPromptCompilerError();
    }
    return {
      compilerVersion: this.version,
      stillPrompt: normalized,
      motionPrompt: normalized,
    };
  }
}

export class TextVideoPromptCompilerError extends Error {
  readonly reasonCode = 'LTX_CASCADE_PROMPT_INVALID' as const;

  constructor() {
    super('LTX_CASCADE_PROMPT_INVALID');
    this.name = 'TextVideoPromptCompilerError';
  }

  toJSON(): { reasonCode: 'LTX_CASCADE_PROMPT_INVALID' } {
    return { reasonCode: this.reasonCode };
  }
}
