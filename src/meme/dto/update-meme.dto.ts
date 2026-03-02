import { PartialType } from '@nestjs/swagger';
import { CreateMemeDto } from './create-meme.dto';

export class UpdateMemeDto extends PartialType(CreateMemeDto) {}
