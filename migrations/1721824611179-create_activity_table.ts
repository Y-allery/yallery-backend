import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAndModifyActivityTable1624919366680
  implements MigrationInterface
{
  name = 'CreateAndModifyActivityTable1624919366680';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Перевіряємо чи існує таблиця перед створенням
    const tableExists = await queryRunner.hasTable('activity');

    if (!tableExists) {
      await queryRunner.query(
        `CREATE TABLE \`activity\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`activityType\` enum ('LIKE_EARN', 'LIKE_SPEND', 'IMAGE_GENERATE_SPEND', 'CONTEST_CLOSE', 'CONTEST_WIN', 'DAILY_REWARD', 'SHARE_REWARD', 'ADMIN_REPORT', 'ADMIN_CONTEST_REVIEW', 'ADMIN_REPORT_REVIEW', 'ADMIN_CONTEST_WON') NOT NULL DEFAULT 'LIKE_EARN',
          \`description\` varchar(255) NOT NULL,
          \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`from_user_id\` int NULL,
          \`to_user_id\` int NULL,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB`,
      );

      await queryRunner.query(
        `ALTER TABLE \`activity\` ADD CONSTRAINT \`FK_86544031c5cb89dea77b32cede1\` FOREIGN KEY (\`from_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
      await queryRunner.query(
        `ALTER TABLE \`activity\` ADD CONSTRAINT \`FK_e67eeb490f1a183c27d92d06dfe\` FOREIGN KEY (\`to_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
    } else {
      console.log('Table "activity" already exists. Skipping creation.');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`activity\` DROP FOREIGN KEY \`FK_e67eeb490f1a183c27d92d06dfe\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`activity\` DROP FOREIGN KEY \`FK_86544031c5cb89dea77b32cede1\``,
    );
    await queryRunner.query(`DROP TABLE \`activity\``);
  }
}
