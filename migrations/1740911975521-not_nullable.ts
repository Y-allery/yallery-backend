import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotNullable1740911975521 implements MigrationInterface {
  name = 'NotNullable1740911975521';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`contests\` CHANGE \`fineTuneToken\` \`fineTuneToken\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`contests\` CHANGE \`fineTuneToken\` \`fineTuneToken\` varchar(255) NOT NULL`,
    );
  }
}
