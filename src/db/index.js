'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { jparse, jstringify, now } = require('../core/utils');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'balewoo.sqlite');
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

/* ---------------- migration ---------------- */

/** ستون‌هایی که در نسخه‌های بعدی افزوده شده‌اند — برای پایگاه داده‌های موجود */
const COLUMN_MIGRATIONS = [
  ['carts', 'wallet_used', 'INTEGER DEFAULT 0'],
  ['carts', 'points_used', 'INTEGER DEFAULT 0'],
  ['carts', 'points_discount', 'INTEGER DEFAULT 0'],
];

function ensureColumns() {
  for (const [table, column, ddl] of COLUMN_MIGRATIONS) {
    const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
    if (!exists) continue;
    const cols = db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().map((r) => r.name);
    if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  ensureColumns();
  db.prepare(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`).run();
  const row = db.prepare(`SELECT value FROM meta WHERE key='schema_version'`).get();
  const version = row ? parseInt(row.value, 10) : 0;
  db.prepare(`INSERT INTO meta(key,value) VALUES('schema_version',?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(String(SCHEMA_VERSION));
  return { fresh: version === 0, from: version, to: SCHEMA_VERSION };
}
const SCHEMA_VERSION = 1;

/* ---------------- helpers ---------------- */

/** اجرای select با پارامترهای نام‌دار */
function all(sql, params = {}) { return db.prepare(sql).all(params); }
function get(sql, params = {}) { return db.prepare(sql).get(params); }
function run(sql, params = {}) { return db.prepare(sql).run(params); }

function insert(table, data) {
  const keys = Object.keys(data);
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((k) => '@' + k).join(',')})`;
  const values = {};
  for (const k of keys) {
    const v = data[k];
    values[k] = v === undefined ? null : (typeof v === 'object' && v !== null ? jstringify(v) : v);
  }
  const info = db.prepare(sql).run(values);
  return Number(info.lastInsertRowid);
}

function update(table, id, data) {
  const keys = Object.keys(data).filter((k) => k !== 'id');
  if (!keys.length) return 0;
  const sets = keys.map((k) => `${k}=@${k}`).join(',');
  const values = { id };
  for (const k of keys) {
    const v = data[k];
    values[k] = v === undefined ? null : (typeof v === 'object' && v !== null ? jstringify(v) : v);
  }
  return db.prepare(`UPDATE ${table} SET ${sets} WHERE id=@id`).run(values).changes;
}

function remove(table, id) { return db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id).changes; }

/** upsert ساده */
function upsert(table, uniqueKey, data) {
  const existing = get(`SELECT * FROM ${table} WHERE ${uniqueKey}=@v`, { v: data[uniqueKey] });
  if (existing) { update(table, existing.id, data); return existing.id; }
  return insert(table, data);
}

function tx(fn) { return db.transaction(fn)(); }

/** تبدیل ستون‌های JSON آبجکت ردیف به آبجکت واقعی */
function hydrate(row, jsonFields = []) {
  if (!row) return row;
  const out = { ...row };
  for (const f of jsonFields) out[f] = jparse(out[f], Array.isArray(f) ? [] : null);
  return out;
}
function hydrateAll(rows, jsonFields = []) { return rows.map((r) => hydrate(r, jsonFields)); }

/** ساخت عبارت WHERE پویا از فیلترها */
function whereBuilder(filters = {}) {
  const clauses = [];
  const params = {};
  let i = 0;
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    const p = `p${i++}`;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      const names = value.map((v, j) => { params[`${p}_${j}`] = v; return `@${p}_${j}`; });
      clauses.push(`${key} IN (${names.join(',')})`);
    } else if (typeof value === 'object' && value.op) {
      params[p] = value.val;
      clauses.push(`${key} ${value.op} @${p}`);
    } else {
      params[p] = value;
      clauses.push(`${key} = @${p}`);
    }
  }
  return { sql: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', params };
}

/* ---------------- تنظیمات ---------------- */

let settingsCache = null;
function loadSettings(force = false) {
  if (settingsCache && !force) return settingsCache;
  const rows = db.prepare('SELECT key,value FROM settings').all();
  settingsCache = {};
  for (const r of rows) {
    // مقادیر عددی/بولین به‌صورت رشته نگه داشته می‌شوند تا مقایسه با '1' درست کار کند؛
    // فقط آرایه‌ها و آبجکت‌های JSON باز می‌شوند.
    const v = r.value;
    const isJson = typeof v === 'string' && (v.startsWith('{') || v.startsWith('['));
    settingsCache[r.key] = isJson ? jparse(v, v) : (v === null || v === undefined ? '' : String(v));
  }
  return settingsCache;
}
function setting(key, def = null) {
  const s = loadSettings();
  return s[key] === undefined || s[key] === '' ? def : s[key];
}
function setSetting(key, value, meta = {}) {
  db.prepare(`INSERT INTO settings(key,value,group_name,type,label,updated_at) VALUES(@key,@value,@group_name,@type,@label,@ts)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value, group_name=excluded.group_name,
                type=excluded.type, label=COALESCE(excluded.label, settings.label), updated_at=excluded.updated_at`)
    .run({ key, value: typeof value === 'object' ? jstringify(value) : String(value ?? ''), group_name: meta.group || 'general', type: meta.type || 'text', label: meta.label || null, ts: now() });
  settingsCache = null;
}
function setMany(obj, group = 'general') {
  for (const [k, v] of Object.entries(obj)) setSetting(k, v, { group });
}

module.exports = {
  db, DATA_DIR, DB_FILE, migrate, SCHEMA_VERSION,
  all, get, run, insert, update, remove, upsert, tx, hydrate, hydrateAll, whereBuilder,
  loadSettings, setting, setSetting, setMany,
  jparse, jstringify,
};
