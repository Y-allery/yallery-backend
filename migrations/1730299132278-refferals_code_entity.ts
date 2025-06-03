import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefferalsCodeEntity1730299132278 implements MigrationInterface {
  name = 'RefferalsCodeEntity1730299132278';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`referrals\` (\`id\` int NOT NULL AUTO_INCREMENT, \`code\` varchar(255) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`isActive\` tinyint NOT NULL DEFAULT 1, \`userId\` int NULL, \`usedById\` int NULL, UNIQUE INDEX \`IDX_a53a83849f95cbcf3fbcf32fd0\` (\`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_a53a83849f95cbcf3fbcf32fd0\` ON \`referrals\``,
    );
    await queryRunner.query(`DROP TABLE \`referrals\``);
  }
}
