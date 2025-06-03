import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateColorEntity1720537200137 implements MigrationInterface {
  name = 'CreateColorEntity1720537200137';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`colors\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`colors\``);
  }
}
