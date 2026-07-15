/**
 * Second-pass URL migration: point stored media URLs at the backend's
 * Cloudinary-compatible media proxy (/media/{image|video}/upload/<key>)
 * instead of the raw Spaces CDN (or leftover res.cloudinary.com URLs).
 *
 * Why: the mobile app inserts named transformations (t_<name>/) after the
 * /image/upload/ / /video/upload/ marker via string replace. Raw CDN URLs
 * have no marker, so every client silently loads full-size originals, and
 * the legacy Cloudinary eager video posters (so_0/...jpg) 404 outright.
 * Proxy-shaped URLs restore the marker for old app builds and let the
 * backend heal the so_0 posters (it regenerates the frame from the video).
 *
 * Run on the droplet with the backend deployed (needs MEDIA_PROXY_PUBLIC_BASE_URL
 * in .env and the /media routes live for verification):
 *   node scripts/rewrite-urls-to-media-proxy.js                 # dry-run: counts + samples, no writes
 *   node scripts/rewrite-urls-to-media-proxy.js --rewrite-db    # verify samples (incl. so_0 posters), then rewrite
 *   node scripts/rewrite-urls-to-media-proxy.js --rewrite-db --skip-verify
 *   node scripts/rewrite-urls-to-media-proxy.js --rollback <url-proxy-rollback-*.jsonl>
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
// Process env overrides the .env file (handy for one-off runs and tests).
for (const key of Object.keys(process.env)) {
  if (/^[A-Z_0-9]+$/.test(key)) env[key] = process.env[key];
}

const mysql = require(path.join(ROOT, 'node_modules/mysql2/promise'));
// axios v1 ships as a CJS module whose callable instance lives on `.default`.
const axiosLib = require(path.join(ROOT, 'node_modules/axios'));
const axios = axiosLib.default || axiosLib;

const PROXY_BASE = (env.MEDIA_PROXY_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const CDN_BASE = (
  env.SPACES_CDN_BASE_URL ||
  (env.SPACES_BUCKET && env.SPACES_REGION
    ? `https://${env.SPACES_BUCKET}.${env.SPACES_REGION}.cdn.digitaloceanspaces.com`
    : '')
).replace(/\/+$/, '');
const ORIGIN_BASE =
  env.SPACES_BUCKET && env.SPACES_REGION
    ? `https://${env.SPACES_BUCKET}.${env.SPACES_REGION}.digitaloceanspaces.com`
    : '';

const MODE = process.argv.includes('--rewrite-db')
  ? 'rewrite-db'
  : process.argv.includes('--rollback')
  ? 'rollback'
  : 'dry-run';
const SKIP_VERIFY = process.argv.includes('--skip-verify');

const VIDEO_EXTENSIONS = /\.(mp4|webm|mov)(?=$|[?#"'\s\\])/i;
const MEDIA_EXTENSIONS = /\.(jpe?g|png|webp|gif|mp4|webm|mov|mp3|wav)(?=$|[?#"'\s\\])/i;
const POSTER_SEGMENT = /^so_[\dp.]+\//;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** image|video for a bucket path, matching how the app picks markers. */
function resourceTypeFor(bucketPath) {
  if (POSTER_SEGMENT.test(bucketPath)) return 'video';
  return VIDEO_EXTENSIONS.test(bucketPath) ? 'video' : 'image';
}

/** Only displayable media goes through the proxy; other assets (LoRA
 *  .safetensors, archives, json) keep their direct CDN URL — no transform
 *  applies to them and workers shouldn't pay an extra redirect hop. */
function isProxyableMedia(bucketPath) {
  return POSTER_SEGMENT.test(bucketPath) || MEDIA_EXTENSIONS.test(bucketPath);
}

function proxyUrl(resourceType, bucketPath) {
  return `${PROXY_BASE}/media/${resourceType}/upload/${bucketPath}`;
}

/**
 * Rewrites CDN/origin Spaces URLs and leftover res.cloudinary.com URLs to the
 * proxy shape. Cloudinary named/comma transforms and version segments are
 * dropped (they map to the original); so_<offset>/ poster segments are KEPT —
 * the proxy regenerates those posters from the source video.
 */
function rewriteUrls(value) {
  let result = value;

  for (const base of [CDN_BASE, ORIGIN_BASE]) {
    if (!base) continue;
    const pattern = new RegExp(
      `${escapeRegExp(base)}/([^"'\\s\\\\?]+)`,
      'g',
    );
    result = result.replace(pattern, (match, bucketPath) =>
      isProxyableMedia(bucketPath)
        ? proxyUrl(resourceTypeFor(bucketPath), bucketPath)
        : match,
    );
  }

  return result;
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

// json columns are auto-parsed by mysql2; read as text so the rewrite sees raw JSON.
function readExpr(column, type) {
  return type === 'json' ? `CAST(\`${column}\` AS CHAR)` : `\`${column}\``;
}

function sourceLike(column) {
  const likes = [`\`${column}\` LIKE '%res.cloudinary.com%'`];
  if (CDN_BASE) {
    likes.push(`\`${column}\` LIKE '%${CDN_BASE.replace('https://', '')}%'`);
  }
  if (ORIGIN_BASE && ORIGIN_BASE !== CDN_BASE) {
    likes.push(`\`${column}\` LIKE '%${ORIGIN_BASE.replace('https://', '')}%'`);
  }
  return `(${likes.join(' OR ')})`;
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
      `SELECT COUNT(*) n FROM \`${t}\` WHERE ${sourceLike(col)}`,
    );
    if (n > 0) targets.push({ table: t, column: col, pk, type: dtype, rows: n });
  }
  return targets;
}

