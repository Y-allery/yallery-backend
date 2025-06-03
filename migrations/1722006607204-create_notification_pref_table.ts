import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateNotificationPrefTable1722006607204 implements MigrationInterface {
    name = 'CreateNotificationPrefTable1722006607204'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`notification_preferences\` (\`id\` int NOT NULL AUTO_INCREMENT, \`activityType\` enum ('LIKE_EARN', 'LIKE_SPEND', 'IMAGE_GENERATE_SPEND', 'CONTEST_CLOSE', 'CONTEST_WIN', 'DAILY_REWARD', 'SHARE_REWARD') NOT NULL, \`enabled\` tinyint NOT NULL DEFAULT 1, \`userId\` int NULL, UNIQUE INDEX \`IDX_95bbd9bd237cdef751e39b1f6e\` (\`userId\`, \`activityType\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`notification_preferences\` ADD CONSTRAINT \`FK_b70c44e8b00757584a393225593\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`notification_preferences\` DROP FOREIGN KEY \`FK_b70c44e8b00757584a393225593\``);
        await queryRunner.query(`DROP INDEX \`IDX_95bbd9bd237cdef751e39b1f6e\` ON \`notification_preferences\``);
        await queryRunner.query(`DROP TABLE \`notification_preferences\``);
    }

}
