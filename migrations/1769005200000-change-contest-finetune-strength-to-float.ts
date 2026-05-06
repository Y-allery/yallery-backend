import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeContestFinetuneStrengthToFloat1769005200000
  implements MigrationInterface
{
  name = 'ChangeContestFinetuneStrengthToFloat1769005200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `contests` MODIFY `fineTuneStrength` float NULL DEFAULT 1',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `contests` MODIFY `fineTuneStrength` int NULL DEFAULT 1',
    );
  }
}
