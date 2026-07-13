/**
 * One-off migration: copy all Cloudinary originals into the DO Space and
 * rewrite res.cloudinary.com URLs across the MySQL database.
 *
 * Run on a droplet with the backend checked out (uses its node_modules + .env):
 *   node scripts/migrate-cloudinary-to-spaces.js                # dry-run (default): counts + samples, no writes
 *   node scripts/migrate-cloudinary-to-spaces.js --copy         # copy assets Cloudinary -> Spaces (idempotent, resumable)
 *   node scripts/migrate-cloudinary-to-spaces.js --rewrite-db   # rewrite DB URLs (verifies samples first, writes rollback JSONL)
 *   node scripts/migrate-cloudinary-to-spaces.js --rollback <file.jsonl>  # restore original column values
 *
 * Derived resources (t_* transformation caches) are intentionally NOT copied —
 * only originals. Transformation segments in stored URLs map to the original.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const env = {};
fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
  .split('\n')
  .forEach((line) => {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });

const cloudinary = require(path.join(ROOT, 'node_modules/cloudinary')).v2;
const { S3Client, PutObjectCommand, HeadObjectCommand } = require(path.join(
  ROOT,
  'node_modules/@aws-sdk/client-s3',
));
const mysql = require(path.join(ROOT, 'node_modules/mysql2/promise'));
// axios v1 ships as a CJS module whose callable instance lives on `.default`
// under this Node/require setup; unwrap it so axios.get/.head resolve.
const axiosLib = require(path.join(ROOT, 'node_modules/axios'));
const axios = axiosLib.default || axiosLib;

const CLOUD_NAME = env.CLOUDINARY_CLOUD_NAME;
const SPACES = {
  region: env.SPACES_REGION,
  bucket: env.SPACES_BUCKET,
  accessKey: env.SPACES_ACCESS_KEY,
  secretKey: env.SPACES_SECRET_KEY,
  cdnBaseUrl: (env.SPACES_CDN_BASE_URL || '').replace(/\/+$/, ''),
};
const CONCURRENCY = 8;

const MODE = process.argv.includes('--copy')
  ? 'copy'
  : process.argv.includes('--rewrite-db')
  ? 'rewrite-db'
  : process.argv.includes('--rollback')
  ? 'rollback'
  : 'dry-run';

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

function requireSpacesConfig() {
  if (!SPACES.region || !SPACES.bucket || !SPACES.accessKey || !SPACES.secretKey) {
    console.error('SPACES_REGION/BUCKET/ACCESS_KEY/SECRET_KEY missing in .env');
    process.exit(1);
  }
  if (!SPACES.cdnBaseUrl) {
    SPACES.cdnBaseUrl = `https://${SPACES.bucket}.${SPACES.region}.cdn.digitaloceanspaces.com`;
  }
}

function s3() {
  return new S3Client({
    region: 'us-east-1',
    endpoint: `https://${SPACES.region}.digitaloceanspaces.com`,
    credentials: { accessKeyId: SPACES.accessKey, secretAccessKey: SPACES.secretKey },
  });
}

const CONTENT_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', safetensors: 'application/octet-stream',
  zip: 'application/zip', json: 'application/json', txt: 'text/plain',
};

/** Spaces object key for a Cloudinary resource: `<public_id>.<format>` (raw already embeds its extension). */
function keyForResource(resource) {
  if (resource.resource_type === 'raw' || !resource.format) return resource.public_id;
  return `${resource.public_id}.${resource.format}`;
}

async function listAllResources() {
  const all = [];
  for (const resourceType of ['image', 'video', 'raw']) {
    let cursor;
    do {
      const page = await cloudinary.api.resources({
        resource_type: resourceType,
        type: 'upload',
        max_results: 500,
        next_cursor: cursor,
      });
      all.push(...page.resources);
      cursor = page.next_cursor;
      process.stdout.write(`\rListing ${resourceType}: ${all.length} total`);
    } while (cursor);
    console.log('');
  }
  return all;
}

