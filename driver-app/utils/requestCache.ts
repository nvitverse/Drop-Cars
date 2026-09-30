import axios, { AxiosInstance } from 'axios';
import { AppState } from 'react-native';

/**
 * Small response cache for the few GET calls whose answer changes rarely (city list, my cars, my drivers, profile).
 * Every call that reaches the server costs money, and the same lists were being fetched again on every screen open.
 *
 * Safety rules (so nobody ever sees stale data when it matters):
 *  - only the URLs listed in RULES are cached; wallet, bookings, chat, live radar, notifications are NEVER cached
 *  - ANY successful change (POST / PUT / PATCH / DELETE) clears the whole cache
 *  - a push notification arriving clears the cache (document approved, booking assigned, ...)
 *  - pull-to-refresh and the refresh button clear it (see FreshRefreshControl / RefreshFab)
 *  - a request can opt out with { noCache: true } (e.g. the Assign Driver screens)
 *  - the cache is per login (the auth header is part of the key) and is emptied on logout
 */

const MIN = 60 * 1000;

const RULES: { re: RegExp; ttl: number }[] = [
  // rarely changing
  { re: /^\/api\/cities\/(public|local-serviceable|vendor|vehicle-owner\/selected)/, ttl: 10 * MIN },
  { re: /^\/api\/dropbid\/settings/, ttl: 10 * MIN },
  { re: /^\/api\/support\/on-duty-contact/, ttl: 10 * MIN },
  { re: /^\/api\/users\/vehicle-owner\/(referral|email)/, ttl: 10 * MIN },
  { re: /^\/api\/announcements\/active/, ttl: 5 * MIN },
  // my cars / my drivers / my profile / document status
  { re: /^\/api\/(users|assignments)\/(driver\/)?available-(cars|drivers)/, ttl: 5 * MIN },
  { re: /^\/api\/users\/cardriver\/vehicle-owner\//, ttl: 5 * MIN },
  { re: /^\/api\/users\/vehicle-owner\/(me|all-document-status)/, ttl: 5 * MIN },
  { re: /^\/api\/users\/cardriver\/me/, ttl: 5 * MIN },
];

type Entry = { at: number; ttl: number; response: any };
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<any>>();
const MAX_ENTRIES = 80;

export function clearRequestCache(): void {
  store.clear();
  inflight.clear();
}

function ruleFor(config: any): { ttl: number } | null {
  if (!config || (config.method || 'get').toLowerCase() !== 'get' || config.noCache) return null;
  const url: string = String(config.url || '').replace(config.baseURL || '', '');
  const path = url.split('?')[0];
  for (const r of RULES) if (r.re.test(path)) return { ttl: r.ttl };
  return null;
}

function keyFor(config: any): string {
  const auth = (config.headers && (config.headers.Authorization || config.headers.authorization)) || '';
  let params = '';
  try { params = config.params ? JSON.stringify(config.params) : ''; } catch { params = ''; }
  return `${auth}|${config.baseURL || ''}${config.url || ''}|${params}`;
}

const clone = (data: any) => {
  try { return data === undefined ? data : JSON.parse(JSON.stringify(data)); } catch { return data; }
};

function fromEntry(e: Entry, config: any) {
  return { ...e.response, data: clone(e.response.data), config, fromCache: true };
}

/** Put the cache in front of an axios instance. Call once per instance, after it is created. */
export function installRequestCache(instance: AxiosInstance): void {
  const inner = axios.getAdapter((instance.defaults as any).adapter || ['xhr', 'http', 'fetch']);

  (instance.defaults as any).adapter = async (config: any) => {
    const method = (config.method || 'get').toLowerCase();
    const rule = ruleFor(config);

    if (!rule) {
      const res = await inner(config);
      if (method !== 'get' && res && res.status >= 200 && res.status < 300) clearRequestCache();
      return res;
    }

    const key = keyFor(config);
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < hit.ttl) return fromEntry(hit, config);

    // the same list asked for by several screens at once -> one call
    const pending = inflight.get(key);
    if (pending) {
      const shared = await pending;
      return { ...shared, data: clone(shared.data), config };
    }

    const p = inner(config);
    inflight.set(key, p);
    try {
      const res: any = await p;
      if (res && res.status >= 200 && res.status < 300) {
        if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
        store.set(key, { at: Date.now(), ttl: rule.ttl, response: { data: res.data, status: res.status, statusText: res.statusText, headers: res.headers, request: res.request } });
      }
      return res;
    } finally {
      inflight.delete(key);
    }
  };
}

// A push notification that arrived while the app was in the background could not clear the cache, so coming back to the
// front after a while starts from fresh data.
let leftAt = 0;
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    if (leftAt && Date.now() - leftAt > 60 * 1000) clearRequestCache();
    leftAt = 0;
  } else if (!leftAt) {
    leftAt = Date.now();
  }
});
