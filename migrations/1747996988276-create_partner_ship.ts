import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePartnerShip1747996988276 implements MigrationInterface {
  name = 'CreatePartnerShip1747996988276';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner
      .query(
        `CREATE TABLE \`partnerships\` (\`id\` int NOT NULL AUTO_INCREMENT, \`partnerName\` varchar(255) NOT NULL, \`companyName\` varchar(255) NOT NULL, \`source\` enum ('mini app', 'regular app') NOT NULL, \`referralLink\` varchar(255) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
      )
      .catch((e) => console.log(e));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`partnerships\``);
  }
}
