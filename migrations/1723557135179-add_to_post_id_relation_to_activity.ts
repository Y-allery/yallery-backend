import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddToPostIdRelationToActivity1723557135179
  implements MigrationInterface
{
  name = 'AddToPostIdRelationToActivity1723557135179';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`activity\` ADD \`post_id\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`activity\` ADD CONSTRAINT \`FK_624114671c34d2515ec04c2c88c\` FOREIGN KEY (\`post_id\`) REFERENCES \`posts\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`activity\` DROP COLUMN \`post_id\``);
  }
}
