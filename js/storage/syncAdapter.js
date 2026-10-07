/**
 * Layer C — optional automatic sync, disabled by default (config.sync.enabled = false).
 * All adapters share one interface:
 *   push(userDoc, {pin}) → Promise<{ok:boolean, message:string}>
 *   pull(userId, {pin}) → Promise<object|null>
 * With sync off, the Noop adapter is used and Layers A/B work on their own.
 * @module storage/syncAdapter
 */

/** No-op adapter. */
export class NoopSync {
  get name() { return 'off'; }
  async push() { return { ok: false, message: 'Sync is disabled in data/config.json.' }; }
  async pull() { return null; }
}

/**
 * Netlify Function adapter → netlify/functions/saveUser.js commits data/users/<userId>.json
 * to the GitHub repo using a token kept only in Netlify environment variables.
 */
export class NetlifySync {
  /** @param {{netlifyEndpoint:string}} cfg */
  constructor(cfg) { this.endpoint = cfg.netlifyEndpoint || './.netlify/functions/saveUser'; }
  get name() { return 'netlify'; }
  async push(user, opt = {}) {
    try {
      const body = JSON.stringify(user);
      if (body.length > 1024 * 1024) return { ok: false, message: 'User file exceeds 1 MB; export it manually instead.' };
      const res = await fetch(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sync-Pin': opt.pin || '' }, body });
      const j = await res.json().catch(() => ({}));
      return { ok: res.ok, message: j.message || (res.ok ? 'Synced.' : 'Sync failed (' + res.status + ').') };
    } catch (e) {
      return { ok: false, message: 'Network error: ' + e.message };
    }
  }
  async pull(userId) {
    try {
      const res = await fetch('./data/users/' + encodeURIComponent(userId) + '.json', { cache: 'no-cache' });
      return res.ok ? await res.json() : null;
    } catch { return null; }
  }
}

/** Firebase Realtime Database REST adapter (no SDK). Requires database rules you control. */
export class FirebaseSync {
  /** @param {{firebase:{databaseURL:string}}} cfg */
  constructor(cfg) { this.base = (cfg.firebase?.databaseURL || '').replace(/\/$/, ''); }
  get name() { return 'firebase'; }
  async push(user) {
    if (!this.base) return { ok: false, message: 'Set sync.firebase.databaseURL in config.json.' };
    try {
      const res = await fetch(`${this.base}/neuromcq_users/${encodeURIComponent(user.profile.userId)}.json`, { method: 'PUT', body: JSON.stringify(user) });
      return { ok: res.ok, message: res.ok ? 'Synced to Firebase.' : 'Firebase rejected the write (' + res.status + ').' };
    } catch (e) { return { ok: false, message: e.message }; }
  }
  async pull(userId) {
    if (!this.base) return null;
    try { const r = await fetch(`${this.base}/neuromcq_users/${encodeURIComponent(userId)}.json`); return r.ok ? await r.json() : null; } catch { return null; }
  }
}

/** Supabase REST adapter (table with columns user_id text primary key, doc jsonb). */
export class SupabaseSync {
  /** @param {{supabase:{url:string,anonKey:string,table:string}}} cfg */
  constructor(cfg) { this.c = cfg.supabase || {}; }
  get name() { return 'supabase'; }
  headers() { return { apikey: this.c.anonKey, Authorization: 'Bearer ' + this.c.anonKey, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }; }
  async push(user) {
    if (!this.c.url) return { ok: false, message: 'Set sync.supabase.url and anonKey in config.json.' };
    try {
      const res = await fetch(`${this.c.url}/rest/v1/${this.c.table || 'neuromcq_users'}`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ user_id: user.profile.userId, doc: user }) });
      return { ok: res.ok, message: res.ok ? 'Synced to Supabase.' : 'Supabase rejected the write (' + res.status + ').' };
    } catch (e) { return { ok: false, message: e.message }; }
  }
  async pull(userId) {
    if (!this.c.url) return null;
    try {
      const r = await fetch(`${this.c.url}/rest/v1/${this.c.table || 'neuromcq_users'}?user_id=eq.${encodeURIComponent(userId)}&select=doc`, { headers: this.headers() });
      const j = r.ok ? await r.json() : [];
      return j[0]?.doc || null;
    } catch { return null; }
  }
}

/**
 * Factory from config.sync.
 * @param {object} syncCfg @returns {NoopSync|NetlifySync|FirebaseSync|SupabaseSync}
 */
export function createSync(syncCfg = {}) {
  if (!syncCfg.enabled) return new NoopSync();
  if (syncCfg.provider === 'firebase') return new FirebaseSync(syncCfg);
  if (syncCfg.provider === 'supabase') return new SupabaseSync(syncCfg);
  return new NetlifySync(syncCfg);
}
