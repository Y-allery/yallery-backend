import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefferalField1748245709328 implements MigrationInterface {
  name = 'AddRefferalField1748245709328';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner
      .query(
        `CREATE TABLE \`partnership_activities\` (\`id\` int NOT NULL AUTO_INCREMENT, \`userId\` int NOT NULL, \`activity\` varchar(255) NOT NULL, \`partnershipId\` int NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
      )
      .catch((e) => console.log(e));
    await queryRunner
      .query(
        `ALTER TABLE \`partnerships\` ADD \`referralToken\` varchar(255) NOT NULL`,
      )
      .catch((e) => console.log(e));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`partnerships\` DROP COLUMN \`referralToken\``,
    );
    await queryRunner.query(`DROP TABLE \`partnership_activities\``);
  }
}
