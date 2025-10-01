import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCascadeDelete1759350281130 implements MigrationInterface {
    name = 'AddCascadeDelete1759350281130'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Clean up orphaned records first
        await queryRunner.query(`
            DELETE vp FROM viewed_posts vp 
            LEFT JOIN posts p ON vp.postId = p.id 
            WHERE p.id IS NULL
        `);
        
        await queryRunner.query(`
            DELETE vp FROM viewed_posts vp 
            LEFT JOIN users u ON vp.userId = u.id 
            WHERE u.id IS NULL
        `);
        
        // Check and drop existing foreign key constraints if they exist
        const constraints = await queryRunner.query(`
            SELECT CONSTRAINT_NAME 
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'viewed_posts' 
            AND CONSTRAINT_NAME IN ('FK_a0e468af438154afdd372fd2bcb', 'FK_520606ef9e0414e7a540b689d8c')
        `);
        
        for (const constraint of constraints) {
            await queryRunner.query(`ALTER TABLE \`viewed_posts\` DROP FOREIGN KEY \`${constraint.CONSTRAINT_NAME}\``);
        }
        
        // Add new foreign key constraints with CASCADE
        await queryRunner.query(`ALTER TABLE \`viewed_posts\` ADD CONSTRAINT \`FK_a0e468af438154afdd372fd2bcb\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`viewed_posts\` ADD CONSTRAINT \`FK_520606ef9e0414e7a540b689d8c\` FOREIGN KEY (\`postId\`) REFERENCES \`posts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop CASCADE foreign key constraints
        await queryRunner.query(`ALTER TABLE \`viewed_posts\` DROP FOREIGN KEY \`FK_520606ef9e0414e7a540b689d8c\``);
        await queryRunner.query(`ALTER TABLE \`viewed_posts\` DROP FOREIGN KEY \`FK_a0e468af438154afdd372fd2bcb\``);
        
        // Restore original foreign key constraints without CASCADE
        await queryRunner.query(`ALTER TABLE \`viewed_posts\` ADD CONSTRAINT \`FK_a0e468af438154afdd372fd2bcb\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`viewed_posts\` ADD CONSTRAINT \`FK_520606ef9e0414e7a540b689d8c\` FOREIGN KEY (\`postId\`) REFERENCES \`posts\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
