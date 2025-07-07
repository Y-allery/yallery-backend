import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNullableUrl1751926307527 implements MigrationInterface {
  name = 'AddNullableUrl1751926307527';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`posts\` CHANGE \`imageUrl\` \`imageUrl\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`posts\` CHANGE \`imageUrl\` \`imageUrl\` varchar(255) NOT NULL`,
    );
  }
}
