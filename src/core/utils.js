'use strict';
const crypto = require('crypto');
const { toPersianDigits, toEnglishDigits } = require('./jalali');

/* ---------------- اعداد و پول ---------------- */

function toInt(v, def = 0) {
  const n = parseInt(toEnglishDigits(String(v ?? '')).replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : def;
}
function toFloat(v, def = 0) {
  const n = parseFloat(toEnglishDigits(String(v ?? '')).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : def;
}
/** 1000000 -> "1,000,000" */
function numberFormat(n) {
  return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
/** 1000000 -> "۱٬۰۰۰٬۰۰۰" */
function fa(n) { return toPersianDigits(numberFormat(n)); }

/* ---------------- رشته و اسلاگ ---------------- */

const FA_CHARS = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ي': 'ی', 'ئ': 'ی', 'ك': 'ک', 'ة': 'ه', 'ؤ': 'و', 'ں': 'ن', 'پ': 'پ' };
function normalizeFa(str) {
  return toEnglishDigits(String(str || ''))
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[أإآٱيئككةؤں]/g, (c) => FA_CHARS[c] || c)
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
/** اسلاگ ساز فارسی/لاتین */
function slugify(str, fallback = '') {
  const s = String(str || '').trim()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه')
    .replace(/\u200c/g, '-')
    .replace(/[^\u0600-\u06FFa-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return s || fallback || crypto.randomBytes(4).toString('hex');
}

function truncate(str, len = 120) {
  const s = String(str || '').replace(/\s+/g, ' ').trim();
  return s.length > len ? s.slice(0, len).replace(/\s\S*$/, '') + '…' : s;
}

function stripTags(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- JSON امن ---------------- */

function jparse(v, def = null) {
  if (v == null) return def;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return def; }
}
function jstringify(v) { return JSON.stringify(v ?? null); }

/* ---------------- کدها ---------------- */

function randomDigits(len = 5) {
  let out = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += String(bytes[i] % 10);
  return out;
}
function randomCode(prefix = '', len = 8) {
  return (prefix ? prefix + '-' : '') + crypto.randomBytes(len).toString('hex').slice(0, len).toUpperCase();
}
/** کد سفارش خوانا: 140406-BX7K2 */
function orderCode() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}
function uuid() { return crypto.randomUUID(); }
function hash(text) { return crypto.createHash('sha256').update(String(text)).digest('hex'); }

/* ---------------- موبایل ---------------- */

function normalizePhone(input) {
  let p = toEnglishDigits(String(input || '')).replace(/[^\d+]/g, '');
  if (p.startsWith('+98')) p = '0' + p.slice(3);
  if (p.startsWith('98') && p.length === 12) p = '0' + p.slice(2);
  if (p.startsWith('9') && p.length === 10) p = '0' + p;
  return p;
}
function isValidPhone(p) { return /^09\d{9}$/.test(normalizePhone(p)); }
function maskPhone(p) { const n = normalizePhone(p); return n.length === 11 ? n.slice(0, 4) + '***' + n.slice(-4) : n; }

/* ---------------- کارت بانکی ---------------- */

function normalizeCard(c) { return toEnglishDigits(String(c || '')).replace(/\D/g, ''); }
function luhn(card) {
  const s = normalizeCard(card);
  if (s.length !== 16) return false;
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    let d = +s[i];
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}
function maskCard(c) { const s = normalizeCard(c); return s.length === 16 ? s.slice(0, 4) + '-****-****-' + s.slice(12) : s; }

/* ---------------- آرایه/آبجکت ---------------- */

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = typeof key === 'function' ? key(item) : item[key];
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}
function unique(arr) { return [...new Set(arr)]; }
function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function sum(arr, key = (x) => x) { return arr.reduce((a, b) => a + (Number(typeof key === 'function' ? key(b) : b[key]) || 0), 0); }

/* ---------------- صفحه‌بندی ---------------- */

function paginate(total, page, perPage) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  page = Math.min(Math.max(1, page), pages);
  let from = Math.max(1, page - 2);
  let to = Math.min(pages, from + 4);
  from = Math.max(1, to - 4);
  return { total, page, perPage, pages, offset: (page - 1) * perPage, from, to, hasPrev: page > 1, hasNext: page < pages };
}

/* ---------------- زمان ---------------- */

function now() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return d; }
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }

/* ---------------- درصد ---------------- */

function percentOff(price, oldPrice) {
  if (!oldPrice || !price || oldPrice <= price) return 0;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}

/* ---------------- فایل ---------------- */

function extFromMime(mime = '') {
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'application/pdf': 'pdf' };
  return map[mime] || 'bin';
}
function humanSize(bytes) {
  const u = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
  let i = 0, n = Number(bytes) || 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return toPersianDigits(n.toFixed(i ? 1 : 0)) + ' ' + u[i];
}

module.exports = {
  toInt, toFloat, numberFormat, fa, normalizeFa, slugify, truncate, stripTags, escapeHtml,
  jparse, jstringify, randomDigits, randomCode, orderCode, uuid, hash,
  normalizePhone, isValidPhone, maskPhone, normalizeCard, luhn, maskCard,
  groupBy, unique, pick, chunk, sum, paginate, now, daysFromNow, addDays, percentOff, extFromMime, humanSize,
};
