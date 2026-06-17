import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateStyleDto } from '../dto/create.style.dto';
import { UpdateStyleDto } from '../dto/update.style.dto';
import { StyleEntity } from '../entities/style.entity';

@Injectable()
export class PostStyleService {
  constructor(
    @InjectRepository(StyleEntity)
    private readonly styleRepository: Repository<StyleEntity>,
  ) {}

  async createStyle(dto: CreateStyleDto): Promise<StyleEntity> {
    const newStyle = this.styleRepository.create(dto);
    return this.styleRepository.save(newStyle);
  }

  async findAllStyles(): Promise<StyleEntity[]> {
    return this.styleRepository.find();
  }

  async findStyleById(id: number): Promise<StyleEntity> {
    return this.styleRepository.findOne({ where: { id } });
  }

  async updateStyle(id: number, dto: UpdateStyleDto): Promise<StyleEntity> {
    const style = await this.styleRepository.preload({
      id,
      ...dto,
    });
    if (!style) throw new NotFoundException(`Style with ID ${id} not found`);
    return this.styleRepository.save(style);
  }

  async deleteStyle(id: number): Promise<void> {
    const result = await this.styleRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Style with ID ${id} not found`);
    }
  }
}
