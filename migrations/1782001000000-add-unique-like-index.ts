import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueLikeIndex1782001000000 implements MigrationInterface {
  name = 'AddUniqueLikeIndex1782001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The createLike race could persist duplicate (userId, postId) like rows.
    // Remove them — keeping the lowest id per pair — so the UNIQUE index can be
    // created. NOTE: historical double-spent/earned points are NOT reconciled
    // here; that requires a separate data-repair script and is out of scope.
    await queryRunner.query(`
      DELETE l1 FROM \`likes\` l1
      INNER JOIN \`likes\` l2
        ON l1.\`userId\` = l2.\`userId\`
       AND l1.\`postId\` = l2.\`postId\`
       AND l1.\`id\` > l2.\`id\`
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX \`IDX_likes_user_post\`
      ON \`likes\` (\`userId\`, \`postId\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX `IDX_likes_user_post` ON `likes`',
    );
  }
}
