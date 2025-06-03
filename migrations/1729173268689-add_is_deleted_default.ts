import { MigrationInterface, QueryRunner } from 'typeorm';

export class SetIsDeletedDefaultFalseForUsers1729173268689
  implements MigrationInterface
{
  name = 'SetIsDeletedDefaultFalseForUsers1729173268689';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` MODIFY \`is_deleted\` tinyint NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` MODIFY \`is_deleted\` tinyint NOT NULL`,
    );
  }
}
