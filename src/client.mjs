const hosts = new Set(['app.action1.com', 'app.eu.action1.com', 'app.au.action1.com', 'app.na-2.action1.com']);
export class Action1Client {
  constructor({ baseUrl = 'https://app.action1.com/api/3.0', clientId, clientSecret, organizations = [], fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), interval = 2100 } = {}) {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !/^\/api\/3\.0\/?$/.test(url.pathname)) throw new Error('Unsupported Action1 API URL');
    this.base = url.href.replace(/\/$/, '') + '/';
    Object.assign(this, { clientId, clientSecret, organizations, fetchImpl, sleep, interval });
    this.queue = Promise.resolve(); this.nextRequest = 0;
  }
  org(id) {
    if (this.organizations.length && !this.organizations.includes(id)) throw new Error('Organization is outside configured scope');
    return segment(id);
  }
  async paced(url, options) {
    const run = this.queue.then(async () => {
      await this.sleep(Math.max(0, this.nextRequest - Date.now()));
      this.nextRequest = Date.now() + this.interval;
      try { return await this.fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) }); }
      catch { throw new Error('Action1 request failed or timed out'); }
    });
    this.queue = run.catch(() => {}); return run;
  }
  async token() {
    if (this.accessToken && Date.now() < this.expires) return this.accessToken;
    if (this.pendingToken) return this.pendingToken;
    this.pendingToken = (async () => {
      if (!this.clientId || !this.clientSecret) throw new Error('Configure Action1 credentials through your secret manager');
      const response = await this.paced(this.base + 'oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret }) });
      if (!response.ok) throw new Error(`Action1 authentication failed (HTTP ${response.status})`);
      let data;
      try { data = await response.json(); } catch { throw new Error('Invalid Action1 authentication response'); }
      if (!data.access_token || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) <= 0) throw new Error('Invalid Action1 token response');
      this.accessToken = data.access_token;
      this.expires = Date.now() + Math.max(0, Number(data.expires_in) - 60) * 1000;
      return this.accessToken;
    })();
    try { return await this.pendingToken; } finally { this.pendingToken = null; }
  }
  async get(path, query = {}) {
    const url = new URL(path, this.base);
    if (!url.href.startsWith(this.base)) throw new Error('API path outside configured base');
    for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
    let refreshed = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await this.paced(url, { headers: { Authorization: `Bearer ${await this.token()}`, Accept: 'application/json' } });
      if (response.status === 401 && !refreshed) { this.accessToken = null; refreshed = true; continue; }
      if (response.status === 429 && attempt < 3) {
        const header = response.headers.get('Retry-After');
        let seconds = header && /^\d+(\.\d+)?$/.test(header) ? Number(header) : (Date.parse(header) - Date.now()) / 1000;
        if (!Number.isFinite(seconds) || seconds < 0) seconds = 2 ** (attempt + 1);
        if (seconds > 60) throw new Error('Action1 throttled requests; retry later');
        await this.sleep(seconds * 1000); continue;
      }
      if (!response.ok) throw new Error(`Action1 API request failed (HTTP ${response.status})`);
      try { return await response.json(); } catch { throw new Error('Invalid Action1 JSON response'); }
    }
    throw new Error('Action1 retry limit reached');
  }
  async pages(path, { maxPages = 10, limit = 100, from = 0, ...query } = {}) {
    const items = [];
    for (let page = 0; page < maxPages; page++) {
      const data = await this.get(path, { ...query, from, limit });
      if (Array.isArray(data)) return { items: [...items, ...data], truncated: false };
      if (!Array.isArray(data.items)) throw new Error('Expected Action1 ResultPage');
      items.push(...data.items);
      const total = Number(data.total_items);
      const more = Boolean(data.next_page) || (Number.isFinite(total) && from + data.items.length < total);
      if (!more) return { items, truncated: false };
      if (!data.items.length) throw new Error('Action1 pagination made no progress');
      from += data.items.length;
    }
    return { items, truncated: true, nextFrom: from };
  }
}
export function segment(value) {
  if (typeof value !== 'string' || !value.trim() || value === '.' || value === '..') throw new Error('Invalid resource ID');
  return encodeURIComponent(value);
}
