import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserTable1719397284185 implements MigrationInterface {
  name = 'CreateUserTable1719397284185';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`users\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`nickname\` varchar(255) NOT NULL, \`email\` varchar(255) NOT NULL, \`password\` varchar(255) NULL, \`location\` json NULL, \`phone_number\` varchar(255) NULL, \`refreshToken\` varchar(255) NULL, \`resetToken\` varchar(255) NULL, \`resetTokenExpiration\` timestamp NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`users\``);
  }
}
