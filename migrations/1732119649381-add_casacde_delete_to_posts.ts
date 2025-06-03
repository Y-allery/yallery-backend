import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCasacdeDeleteToPosts1732119649381
  implements MigrationInterface
{
  name = 'AddCasacdeDeleteToPosts1732119649381';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`viewed_posts\` DROP FOREIGN KEY \`FK_520606ef9e0414e7a540b689d8c\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`viewed_posts\` ADD CONSTRAINT \`FK_520606ef9e0414e7a540b689d8c\` FOREIGN KEY (\`postId\`) REFERENCES \`posts\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
