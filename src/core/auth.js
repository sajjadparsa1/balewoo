'use strict';
const bcrypt = require('bcryptjs');
const config = require('../config');
const { get, insert, update, run, all, setting } = require('../db');
const { now, randomDigits, normalizePhone, isValidPhone, jparse } = require('./utils');
const activity = require('./activity');
const notify = require('./notify');
const sms = require('../services/sms');
const { toPersianDigits } = require('./jalali');

/* ---------------- ابزار ورود ---------------- */

function hashPassword(plain) { return bcrypt.hashSync(String(plain), 10); }
function checkPassword(plain, hash) { try { return bcrypt.compareSync(String(plain), String(hash || '')); } catch { return false; } }

function parseUA(ua = '') {
  const s = String(ua);
  let browser = 'نامشخص', os = 'نامشخص', device = 'دسکتاپ';
  if (/Edg\//i.test(s)) browser = 'Edge'; else if (/OPR\//i.test(s)) browser = 'Opera';
  else if (/Chrome\//i.test(s) && !/Chromium/i.test(s)) browser = 'Chrome';
  else if (/Firefox\//i.test(s)) browser = 'Firefox';
  else if (/Safari\//i.test(s)) browser = 'Safari';
  if (/Windows NT/i.test(s)) os = 'Windows'; else if (/Android/i.test(s)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(s)) os = 'iOS'; else if (/Mac OS X/i.test(s)) os = 'macOS';
  else if (/Linux/i.test(s)) os = 'Linux';
  if (/Mobile|Android|iPhone/i.test(s)) device = 'موبایل'; else if (/iPad|Tablet/i.test(s)) device = 'تبلت';
  return { browser, os, device };
}

function geoLabel(ip = '') {
  if (!ip || ip === '::1' || /^127\./.test(ip) || /^::ffff:127/.test(ip)) return { city: 'محلی', country: '—' };
  if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(ip.replace('::ffff:', ''))) return { city: 'شبکه داخلی', country: '—' };
  return { city: 'نامشخص', country: 'ایران' };
}

function recordSession(req, user) {
  const ua = parseUA(req.headers['user-agent']);
  const geo = geoLabel(req.ip);
  const sid = req.sessionID || null;
  run('UPDATE user_sessions SET is_current=0 WHERE user_id=@u', { u: user.id });
  const existing = sid ? get('SELECT * FROM user_sessions WHERE sid=@s', { s: sid }) : null;
  if (existing) {
    update('user_sessions', existing.id, { user_id: user.id, ip: req.ip, city: geo.city, country: geo.country, device: ua.device, browser: ua.browser, os: ua.os, is_current: 1, last_seen_at: now() });
    return existing.id;
  }
  return insert('user_sessions', {
    user_id: user.id, sid, ip: req.ip, city: geo.city, country: geo.country,
    device: ua.device, browser: ua.browser, os: ua.os, is_current: 1,
    login_at: now(), last_seen_at: now(),
  });
}

function sessionsOf(userId) { return all('SELECT * FROM user_sessions WHERE user_id=@u ORDER BY is_current DESC, id DESC', { u: userId }); }
function revokeSession(id, userId) { return run('UPDATE user_sessions SET revoked_at=@t WHERE id=@id AND user_id=@u', { t: now(), id, u: userId }).changes; }

/* ---------------- OTP ---------------- */

function issueOtp(req, phone, purpose = 'login') {
  const p = normalizePhone(phone);
  const ttl = parseInt(setting('otp_ttl', String(Math.round(config.otp.ttlSeconds / 60))), 10) || 2;
  const code = config.otp.devFixedCode && setting('sms_driver', config.sms.driver) === 'mock' ? config.otp.devFixedCode : randomDigits(setting('otp_length', 5));
  const expires = new Date(Date.now() + ttl * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  run(`DELETE FROM otp_codes WHERE phone=@p AND purpose=@pu AND consumed_at IS NULL`, { p, pu: purpose });
  const id = insert('otp_codes', { phone: p, code, purpose, expires_at: expires, created_at: now() });
  activity.log({ id: null, role: 'guest' }, 'otp_sent', { ip: req?.ip, description: `ارسال کد ورود به ${p}`, meta: { purpose } });
  sms.sendOtp(p, code);
  return { id, code, phone: p, ttl, expires_at: expires, dev: setting('sms_driver', config.sms.driver) === 'mock' ? code : null };
}

function verifyOtp(phone, code, purpose = 'login') {
  const p = normalizePhone(phone);
  const row = get(`SELECT * FROM otp_codes WHERE phone=@p AND purpose=@pu AND consumed_at IS NULL ORDER BY id DESC LIMIT 1`, { p, pu: purpose });
  if (!row) return { ok: false, error: 'کدی ارسال نشده است. مجدداً درخواست دهید.' };
  if (new Date(row.expires_at.replace(' ', 'T') + 'Z') < new Date()) return { ok: false, error: 'کد منقضی شده است.' };
  if (row.attempts >= setting('otp_max_attempts', 5)) return { ok: false, error: 'تعداد تلاش بیش از حد مجاز است.' };
  if (String(row.code) !== String(code).trim()) {
    run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id=@id', { id: row.id });
    return { ok: false, error: 'کد واردشده صحیح نیست.' };
  }
  run('UPDATE otp_codes SET consumed_at=@t WHERE id=@id', { t: now(), id: row.id });
  return { ok: true, otp: row };
}

/* ---------------- کاربر ---------------- */

function findUser(id) {
  const u = get(`SELECT u.*, s.shop_name, s.shop_slug, s.status AS seller_status, r.name AS role_name
                 FROM users u LEFT JOIN sellers s ON s.id=u.seller_id LEFT JOIN roles r ON r.id=u.role_id
                 WHERE u.id=@id`, { id });
  return u ? attachFlags(u) : null;
}
function findUserByPhone(phone) {
  const u = get('SELECT * FROM users WHERE phone=@p AND deleted_at IS NULL', { p: normalizePhone(phone) });
  return u ? attachFlags(u) : null;
}
function attachFlags(u) {
  if (!u) return u;
  u.is_super = u.role === 'admin';
  u.is_staff = u.role === 'admin' || u.role === 'staff';
  u.is_seller_user = u.role === 'seller' && !!u.seller_id;
  u.permissions = u.role_id ? jparse(get('SELECT permissions FROM roles WHERE id=@id', { id: u.role_id })?.permissions, []) : (u.is_super ? ['*'] : []);
  return u;
}

function createUser({ phone, name = '', email = '', password = null, role = 'customer', role_id = null, seller_id = null, referrer_id = null, status = 'active' }) {
  const { randomCode } = require('./utils');
  const id = insert('users', {
    phone: normalizePhone(phone) || null, name, email: email || null,
    password_hash: password ? hashPassword(password) : null,
    role, role_id, seller_id, status, referrer_id: referrer_id || null,
    affiliate_code: 'AF' + randomCode('', 6).replace('-', ''),
    created_at: now(), updated_at: now(),
  });
  if (referrer_id) {
    run('INSERT OR IGNORE INTO affiliate_referrals(affiliate_id,user_id,level,created_at) VALUES(@a,@u,1,@t)', { a: referrer_id, u: id, t: now() });
  }
  return id;
}

function login(req, res, user, opts = {}) {
  req.session.userId = user.id;
  req.session.loginAt = Date.now();
  if (opts.remember) req.session.cookie.maxAge = 30 * 24 * 3600 * 1000;
  run('UPDATE users SET login_count = login_count + 1, last_login_at=@t, last_seen_at=@t WHERE id=@id', { t: now(), id: user.id });
  recordSession(req, user);
  activity.log(user, 'login', { ip: req.ip, description: `${user.name || user.phone} وارد شد` });
  return user;
}

function logout(req) {
  const user = req.user;
  if (user) {
    run('UPDATE user_sessions SET revoked_at=@t WHERE sid=@s', { t: now(), s: req.sessionID });
    activity.log(user, 'logout', { ip: req.ip });
  }
  req.session.destroy(() => {});
}

/* ---------------- میانه‌واره‌ها ---------------- */

function loadUser(req, res, next) {
  res.locals.currentUrl = req.originalUrl;
  res.locals.settings = require('../db').loadSettings();
  res.locals.query = req.query;
  res.locals.flash = req.session.flash || null;
  req.session.flash = null;
  res.locals.notifyCount = 0;
  res.locals.cartCount = 0;

  const uid = req.session.userId;
  req.user = uid ? findUser(uid) : null;
  if (req.user) {
    res.locals.notifyCount = notify.unreadCount(req.user.id);
    run('UPDATE users SET last_seen_at=@t WHERE id=@id', { t: now(), id: req.user.id });
  }
  res.locals.user = req.user;
  res.locals.currentUser = req.user;

  // شمارنده سبد
  try {
    const cart = require('../modules/cart').currentCart(req);
    if (cart) {
      const r = get('SELECT COALESCE(SUM(qty),0) AS c FROM cart_items WHERE cart_id=@id', { id: cart.id });
      res.locals.cartCount = r.c;
      res.locals.cart = cart;
    }
  } catch { /* ignore */ }

  next();
}

function requireLogin(req, res, next) {
  if (req.user) return next();
  if (req.xhr || req.path.startsWith('/api/')) return res.status(401).json({ error: 'unauthorized' });
  req.session.returnTo = req.originalUrl;
  req.session.flash = { type: 'warning', message: 'برای دسترسی به این بخش ابتدا وارد حساب خود شوید.' };
  res.redirect('/login?prev=' + encodeURIComponent(req.originalUrl));
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return requireLogin(req, res, next);
    if (!roles.includes(req.user.role)) {
      if (req.xhr || req.path.startsWith('/api/')) return res.status(403).json({ error: 'forbidden' });
      return res.status(403).render('errors/403', { meta: { title: 'دسترسی غیرمجاز' } });
    }
    next();
  };
}

const acl = require('./acl');
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return requireLogin(req, res, next);
    if (!req.user.is_staff) {
      return res.status(403).render('errors/403', { meta: { title: 'دسترسی غیرمجاز' } });
    }
    if (!acl.can(req.user, permission)) {
      activity.log(req.user, 'permission_denied', { ip: req.ip, description: `تلاش برای دسترسی به ${permission}` });
      return res.status(403).render('errors/403', { meta: { title: 'دسترسی به این بخش را ندارید' }, permission });
    }
    next();
  };
}

function requireSeller(req, res, next) {
  if (!req.user) return requireLogin(req, res, next);
  if (!req.user.seller_id) {
    req.session.flash = { type: 'warning', message: 'حساب شما به فروشگاهی متصل نیست.' };
    return res.redirect('/auth/seller/register');
  }
  const seller = get('SELECT * FROM sellers WHERE id=@id', { id: req.user.seller_id });
  if (!seller || seller.status === 'blocked') {
    return res.status(403).render('errors/403', { meta: { title: 'فروشگاه شما مسدود است' } });
  }
  req.seller = seller;
  res.locals.seller = seller;
  next();
}

function flash(req, type, message) { req.session.flash = { type, message }; }

module.exports = {
  hashPassword, checkPassword, parseUA, recordSession, sessionsOf, revokeSession,
  issueOtp, verifyOtp, findUser, findUserByPhone, createUser, login, logout, attachFlags,
  loadUser, requireLogin, requireRole, requirePermission, requireSeller, flash, isValidPhone,
};
