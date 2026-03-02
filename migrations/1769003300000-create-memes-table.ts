import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMemesTable1769003300000 implements MigrationInterface {
  name = 'CreateMemesTable1769003300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`memes\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`name\` varchar(255) NOT NULL,
        \`referenceVideoUrl\` varchar(1024) NULL,
        \`referenceImageUrl\` varchar(1024) NULL,
        \`isActive\` tinyint NOT NULL DEFAULT 1,
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_name\` (\`name\`),
        INDEX \`IDX_isActive\` (\`isActive\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`memes\``);
  }
}
