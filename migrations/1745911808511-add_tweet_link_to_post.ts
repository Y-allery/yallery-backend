import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTweetLinkToPost1745911808511 implements MigrationInterface {
  name = 'AddTweetLinkToPost1745911808511';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`posts\` ADD \`tweetLink\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`posts\` DROP COLUMN \`tweetLink\``);
  }
}
