import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';
import { AudioGenerationController } from './audio-generation.controller';
import { AudioGenerationService } from './audio-generation.service';

@Module({
  imports: [TypeOrmModule.forFeature([AISettingsEntity])],
  controllers: [AudioGenerationController],
  providers: [AudioGenerationService],
  exports: [AudioGenerationService],
})
export class AudioGenerationModule {}

