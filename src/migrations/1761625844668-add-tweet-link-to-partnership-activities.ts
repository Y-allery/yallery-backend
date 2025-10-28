import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTweetLinkToPartnershipActivities1761625844668 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE \`partnership_activities\` 
            ADD COLUMN \`tweetLink\` varchar(500) NULL AFTER \`activity\`
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE \`partnership_activities\` 
            DROP COLUMN \`tweetLink\`
        `);
    }

}
