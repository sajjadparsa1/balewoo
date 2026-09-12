'use strict';
/** کش ساده درون‌حافظه‌ای با TTL و قابلیت بی‌اعتبارسازی گروهی */

const store = new Map();

function get(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.exp && hit.exp < Date.now()) { store.delete(key); return undefined; }
  return hit.value;
}

function set(key, value, ttlSec = 60, group = 'default') {
  store.set(key, { value, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0, group });
  return value;
}

function remember(key, ttlSec, factory, group = 'default') {
  const cached = get(key);
  if (cached !== undefined) return cached;
  const value = factory();
  set(key, value, ttlSec, group);
  return value;
}

async function rememberAsync(key, ttlSec, factory, group = 'default') {
  const cached = get(key);
  if (cached !== undefined) return cached;
  const value = await factory();
  set(key, value, ttlSec, group);
  return value;
}

function forget(key) { store.delete(key); }
function flushGroup(group) {
  for (const [k, v] of store.entries()) if (v.group === group) store.delete(k);
}
function flush() { store.clear(); }
function stats() { return { keys: store.size }; }

module.exports = { get, set, remember, rememberAsync, forget, flushGroup, flush, stats };
