import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVideoUrlToPosts1751107853936 implements MigrationInterface {
  name = 'AddVideoUrlToPosts1751107853936';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`posts\` ADD \`videoUrl\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`posts\` DROP COLUMN \`videoUrl\``);
  }
}
