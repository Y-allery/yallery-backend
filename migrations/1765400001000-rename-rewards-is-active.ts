import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameRewardsIsActive1765400001000 implements MigrationInterface {
  name = 'RenameRewardsIsActive1765400001000';

  // Helper function to check if column exists
  private async columnExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<boolean> {
    try {
      const result = await queryRunner.query(`
        SELECT COUNT(*) as count
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = '${tableName}'
        AND COLUMN_NAME = '${columnName}'
      `);
      return result[0].count > 0;
    } catch (error) {
      return false;
    }
  }

  // Helper function to safely rename column
  private async renameColumnIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    oldColumnName: string,
    newColumnName: string,
    columnDefinition: string,
  ): Promise<void> {
    const oldExists = await this.columnExists(queryRunner, tableName, oldColumnName);
    const newExists = await this.columnExists(queryRunner, tableName, newColumnName);

    if (oldExists && !newExists) {
      await queryRunner.query(`
        ALTER TABLE \`${tableName}\` 
        CHANGE COLUMN \`${oldColumnName}\` \`${newColumnName}\` ${columnDefinition}
      `);
      console.log(`Renamed column ${oldColumnName} to ${newColumnName} in ${tableName}`);
    } else if (newExists) {
      console.log(`Column ${newColumnName} already exists in ${tableName}, skipping rename`);
    } else {
      console.log(`Column ${oldColumnName} does not exist in ${tableName}, skipping rename`);
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.renameColumnIfExists(
      queryRunner,
      'rewards',
      'is_active',
      'isActive',
      'tinyint NOT NULL DEFAULT \'1\'',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.renameColumnIfExists(
      queryRunner,
      'rewards',
      'isActive',
      'is_active',
      'tinyint NOT NULL DEFAULT \'1\'',
    );
  }
}

