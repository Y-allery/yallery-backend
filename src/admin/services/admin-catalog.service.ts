import { Injectable } from '@nestjs/common';
import { CreateStyleDto } from 'src/post/dto/create.style.dto';
import { PostService } from 'src/post/post.service';
import { CreateTagDto } from 'src/tag/dto/create.tag.dto';
import { UpdateTagDto } from 'src/tag/dto/update.tag.dto';
import { TagService } from 'src/tag/tag.service';

@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly tagService: TagService,
    private readonly postService: PostService,
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
    return this.postService.createStyle(dto);
  }

  async findAllStyles() {
    return this.postService.findAllStyles();
  }

  async findStyleById(id: number) {
    return this.postService.findStyleById(id);
  }

  async updateStyle(id: number, dto: CreateStyleDto) {
    return this.postService.updateStyle(id, dto);
  }

  async deleteStyle(id: number) {
    return this.postService.deleteStyle(id);
  }
}
