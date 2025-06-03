import { MigrationInterface, QueryRunner } from 'typeorm';

export class TwitterNickName1745400671079 implements MigrationInterface {
  name = 'TwitterNickName1745400671079';

  public async up(queryRunner: QueryRunner): Promise<void> {
    queryRunner.query(
      `ALTER TABLE \`users\` ADD \`twitterUsername\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`twitterUsername\``,
    );
  }
}
