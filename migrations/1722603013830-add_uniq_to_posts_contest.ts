import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqToPostsContest1722603013830 implements MigrationInterface {
  name = 'AddUniqToPostsContest1722603013830';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`IDX_166964043f0db170e79406fa28\` ON \`posts\` (\`userId\`, \`contestId\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_166964043f0db170e79406fa28\` ON \`posts\``,
    );
  }
}