async function headOk(url) {
  try {
    const res = await axios.head(url, {
      timeout: 90000,
      maxRedirects: 5,
      validateStatus: () => true,
    });
    return res.status;
  } catch (e) {
    return `FAIL ${e.message}`;
  }
}

/**
 * Verifies rewritten URLs against the live proxy/CDN. Unlike the first-pass
 * script this samples EVERY target column, and force-samples the legacy
 * so_0 poster rows (posts.previewImageUrl / user_activities.previewUrl) —
 * the rows the first migration silently broke.
 */
async function verifySamples(conn, targets) {
  const checks = [];
  for (const { table, column, type } of targets) {
    const [rows] = await conn.query(
      `SELECT ${readExpr(column, type)} v FROM \`${table}\` WHERE ${sourceLike(column)} LIMIT 2`,
    );
    for (const { v } of rows) {
      const rewritten = rewriteUrls(String(v));
      const url = (rewritten.match(/https?:\/\/[^"'\s\\]+/g) || []).find((u) =>
        u.startsWith(PROXY_BASE),
      );
      if (url) checks.push({ src: `${table}.${column}`, url });
    }
  }
  // Poster rows exercise the proxy's so_0 healing path — always include them.
  for (const [table, column] of [
    ['posts', 'previewImageUrl'],
    ['user_activities', 'previewUrl'],
  ]) {
    try {
      const [rows] = await conn.query(
        `SELECT \`${column}\` v FROM \`${table}\` WHERE \`${column}\` LIKE '%so_0%' LIMIT 3`,
      );
      for (const { v } of rows) {
        const rewritten = rewriteUrls(String(v));
        if (rewritten.startsWith(PROXY_BASE)) {
          checks.push({ src: `${table}.${column} (poster)`, url: rewritten });
        }
      }
    } catch (_e) {
      // table may not exist in this schema — ignore
    }
  }

  console.log(`Verifying ${checks.length} rewritten URLs (following redirects)...`);
  let ok = 0;
  for (const { src, url } of checks) {
    const status = await headOk(url);
    const good = status === 200;
    if (good) ok++;
    console.log(`  ${good ? 'OK ' : 'BAD'} [${src}] ${String(status)} ${url.slice(0, 110)}`);
  }
  return { ok, total: checks.length };
}

async function rewriteDb(dryRun) {
  const conn = await dbConnection();
  const targets = await findUrlColumns(conn);
  console.log('URL columns found:');
  targets.forEach(({ table, column, rows }) =>
    console.log(`  ${table}.${column}: ${rows} rows`),
  );

  if (dryRun) {
    for (const { table, column, type } of targets) {
      const [rows] = await conn.query(
        `SELECT ${readExpr(column, type)} v FROM \`${table}\` WHERE ${sourceLike(column)} LIMIT 2`,
      );
      rows.forEach(({ v }) => {
        const before = String(v).slice(0, 120);
        const after = rewriteUrls(String(v)).slice(0, 120);
        console.log(`  ${table}.${column}:\n    - ${before}\n    + ${after}`);
      });
    }
    await conn.end();
    return;
  }

  if (!SKIP_VERIFY) {
    const { ok, total } = await verifySamples(conn, targets);
    if (total === 0 || ok < total) {
      console.error(
        `ABORT: only ${ok}/${total} sample URLs return 200. Deploy the media proxy first (or pass --skip-verify).`,
      );
      await conn.end();
      process.exit(1);
    }
  }

  const rollbackFile = path.join(
    __dirname,
    `url-proxy-rollback-${Date.now()}.jsonl`,
  );
  const rollback = fs.createWriteStream(rollbackFile);
  let updated = 0;
  for (const { table, column, pk, type } of targets) {
    const [rows] = await conn.query(
      `SELECT \`${pk}\` pk, ${readExpr(column, type)} v FROM \`${table}\` WHERE ${sourceLike(column)}`,
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

module.exports = { rewriteUrls, resourceTypeFor };

if (require.main === module) {
  (async () => {
    if (MODE === 'rollback') {
      const file = process.argv[process.argv.indexOf('--rollback') + 1];
      if (!file || !fs.existsSync(file)) {
        console.error('Usage: --rollback <url-proxy-rollback-*.jsonl>');
        process.exit(1);
      }
      await rollback(file);
      return;
    }
    if (!PROXY_BASE) {
      console.error('MEDIA_PROXY_PUBLIC_BASE_URL missing in .env');
      process.exit(1);
    }
    if (!CDN_BASE) {
      console.error('SPACES_CDN_BASE_URL (or SPACES_BUCKET+REGION) missing in .env');
      process.exit(1);
    }
    console.log(
      `MODE: ${MODE} (cdn=${CDN_BASE}, proxy=${PROXY_BASE})`,
    );
    await rewriteDb(MODE === 'dry-run');
    if (MODE === 'dry-run') console.log('\nDry-run only. Use --rewrite-db to apply.');
  })().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
  });
}
