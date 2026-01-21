import { MigrationInterface, QueryRunner } from 'typeorm';

export class StandardizeRewardsIsactiveToCamelcase1769000000000
  implements MigrationInterface
{
  name = 'StandardizeRewardsIsactiveToCamelcase1769000000000';

  private async columnExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<boolean> {
    const result = await queryRunner.query(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = '${tableName}'
      AND COLUMN_NAME = '${columnName}'
    `);
    return Number(result?.[0]?.count ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasSnake = await this.columnExists(queryRunner, 'rewards', 'is_active');
    const hasCamel = await this.columnExists(queryRunner, 'rewards', 'isActive');

    // If legacy snake_case exists and camelCase doesn't, rename to camelCase
    if (hasSnake && !hasCamel) {
      await queryRunner.query(`
        ALTER TABLE \`rewards\`
        CHANGE COLUMN \`is_active\` \`isActive\` tinyint NOT NULL DEFAULT '1'
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasSnake = await this.columnExists(queryRunner, 'rewards', 'is_active');
    const hasCamel = await this.columnExists(queryRunner, 'rewards', 'isActive');

    // Revert: if camelCase exists and snake_case doesn't, rename back
    if (!hasSnake && hasCamel) {
      await queryRunner.query(`
        ALTER TABLE \`rewards\`
        CHANGE COLUMN \`isActive\` \`is_active\` tinyint NOT NULL DEFAULT '1'
      `);
    }
  }
}


