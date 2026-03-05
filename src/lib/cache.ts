type Entry<T> = { value: T; ts: number; ttlMs: number };

const store = new Map<string, Entry<any>>();

export function cacheGet<T>(key: string): T | null {
  const e = store.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > e.ttlMs) {
    store.delete(key);
    return null;
  }
  return e.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs = 3 * 60 * 1000) {
  store.set(key, { value, ts: Date.now(), ttlMs });
}

export function cacheDel(key: string) {
  store.delete(key);
}

export function cacheDelPrefix(prefix: string) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}