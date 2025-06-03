import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPostIdRelation1745582195798 implements MigrationInterface {
  name = 'AddPostIdRelation1745582195798';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`contests\` ADD \`postWinnerId\` int NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`contests\` DROP FOREIGN KEY \`FK_6e6e5f451eb21f7913a840e5528\``,
    );
  }
}
