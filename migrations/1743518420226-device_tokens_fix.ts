import { MigrationInterface, QueryRunner, TableForeignKey } from 'typeorm';

export class DeviceTokensFix1743518420226 implements MigrationInterface {
  name = 'DeviceTokensFix1743518420226';

  public async up(queryRunner: QueryRunner): Promise<void> {}

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
