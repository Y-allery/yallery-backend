import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeleteUnqiuedIdx1723043039152 implements MigrationInterface {
  name = 'DeleteUnqiuedIdx1723043039152';

  public async up(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(
        `ALTER TABLE posts DROP FOREIGN KEY \`FK_2ba375b245d0e7a5f48688b9042\``,
      );
      await queryRunner.query(
        `ALTER TABLE posts DROP FOREIGN KEY \`FK_ae05faaa55c866130abef6e1fee\``,
      );

      await queryRunner.query(
        `ALTER TABLE posts DROP INDEX \`IDX_166964043f0db170e79406fa28\``,
      );
    } catch (e) {
      console.log(true);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`IDX_166964043f0db170e79406fa28\` ON \`posts\` (\`userId\`, \`contestId\`)`,
    );

    await queryRunner.query(
      `ALTER TABLE posts ADD CONSTRAINT \`FK_2ba375b245d0e7a5f48688b9042\` FOREIGN KEY (\`contestId\`) REFERENCES \`contests\` (\`id\`) ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE posts ADD CONSTRAINT \`FK_ae05faaa55c866130abef6e1fee\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`)`,
    );
  }
}
