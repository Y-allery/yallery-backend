import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AIFinetuneEntity } from '../../entities/ai-finetune.entity';

@Injectable()
export class LoraKeyService {
  constructor(
    @InjectRepository(AIFinetuneEntity)
    private readonly aiFinetuneRepository: Repository<AIFinetuneEntity>,
  ) {}

  normalize(value: string, maxLength = 100) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, maxLength)
      .replace(/_+$/g, '');
  }

  async generateUnique(baseInput: string) {
    const base = this.normalize(baseInput, 72) || 'lora';

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const suffix = uuidv4().replace(/-/g, '').slice(0, 8);
      const candidate = this.normalize(`${base}_${suffix}`, 100);
      const count = await this.aiFinetuneRepository.count({
        where: { loraKey: candidate },
      });
      if (count === 0) {
        return candidate;
      }
    }

    throw new BadRequestException('Failed to generate unique LoRA key');
  }
}