async function copyAssets(dryRun) {
  const client = dryRun ? null : s3();
  const resources = await listAllResources();
  const totalBytes = resources.reduce((s, r) => s + (r.bytes || 0), 0);
  console.log(
    `Resources: ${resources.length}, ${(totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB`,
  );
  if (dryRun) {
    resources.slice(0, 5).forEach((r) =>
      console.log(`  sample: ${r.secure_url} -> ${SPACES.cdnBaseUrl || 'https://<cdn>'}/${keyForResource(r)}`),
    );
    return;
  }

  let done = 0, skipped = 0, failed = 0;
  const queue = [...resources];
  const failures = [];

  async function worker() {
    while (queue.length) {
      const resource = queue.shift();
      const key = keyForResource(resource);
      try {
        try {
          const head = await client.send(
            new HeadObjectCommand({ Bucket: SPACES.bucket, Key: key }),
          );
          if (Number(head.ContentLength) === Number(resource.bytes)) {
            skipped++;
            continue;
          }
        } catch (e) {
          if (e.$metadata?.httpStatusCode !== 404 && e.name !== 'NotFound') throw e;
        }
        const response = await axios.get(resource.secure_url, {
          responseType: 'arraybuffer',
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 300000,
        });
        const ext = (resource.format || key.split('.').pop() || '').toLowerCase();
        await client.send(
          new PutObjectCommand({
            Bucket: SPACES.bucket,
            Key: key,
            Body: Buffer.from(response.data),
            ContentType: CONTENT_TYPES[ext] || 'application/octet-stream',
            ACL: 'public-read',
            CacheControl: 'public, max-age=31536000, immutable',
          }),
        );
        done++;
      } catch (error) {
        failed++;
        failures.push({ key, url: resource.secure_url, error: error.message });
      }
      if ((done + skipped + failed) % 100 === 0) {
        console.log(`progress: ${done} copied, ${skipped} skipped, ${failed} failed, ${queue.length} left`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`DONE: ${done} copied, ${skipped} skipped (already present), ${failed} failed`);
  if (failures.length) {
    const failFile = path.join(__dirname, `migration-failures-${Date.now()}.json`);
    fs.writeFileSync(failFile, JSON.stringify(failures, null, 1));
    console.log(`Failures written to ${failFile} — re-run --copy to retry.`);
  }
}

/**
 * Rewrites any res.cloudinary.com URL to its Spaces equivalent. Strips the
 * version segment (v123/) and transformation segments — named (t_x/) or
 * comma-separated raw transforms — so every variant maps to the original key.
 */
function rewriteUrls(value) {
  const pattern = new RegExp(
    `https?://res\\.cloudinary\\.com/${CLOUD_NAME}/(?:image|video|raw)/upload/` +
      `(?:(?:t_[^/"'\\s\\\\]+|[^/"'\\s\\\\]*,[^/"'\\s\\\\]*)/)*` +
      `(?:v\\d+/)?` +
      `([^"'\\s\\\\?]+)`,
    'g',
  );
  return value.replace(pattern, (_m, publicPath) => `${SPACES.cdnBaseUrl}/${publicPath}`);
}

async function dbConnection() {
  return mysql.createConnection({
    host: env.DATABASE_HOST,
    port: +env.DATABASE_PORT,
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    database: env.DATABASE_NAME,
    ssl: { rejectUnauthorized: false },
  });
}

// json columns are auto-parsed to JS objects by mysql2; read them as text so the
// URL rewrite sees the raw JSON (MySQL stores forward slashes unescaped).
function readExpr(column, type) {
  return type === 'json' ? `CAST(\`${column}\` AS CHAR)` : `\`${column}\``;
}

async function findUrlColumns(conn) {
  const [cols] = await conn.query(
    `SELECT c.TABLE_NAME t, c.COLUMN_NAME col, c.DATA_TYPE dtype,
            (SELECT k.COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE k
             WHERE k.TABLE_SCHEMA = c.TABLE_SCHEMA AND k.TABLE_NAME = c.TABLE_NAME
               AND k.CONSTRAINT_NAME = 'PRIMARY' LIMIT 1) pk
     FROM information_schema.COLUMNS c
     WHERE c.TABLE_SCHEMA = ? AND c.DATA_TYPE IN ('varchar','text','mediumtext','longtext','json')`,
    [env.DATABASE_NAME],
  );
  const targets = [];
  for (const { t, col, dtype, pk } of cols) {
    if (!pk) continue;
    const [[{ n }]] = await conn.query(
      `SELECT COUNT(*) n FROM \`${t}\` WHERE \`${col}\` LIKE '%res.cloudinary.com%'`,
    );
    if (n > 0) targets.push({ table: t, column: col, pk, type: dtype, rows: n });
  }
  return targets;
}

async function verifySampleUrls(conn, targets, sampleSize = 10) {
  const samples = [];
  for (const { table, column, type } of targets.slice(0, 8)) {
    const [rows] = await conn.query(
      `SELECT ${readExpr(column, type)} v FROM \`${table}\` WHERE \`${column}\` LIKE '%res.cloudinary.com%' LIMIT 3`,
    );
    for (const { v } of rows) {
      const rewritten = rewriteUrls(String(v));
      const url = (rewritten.match(/https?:\/\/[^"'\s\\]+/g) || []).find((u) =>
        u.startsWith(SPACES.cdnBaseUrl),
      );
      if (url) samples.push(url);
    }
  }
  const toCheck = samples.slice(0, sampleSize);
  console.log(`Verifying ${toCheck.length} rewritten URLs against the CDN...`);
  let ok = 0;
  for (const url of toCheck) {
    try {
      const res = await axios.head(url, { timeout: 20000, validateStatus: () => true });
      console.log(`  ${res.status} ${url.slice(0, 110)}`);
      if (res.status === 200) ok++;
    } catch (e) {
      console.log(`  FAIL ${url.slice(0, 110)} (${e.message})`);
    }
  }
  return { ok, total: toCheck.length };
}

async function rewriteDb(dryRun) {
  const conn = await dbConnection();
  const targets = await findUrlColumns(conn);
  console.log('URL columns found:');
  targets.forEach(({ table, column, rows }) => console.log(`  ${table}.${column}: ${rows} rows`));

  if (dryRun) {
    for (const { table, column, type } of targets.slice(0, 4)) {
      const [rows] = await conn.query(
        `SELECT ${readExpr(column, type)} v FROM \`${table}\` WHERE \`${column}\` LIKE '%res.cloudinary.com%' LIMIT 2`,
      );
      rows.forEach(({ v }) => {
        const before = String(v).slice(0, 130);
        const after = rewriteUrls(String(v)).slice(0, 130);
        console.log(`  ${table}.${column}:\n    - ${before}\n    + ${after}`);
      });
    }
    await conn.end();
    return;
  }

  const { ok, total } = await verifySampleUrls(conn, targets);
  if (total === 0 || ok < total) {
    console.error(
      `ABORT: only ${ok}/${total} sample URLs return 200 from the CDN. Run --copy first (or investigate).`,
    );
    await conn.end();
    process.exit(1);
  }

  const rollbackFile = path.join(__dirname, `url-rewrite-rollback-${Date.now()}.jsonl`);
  const rollback = fs.createWriteStream(rollbackFile);
  let updated = 0;
  for (const { table, column, pk, type } of targets) {
    const [rows] = await conn.query(
      `SELECT \`${pk}\` pk, ${readExpr(column, type)} v FROM \`${table}\` WHERE \`${column}\` LIKE '%res.cloudinary.com%'`,
    );
    for (const row of rows) {
      const oldValue = String(row.v);
      const newValue = rewriteUrls(oldValue);
      if (newValue === oldValue) continue;
      rollback.write(
        JSON.stringify({ table, column, pk, pkValue: row.pk, oldValue }) + '\n',
      );
      await conn.query(`UPDATE \`${table}\` SET \`${column}\` = ? WHERE \`${pk}\` = ?`, [
        newValue,
        row.pk,
      ]);
      updated++;
    }
    console.log(`  ${table}.${column}: rewritten`);
  }
  rollback.end();
  console.log(`DONE: ${updated} rows updated. Rollback file: ${rollbackFile}`);
  await conn.end();
}

async function rollback(file) {
  const conn = await dbConnection();
  const rl = readline.createInterface({ input: fs.createReadStream(file) });
  let restored = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const { table, column, pk, pkValue, oldValue } = JSON.parse(line);
    await conn.query(`UPDATE \`${table}\` SET \`${column}\` = ? WHERE \`${pk}\` = ?`, [
      oldValue,
      pkValue,
    ]);
    restored++;
  }
  console.log(`Restored ${restored} rows from ${file}`);
  await conn.end();
}

(async () => {
  if (MODE === 'rollback') {
    const file = process.argv[process.argv.indexOf('--rollback') + 1];
    if (!file || !fs.existsSync(file)) {
      console.error('Usage: --rollback <url-rewrite-rollback-*.jsonl>');
      process.exit(1);
    }
    await rollback(file);
    return;
  }
  requireSpacesConfig();
  console.log(`MODE: ${MODE} (cloud=${CLOUD_NAME}, bucket=${SPACES.bucket}, cdn=${SPACES.cdnBaseUrl})`);
  if (MODE === 'dry-run') {
    await copyAssets(true);
    await rewriteDb(true);
    console.log('\nDry-run only. Use --copy, then --rewrite-db.');
  } else if (MODE === 'copy') {
    await copyAssets(false);
  } else if (MODE === 'rewrite-db') {
    await rewriteDb(false);
  }
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
