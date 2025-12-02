import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixReportsCascadeDeleteFinal1761440482379 implements MigrationInterface {
  name = 'FixReportsCascadeDeleteFinal1761440482379';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reports" DROP CONSTRAINT "FK_6bebfa3fc68a35f5af3f9883c4e"
    `);

    await queryRunner.query(`
      ALTER TABLE "reports" ADD CONSTRAINT "FK_6bebfa3fc68a35f5af3f9883c4e" 
      FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reports" DROP CONSTRAINT "FK_6bebfa3fc68a35f5af3f9883c4e"
    `);

    await queryRunner.query(`
      ALTER TABLE "reports" ADD CONSTRAINT "FK_6bebfa3fc68a35f5af3f9883c4e" 
      FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }
}