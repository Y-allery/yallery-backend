import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePartnerUserLinks1759829900000 implements MigrationInterface {
  name = 'CreatePartnerUserLinks1759829900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`partner_user_links\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`partnershipId\` int NOT NULL,
        \`partnerUserId\` varchar(255) NOT NULL,
        \`userId\` int NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_partner_link\` (\`partnershipId\`, \`partnerUserId\`)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `partner_user_links`');
  }
}


