/**
 * Optional Layer C sync: commits data/users/<userId>.json to your GitHub repository.
 * Disabled unless data/config.json → sync.enabled = true and these Netlify environment
 * variables are set (Site settings → Environment variables):
 *   GITHUB_TOKEN   fine-grained token with "Contents: read & write" on ONE repo (never in client code)
 *   GITHUB_REPO    "owner/repo"
 *   GITHUB_BRANCH  default "main"
 *   SYNC_PIN       shared secret users type when syncing
 * Protections: PIN check, per-IP rate limit, schema/size validation (≤ 1 MB), path whitelist.
 */
const hits = new Map();
const LIMIT = 10; // requests per IP per minute

const json = (status, body) => ({ statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > LIMIT;
}

function validate(doc) {
  if (!doc || typeof doc !== 'object') return 'Body must be a JSON object.';
  if (doc.schemaVersion !== 2) return 'schemaVersion must be 2.';
  const id = doc.profile && doc.profile.userId;
  if (typeof id !== 'string' || !/^[a-z0-9-]{3,120}$/.test(id)) return 'Invalid profile.userId.';
  if (!Array.isArray(doc.attempts)) return 'attempts must be an array.';
  if (JSON.stringify(doc).match(/\b9[78]\d{8}\b/)) return 'Refusing to store an unmasked phone number.';
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { message: 'Use POST.' });
  const { GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH = 'main', SYNC_PIN } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO || !SYNC_PIN) return json(501, { message: 'Sync is not configured on the server.' });
  const ip = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'unknown';
  if (rateLimited(ip)) return json(429, { message: 'Too many sync requests — try again in a minute.' });
  if ((event.headers['x-sync-pin'] || '') !== SYNC_PIN) return json(401, { message: 'Wrong sync PIN.' });
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  if (raw.length > 1024 * 1024) return json(413, { message: 'User file exceeds 1 MB.' });
  let doc;
  try { doc = JSON.parse(raw); } catch { return json(400, { message: 'Invalid JSON.' }); }
  const err = validate(doc);
  if (err) return json(400, { message: err });

  const path = `data/users/${doc.profile.userId}.json`;
  const api = `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`;
  const headers = { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'neuromcq-sync', 'X-GitHub-Api-Version': '2022-11-28' };
  try {
    let sha;
    const cur = await fetch(`${api}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
    if (cur.ok) sha = (await cur.json()).sha;
    const put = await fetch(api, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `sync: update ${doc.profile.userId}`,
        content: Buffer.from(JSON.stringify(doc, null, 2)).toString('base64'),
        branch: GITHUB_BRANCH,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!put.ok) return json(502, { message: `GitHub rejected the commit (${put.status}).` });
    return json(200, { message: 'Synced to the repository.', path });
  } catch (e) {
    return json(502, { message: 'Could not reach GitHub: ' + e.message });
  }
};
