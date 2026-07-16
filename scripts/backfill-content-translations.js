/**
 * One-off backfill: enqueue a content-translation job for every existing
 * admin-managed entity so historical contests/tags/styles/memes/rewards get
 * translated into all app locales. Run on the droplet AFTER the translations
 * deploy (the worker in the app processes the queue):
 *   node scripts/backfill-content-translations.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const env = {};
fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
  .split('\n')
  .forEach((line) => {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });

const mysql = require(path.join(ROOT, 'node_modules/mysql2/promise'));
const { Queue } = require(path.join(ROOT, 'node_modules/bullmq'));

const SOURCES = [
  ['contest', 'contests'],
  ['tag', 'tags'],
  ['style', 'styles'],
  ['meme', 'memes'],
  ['reward', 'rewards'],
  ['color', 'colors'],
];

(async () => {
  const conn = await mysql.createConnection({
    host: env.DATABASE_HOST,
    port: +env.DATABASE_PORT,
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    database: env.DATABASE_NAME,
    ssl: { rejectUnauthorized: false },
  });
  const queue = new Queue('content-translation', {
    connection: {
      host: env.REDIS_HOST,
      port: +env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
    },
  });

  let total = 0;
  for (const [entityType, table] of SOURCES) {
    const [rows] = await conn.query(`SELECT id FROM \`${table}\``);
    for (const { id } of rows) {
      await queue.add(
        `${entityType}-${id}`,
        { entityType, entityId: id },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 10000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    }
    console.log(`${entityType}: enqueued ${rows.length}`);
    total += rows.length;
  }

  await conn.end();
  await queue.close();
  console.log(`DONE: ${total} translation jobs enqueued.`);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
