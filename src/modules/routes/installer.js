'use strict';
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { get, run, insert, setting, setSetting, db, all } = require('../../db');
const auth = require('../../core/auth');
const seo = require('../../core/seo');
const config = require('../../config');
const { now, normalizePhone, isValidPhone, slugify, toInt } = require('../../core/utils');

/**
 * بسته نصبی آسان — ۴ مرحله:
 *  ۱) بررسی پیش‌نیازها  ۲) اطلاعات فروشگاه  ۳) حساب مدیر  ۴) دمو/پایان
 */

const LOCK = path.join(require('../../db').DATA_DIR, 'installed.lock');

function isInstalled() {
  return fs.existsSync(LOCK) || setting('installed', '0') === '1';
}

router.get('/', (req, res) => {
  if (isInstalled()) return res.redirect('/');
  res.redirect('/install/requirements');
});

router.get('/requirements', (req, res) => {
  if (isInstalled()) return res.redirect('/');
  const checks = [
    { name: 'نسخه Node.js', required: '>= 18', current: process.version, ok: parseInt(process.versions.node.split('.')[0], 10) >= 18 },
    { name: 'ماژول better-sqlite3', required: 'نصب شده', current: (() => { try { require('better-sqlite3'); return 'نصب شده'; } catch { return 'ناموجود'; } })(), ok: (() => { try { require('better-sqlite3'); return true; } catch { return false; } })() },
    { name: 'دسترسی نوشتن روی پوشه data', required: 'قابل نوشتن', current: fs.existsSync(require('../../db').DATA_DIR) && (() => { try { fs.accessSync(require('../../db').DATA_DIR, fs.constants.W_OK); return 'قابل نوشتن'; } catch { return 'غیرقابل نوشتن'; } })(), ok: (() => { try { fs.accessSync(require('../../db').DATA_DIR, fs.constants.W_OK); return true; } catch { return false; } })() },
    { name: 'دسترسی نوشتن روی پوشه uploads', required: 'قابل نوشتن', current: (() => { try { fs.accessSync(config.uploadDir, fs.constants.W_OK); return 'قابل نوشتن'; } catch { return 'غیرقابل نوشتن'; } })(), ok: (() => { try { fs.accessSync(config.uploadDir, fs.constants.W_OK); return true; } catch { return false; } })() },
    { name: 'پشتیبانی fetch (درگاه‌ها/پیامک)', required: 'Node 18+', current: typeof fetch === 'function' ? 'فعال' : 'غیرفعال', ok: typeof fetch === 'function' },
    { name: 'منطقه زمانی', required: 'تنظیم شده', current: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', ok: true },
  ];
  const allOk = checks.every((c) => c.ok);
  res.render('install/requirements', { checks, allOk, meta: seo.meta({ title: 'نصب — پیش‌نیازها', noindex: true }), step: 1, layout: false });
});

router.get('/store', (req, res) => {
  if (isInstalled()) return res.redirect('/');
  res.render('install/store', { meta: seo.meta({ title: 'نصب — اطلاعات فروشگاه', noindex: true }), step: 2, layout: false, values: req.session.install || {} });
});

router.post('/store', (req, res) => {
  if (isInstalled()) return res.redirect('/');
  const b = req.body;
  req.session.install = { ...req.session.install, ...b };
  setSetting('site_name', b.site_name || 'بالی‌وو', { group: 'general', label: 'نام فروشگاه' });
  setSetting('site_slogan', b.site_slogan || 'فروشگاه اینترنتی', { group: 'general' });
  setSetting('site_description', b.site_description || '', { group: 'general' });
  setSetting('site_phone', b.site_phone || '', { group: 'general' });
  setSetting('site_email', b.site_email || '', { group: 'general' });
  setSetting('site_address', b.site_address || '', { group: 'general' });
  setSetting('site_url', (b.site_url || `${req.protocol}://${req.get('host')}`).replace(/\/$/, ''), { group: 'general' });
  setSetting('multivendor_enabled', b.multivendor === '1' ? '1' : '0', { group: 'general' });
  setSetting('currency', b.currency || 'تومان', { group: 'general' });
  res.redirect('/install/admin');
});

router.get('/admin', (req, res) => {
  if (isInstalled()) return res.redirect('/');
  const err = req.session.installError || null;
  req.session.installError = null;
  res.render('install/admin', { meta: seo.meta({ title: 'نصب — حساب مدیر', noindex: true }), step: 3, layout: false, values: req.session.install || {}, error: err });
});

router.post('/admin', (req, res) => {
  if (isInstalled()) return res.redirect('/');
  const b = req.body;
  const phone = normalizePhone(b.phone);
  if (!isValidPhone(phone)) { req.session.installError = 'شماره موبایل معتبر نیست (مثال: ۰۹۱۲۱۲۳۴۵۶۷)'; return res.redirect('/install/admin'); }
  if (String(b.password || '').length < 6) { req.session.installError = 'گذرواژه حداقل ۶ کاراکتر باشد.'; return res.redirect('/install/admin'); }

  // فروشگاه اصلی
  let mainSeller = get('SELECT * FROM sellers WHERE is_main=1');
  if (!mainSeller) {
    const sid = insert('sellers', { shop_name: b.site_name || 'بالی‌وو', shop_slug: slugify(b.site_name || 'balewoo'), is_main: 1, status: 'active', commission: 0, created_at: now(), updated_at: now() });
    mainSeller = get('SELECT * FROM sellers WHERE id=@id', { id: sid });
  }

  let adminUser = get('SELECT * FROM users WHERE phone=@p', { p: phone });
  if (!adminUser) {
    const id = auth.createUser({ phone, name: b.name || 'مدیر کل', email: b.email, password: b.password, role: 'admin', status: 'active' });
    adminUser = auth.findUser(id);
  } else {
    run(`UPDATE users SET role='admin', name=@n, password_hash=@h, status='active' WHERE id=@id`, { n: b.name || adminUser.name, h: auth.hashPassword(b.password), id: adminUser.id });
    adminUser = auth.findUser(adminUser.id);
  }

  // نقش پیش‌فرض مدیر کل
  const role = get(`SELECT * FROM roles WHERE slug='super-admin'`);
  if (role) run('UPDATE users SET role_id=@r WHERE id=@id', { r: role.id, id: adminUser.id });

  req.session.installAdmin = { id: adminUser.id };
  setSetting('sms_driver', b.sms_driver || 'mock', { group: 'sms' });
  setSetting('payment_sandbox', '1', { group: 'payment' });
  setSetting('gateways_enabled', 'zarinpal,zibal,nextpay,snappay,torobpay,card2card,wallet,cod', { group: 'payment' });
  setSetting('vat_percent', b.vat || '0', { group: 'general' });
  setSetting('club_point_per_toman', '1000', { group: 'club' });
  setSetting('club_point_value', '100', { group: 'club' });
  setSetting('club_max_use_percent', '20', { group: 'club' });
  setSetting('seller_default_commission', '5', { group: 'seller' });
  setSetting('seller_default_settlement', '7', { group: 'seller' });
  setSetting('min_withdraw_amount', '50000', { group: 'finance' });
  setSetting('min_seller_withdraw', '500000', { group: 'finance' });

  res.redirect('/install/demo');
});

router.get('/demo', (req, res) => {
  if (isInstalled()) return res.redirect('/');
  const err = req.session.installError || null;
  req.session.installError = null;
  res.render('install/demo', { meta: seo.meta({ title: 'نصب — داده نمونه', noindex: true }), step: 4, layout: false, error: err });
});

router.post('/demo', async (req, res) => {
  if (isInstalled()) return res.redirect('/');
  req.session.installError = null;
  if (req.body.seed === '1') {
    try {
      const seed = require('../../db/seed');
      const result = await seed.run({ adminId: req.session.installAdmin?.id, demo: req.body.volume || 'medium' });
      req.session.seedResult = result;
    } catch (e) {
      req.session.installError = 'خطا در ساخت داده نمونه: ' + e.message;
      return res.redirect('/install/demo');
    }
  }
  setSetting('installed', '1', { group: 'system' });
  setSetting('app_version', '1.0.0', { group: 'system' });
  setSetting('installed_at', now(), { group: 'system' });
  fs.writeFileSync(LOCK, now(), 'utf8');

  // منوی پیش‌فرض
  if (!get(`SELECT id FROM menus WHERE location='header'`)) {
    const mid = insert('menus', { title: 'منوی اصلی', location: 'header', created_at: now() });
    const items = [['صفحه نخست', '/'], ['آرشیو محصولات', '/products'], ['مجله', '/blog'], ['پرسش‌های متداول', '/faq'], ['فروشنده شوید', '/auth/seller/register'], ['تماس با ما', '/form/contact-us']];
    items.forEach(([title, url], i) => insert('menu_items', { menu_id: mid, title, url, sort: i, status: 'active' }));
    const fid = insert('menus', { title: 'منوی فوتر', location: 'footer', created_at: now() });
    [['درباره ما', '/page/about-us'], ['قوانین و شرایط', '/page/terms'], ['حریم خصوصی', '/page/privacy'], ['تماس با ما', '/form/contact-us'], ['مجله', '/blog']].forEach(([title, url], i) => insert('menu_items', { menu_id: fid, title, url, sort: i, status: 'active' }));
  }

  const admin = req.session.installAdmin ? auth.findUser(req.session.installAdmin.id) : null;
  if (admin) auth.login(req, res, admin);
  res.redirect('/install/done');
});

router.get('/done', (req, res) => {
  if (!isInstalled()) return res.redirect('/install');
  res.render('install/done', { meta: seo.meta({ title: 'نصب کامل شد', noindex: true }), step: 5, layout: false, result: req.session.seedResult || null });
});

/** صفحه بررسی نصب (برای دسترسی سریع بعد از نصب) */
router.get('/status', (req, res) => {
  res.json({
    installed: isInstalled(),
    version: setting('app_version', '1.0.0'),
    node: process.version,
    db: require('../../db').DB_FILE,
    settings: Object.keys(setting('installed', '0') === '1' ? {} : {}).length,
    tables: db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all().map((r) => r.name).length,
  });
});

module.exports = router;
module.exports.isInstalled = isInstalled;
