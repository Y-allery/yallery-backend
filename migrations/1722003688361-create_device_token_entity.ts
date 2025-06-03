import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDeviceTokenEntity1722003688361
  implements MigrationInterface
{
  name = 'CreateDeviceTokenEntity1722003688361';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`user_device_tokens\` (\`id\` int NOT NULL AUTO_INCREMENT, \`token\` varchar(255) NOT NULL, \`deviceType\` enum ('iOS', 'Android', 'Web') NOT NULL, \`userId\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_device_tokens\` ADD CONSTRAINT \`FK_a11372c2ee3197be5691d0d8ed0\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user_device_tokens\` DROP FOREIGN KEY \`FK_a11372c2ee3197be5691d0d8ed0\``,
    );
    await queryRunner.query(`DROP TABLE \`user_device_tokens\``);
  }
}
