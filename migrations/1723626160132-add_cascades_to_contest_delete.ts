import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCascadesToContestDelete1723626160132
  implements MigrationInterface
{
  name = 'AddCascadesToContestDelete1723626160132';

  public async up(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(
        `ALTER TABLE \`activity\` DROP FOREIGN KEY \`FK_e592673989138da18babffdef7e\``,
      );
      await queryRunner.query(
        `ALTER TABLE \`activity\` ADD CONSTRAINT \`FK_e592673989138da18babffdef7e\` FOREIGN KEY (\`contest_id\`) REFERENCES \`contests\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
      );
    } catch (e) {
      console.log(e);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`activity\` DROP FOREIGN KEY \`FK_e592673989138da18babffdef7e\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`activity\` ADD CONSTRAINT \`FK_e592673989138da18babffdef7e\` FOREIGN KEY (\`contest_id\`) REFERENCES \`contests\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
