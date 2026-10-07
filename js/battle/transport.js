/**
 * Section 10 — transport-agnostic message bus for live rooms.
 * Every transport exposes:
 *   open(pin, onMessage) → Promise<void>,  send(msg) → Promise<void>,  close()
 * Messages are plain JSON objects; the host is authoritative (scores use host timestamps).
 *  • LocalTransport    — BroadcastChannel; works between tabs/windows of one browser (no setup).
 *  • FirebaseTransport — Firebase Realtime Database REST + Server-Sent Events (no SDK).
 *  • SupabaseTransport — Supabase REST with 1-second polling (table neuromcq_events).
 * @module battle/transport
 */

/** Random 6-digit PIN. @returns {string} */
export function makePin() {
  const a = new Uint32Array(1);
  (self.crypto || window.crypto).getRandomValues(a);
  return String(100000 + (a[0] % 900000));
}

/** Same-browser transport. */
export class LocalTransport {
  get name() { return 'local'; }
  async open(pin, onMessage) {
    if (!('BroadcastChannel' in self)) throw new Error('This browser cannot run same-device rooms.');
    this.ch = new BroadcastChannel('neuromcq-room-' + pin);
    this.ch.onmessage = (e) => onMessage(e.data);
    this.self = onMessage;
  }
  async send(msg) {
    this.ch?.postMessage(msg);
    // BroadcastChannel does not echo to the sender; deliver locally for symmetric handling.
    queueMicrotask(() => this.self?.(msg));
  }
  close() { this.ch?.close(); this.ch = null; }
}

/** Firebase Realtime Database transport (REST + EventSource). */
export class FirebaseTransport {
  /** @param {{databaseURL:string}} cfg */
  constructor(cfg) { this.base = (cfg.databaseURL || '').replace(/\/$/, ''); }
  get name() { return 'firebase'; }
  async open(pin, onMessage) {
    if (!this.base) throw new Error('Set battle.live.firebase.databaseURL in data/config.json.');
    this.url = `${this.base}/neuromcq_rooms/${pin}/events`;
    this.seen = new Set();
    this.es = new EventSource(this.url + '.json');
    const handle = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (!d || d.data === null || d.data === undefined) return;
        if (d.path === '/') { for (const [k, v] of Object.entries(d.data)) if (!this.seen.has(k)) { this.seen.add(k); onMessage(v); } }
        else { const k = d.path.slice(1); if (!this.seen.has(k)) { this.seen.add(k); onMessage(d.data); } }
      } catch { /* ignore malformed */ }
    };
    this.es.addEventListener('put', handle);
    this.es.addEventListener('patch', handle);
    await new Promise((resolve, reject) => { this.es.onopen = resolve; this.es.onerror = () => reject(new Error('Could not connect to Firebase.')); setTimeout(resolve, 4000); });
  }
  async send(msg) { await fetch(this.url + '.json', { method: 'POST', body: JSON.stringify(msg) }); }
  close() { this.es?.close(); }
}

/** Supabase transport (REST + polling). Table: neuromcq_events(id bigserial pk, room text, payload jsonb). */
export class SupabaseTransport {
  /** @param {{url:string, anonKey:string}} cfg */
  constructor(cfg) { this.c = cfg; }
  get name() { return 'supabase'; }
  headers() { return { apikey: this.c.anonKey, Authorization: 'Bearer ' + this.c.anonKey, 'Content-Type': 'application/json' }; }
  async open(pin, onMessage) {
    if (!this.c.url) throw new Error('Set battle.live.supabase.url and anonKey in data/config.json.');
    this.pin = pin;
    this.last = 0;
    const poll = async () => {
      try {
        const r = await fetch(`${this.c.url}/rest/v1/neuromcq_events?room=eq.${pin}&id=gt.${this.last}&order=id.asc`, { headers: this.headers() });
        if (r.ok) for (const row of await r.json()) { this.last = Math.max(this.last, row.id); onMessage(row.payload); }
      } catch { /* retry next tick */ }
      if (!this.closed) this.timer = setTimeout(poll, 1000);
    };
    poll();
  }
  async send(msg) { await fetch(`${this.c.url}/rest/v1/neuromcq_events`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ room: this.pin, payload: msg }) }); }
  close() { this.closed = true; clearTimeout(this.timer); }
}

/**
 * Transport from config (battle.live). 'none' → null (UI shows the setup guide).
 * @param {object} live config.battle.live @param {boolean} [forceLocal]
 * @returns {LocalTransport|FirebaseTransport|SupabaseTransport|null}
 */
export function createTransport(live = {}, forceLocal = false) {
  if (forceLocal || live.provider === 'local') return new LocalTransport();
  if (live.provider === 'firebase') return new FirebaseTransport(live.firebase || {});
  if (live.provider === 'supabase') return new SupabaseTransport(live.supabase || {});
  return null;
}
