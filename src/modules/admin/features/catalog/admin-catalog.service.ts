import { Injectable } from '@nestjs/common';
import { CreateStyleDto } from 'src/modules/posts/dto/create.style.dto';
import { UpdateStyleDto } from 'src/modules/posts/dto/update.style.dto';
import { PostStyleService } from 'src/modules/posts/services/post-style.service';
import { CreateTagDto } from 'src/modules/catalog/tags/dto/create.tag.dto';
import { UpdateTagDto } from 'src/modules/catalog/tags/dto/update.tag.dto';
import { TagService } from 'src/modules/catalog/tags/tag.service';

@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly tagService: TagService,
    private readonly postStyleService: PostStyleService,
  ) {}

  async getAllTags() {
    return this.tagService.findAll();
  }

  async createTag(data: CreateTagDto) {
    return this.tagService.create(data);
  }

  async updateTag(id: number, updateTagDto: UpdateTagDto) {
    return this.tagService.update(id, updateTagDto);
  }

  async deleteTag(id: number) {
    return this.tagService.delete(id);
  }

  async createStyle(dto: CreateStyleDto) {
    return this.postStyleService.createStyle(dto);
  }

  async findAllStyles() {
    return this.postStyleService.findAllStyles();
  }

  async findStyleById(id: number) {
    return this.postStyleService.findStyleById(id);
  }

  async updateStyle(id: number, dto: UpdateStyleDto) {
    return this.postStyleService.updateStyle(id, dto);
  }

  async deleteStyle(id: number) {
    return this.postStyleService.deleteStyle(id);
  }
}
