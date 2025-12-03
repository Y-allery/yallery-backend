import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPreviewImageUrlToPosts1764700500000
  implements MigrationInterface
{
  name = 'AddPreviewImageUrlToPosts1764700500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `posts` ADD `previewImageUrl` varchar(255) NULL',
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_preview_image_url` ON `posts` (`previewImageUrl`)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX `IDX_preview_image_url` ON `posts`',
    );
    await queryRunner.query(
      'ALTER TABLE `posts` DROP COLUMN `previewImageUrl`',
    );
  }
}


