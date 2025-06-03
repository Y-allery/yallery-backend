import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPostEntityIndexes1735166954852 implements MigrationInterface {
  name = 'AddPostEntityIndexes1735166954852';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX \`IDX_6aff66070b52399639eeb3cc89\` ON \`posts\` (\`imageUrl\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_ae05faaa55c866130abef6e1fe\` ON \`posts\` (\`userId\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_122313e5405230bc430e38c12d\` ON \`posts\` (\`tagId\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_9940eadb862fdda6a6a64a13a3\` ON \`posts\` (\`is_published\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_e7a92e0b265b6521c8f77c2cf0\` ON \`posts\` (\`is_blocked\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_2ba375b245d0e7a5f48688b904\` ON \`posts\` (\`contestId\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_3ff3ff6ea134f3c785a32fb2fc\` ON \`posts\` (\`is_rejected\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_3ff3ff6ea134f3c785a32fb2fc\` ON \`posts\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_2ba375b245d0e7a5f48688b904\` ON \`posts\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_e7a92e0b265b6521c8f77c2cf0\` ON \`posts\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_9940eadb862fdda6a6a64a13a3\` ON \`posts\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_122313e5405230bc430e38c12d\` ON \`posts\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_ae05faaa55c866130abef6e1fe\` ON \`posts\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_6aff66070b52399639eeb3cc89\` ON \`posts\``,
    );
  }
}
