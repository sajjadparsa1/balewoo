'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const { insert, all, get, run, db } = require('../db');
const { now, slugify, extFromMime, humanSize, toInt } = require('./utils');
const { formatJalali } = require('./jalali');

/**
 * کتابخانه مدیا — بارگذاری، پوشه‌بندی، برش، واترمارک و بهینه‌سازی
 * تصاویر در پوشه‌های سالانه/ماهانه سازماندهی می‌شوند:
 *   /uploads/library/2026-09/<userId>/<file>
 */

fs.mkdirSync(config.uploadDir, { recursive: true });

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'video/mp4', 'video/webm', 'application/pdf', 'application/zip'];

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const d = new Date();
    const owner = req.user?.id || 0;
    const dir = path.join(config.uploadDir, 'library', `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, String(owner));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = (file.originalname.split('.').pop() || extFromMime(file.mimetype)).toLowerCase().replace(/[^a-z0-9]/g, '');
    cb(null, `file.${Date.now()}.${crypto.randomBytes(3).toString('hex')}.${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 12 },
  fileFilter(req, file, cb) {
    if (!ALLOWED.includes(file.mimetype)) return cb(new Error('نوع فایل مجاز نیست: ' + file.mimetype));
    cb(null, true);
  },
});

function relativeUrl(absPath) {
  const rel = path.relative(config.publicDir, absPath).split(path.sep).join('/');
  return '/' + rel;
}

/** ثبت فایل بارگذاری‌شده در کتابخانه */
function register(file, { userId = null, ownerType = 'admin', folder = '/', alt = '' } = {}) {
  const url = relativeUrl(file.path);
  const id = insert('media', {
    user_id: userId, owner_type: ownerType, folder,
    filename: file.originalname, path: url, mime: file.mimetype,
    size: file.size, alt: alt || file.originalname, created_at: now(),
  });
  return { id, url, size: file.size, mime: file.mimetype, name: file.originalname };
}

function list({ folder = null, q = '', limit = 60, offset = 0, userId = null } = {}) {
  const clauses = [];
  const params = { l: limit, o: offset };
  if (folder) { clauses.push('folder = @folder'); params.folder = folder; }
  if (userId) { clauses.push('user_id = @uid'); params.uid = userId; }
  if (q) { clauses.push('(filename LIKE @q OR alt LIKE @q)'); params.q = `%${q}%`; }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const rows = all(`SELECT * FROM media ${where} ORDER BY id DESC LIMIT @l OFFSET @o`, params);
  const total = get(`SELECT COUNT(*) AS c FROM media ${where}`, params).c;
  return { rows, total };
}

function find(id) { return get('SELECT * FROM media WHERE id=@id', { id }); }
function folders() { return all('SELECT DISTINCT folder FROM media ORDER BY folder'); }

function destroy(id) {
  const m = find(id);
  if (!m) return 0;
  const abs = path.join(config.publicDir, m.path);
  try { if (fs.existsSync(abs)) fs.unlinkSync(abs); } catch { /* ignore */ }
  return run('DELETE FROM media WHERE id=@id', { id }).changes;
}

function updateMedia(id, data) { return run('UPDATE media SET alt=@alt, folder=@folder WHERE id=@id', { alt: data.alt ?? '', folder: data.folder ?? '/', id }).changes; }

/* ---------------- پردازش تصویر (بدون وابستگی خارجی) ---------------- */

/**
 * برش/تغییر اندازه سرور-ساید برای SVG و تصاویر ساده ممکن نیست بدون کتابخانه تصویر؛
 * بنابراین برش و واترمارک به‌صورت «تولید نسخه نمایشی» با CSS انجام می‌شود و
 * در دیتابیس علامت‌گذاری می‌گردد. برای پردازش واقعی می‌توان sharp را افزود.
 */
async function processImage(mediaId, { crop = null, watermark = false, quality = 85 } = {}) {
  const m = find(mediaId);
  if (!m) return null;
  return run('UPDATE media SET watermark=@w WHERE id=@id', { w: watermark ? 1 : 0, id: mediaId }).changes;
}

/** تولید placeholder SVG برای محصولاتی که تصویر ندارند */
function placeholder({ text = 'بالی‌وو', w = 600, h = 600, bg = '#eef2ff', fg = '#4f46e5', file = null }) {
  const safe = String(text).replace(/[<>&]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${bg}"/><stop offset="100%" stop-color="${fg}" stop-opacity="0.18"/>
  </linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <g font-family="Tahoma, Vazirmatn, sans-serif" text-anchor="middle" direction="rtl">
    <text x="50%" y="48%" font-size="${Math.round(w / 16)}" fill="${fg}" font-weight="bold">${safe.slice(0, 28)}</text>
    <text x="50%" y="60%" font-size="${Math.round(w / 34)}" fill="${fg}" opacity="0.65">بالی‌وو شاپ</text>
  </g>
</svg>`;
  const name = file || `ph-${crypto.randomBytes(4).toString('hex')}.svg`;
  const dir = path.join(config.publicDir, 'img', 'placeholders');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), svg, 'utf8');
  return `/img/placeholders/${name}`;
}

function stats() {
  return get(`SELECT COUNT(*) AS files, COALESCE(SUM(size),0) AS bytes FROM media`);
}

module.exports = { upload, register, list, find, folders, destroy, updateMedia, processImage, placeholder, stats, relativeUrl, ALLOWED, humanSize };
