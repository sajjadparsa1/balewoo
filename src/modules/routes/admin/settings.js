'use strict';
const express = require('express');
const router = express.Router();
const { all, get, insert, update, run, db, jparse, jstringify, setting, setSetting, setMany, loadSettings } = require('../../../db');
const auth = require('../../../core/auth');
const activity = require('../../../core/activity');
const notify = require('../../../core/notify');
const media = require('../../../core/media');
const catalog = require('../../../core/catalog');
const payment = require('../../../services/payment');
const smsService = require('../../../services/sms');
const cache = require('../../../core/cache');
const config = require('../../../config');
const { now, toInt, toFloat, numberFormat, slugify } = require('../../../core/utils');
const { toPersianDigits } = require('../../../core/jalali');

/* ================= تنظیمات عمومی ================= */

router.get('/general', auth.requirePermission('settings.view'), (req, res) => {
  res.locals.pageTitle = 'تنظیمات عمومی';
  res.render('admin/settings/general', { groups: loadSettings() });
});

router.post('/general', auth.requirePermission('settings.manage'), (req, res) => {
  const allowed = [
    'site_name', 'site_slogan', 'site_description', 'site_keywords', 'site_phone', 'site_email', 'site_address',
    'site_postal_code', 'site_url', 'currency', 'multivendor_enabled', 'seller_registration_enabled', 'seller_auto_approve',
    'seller_default_commission', 'seller_default_settlement', 'seller_products_need_approval', 'seller_posts_need_approval',
    'comment_moderation', 'review_moderation', 'question_moderation', 'low_stock_threshold', 'vat_percent', 'vat_on_shipping',
    'cod_fee', 'free_shipping_above', 'min_withdraw_amount', 'min_seller_withdraw', 'club_point_per_toman', 'club_point_value',
    'club_max_use_percent', 'club_register_points', 'club_review_points', 'otp_length', 'otp_ttl', 'otp_resend_wait',
    'shop_economic_code', 'shop_national_id', 'social_instagram', 'social_telegram', 'social_whatsapp', 'social_linkedin',
    'enamad_code', 'trust_note', 'theme_color', 'dark_mode_enabled', 'cache_enabled', 'cache_ttl',
  ];
  for (const key of allowed) {
    if (req.body[key] !== undefined) setSetting(key, req.body[key] === 'on' ? '1' : req.body[key], { group: 'general', label: key });
  }
  // چک‌باکس‌ها
  for (const key of ['multivendor_enabled', 'seller_registration_enabled', 'dark_mode_enabled', 'cache_enabled']) {
    if (req.body[key] === undefined && req.body.__form === 'general') setSetting(key, '0', { group: 'general' });
  }
  cache.flush();
  activity.logReq(req, 'settings_update', { description: 'تنظیمات عمومی' });
  auth.flash(req, 'success', 'تنظیمات ذخیره شد.');
  res.redirect('/admin/settings/general');
});

/* ---------------- لوگو و تصاویر ---------------- */

router.post('/branding', auth.requirePermission('settings.manage'), media.upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'logo_dark', maxCount: 1 }, { name: 'favicon', maxCount: 1 }, { name: 'og_image', maxCount: 1 }]), (req, res) => {
  const map = { logo: 'site_logo', logo_dark: 'site_logo_dark', favicon: 'site_favicon', og_image: 'site_og_image' };
  for (const [field, key] of Object.entries(map)) {
    if (req.files?.[field]?.[0]) setSetting(key, media.register(req.files[field][0], { userId: req.user.id, folder: '/branding' }).url, { group: 'branding' });
    else if (req.body[field + '_url'] !== undefined) setSetting(key, req.body[field + '_url'], { group: 'branding' });
  }
  if (req.body.login_bg_url !== undefined) setSetting('login_bg', req.body.login_bg_url, { group: 'branding' });
  cache.flush();
  auth.flash(req, 'success', 'هویت بصری ذخیره شد.');
  res.redirect('/admin/settings/general');
});

/* ================= سئو ================= */

router.get('/seo', auth.requirePermission('seo.manage'), (req, res) => {
  res.locals.pageTitle = 'تنظیمات سئو';
  res.render('admin/settings/seo', {});
});

router.post('/seo', auth.requirePermission('seo.manage'), (req, res) => {
  for (const key of ['home_seo_title', 'home_seo_desc', 'seo_default_title', 'seo_default_desc', 'seo_keywords', 'google_analytics', 'google_tag_manager', 'schema_enabled', 'sitemap_enabled', 'robots_extra']) {
    if (req.body[key] !== undefined) setSetting(key, req.body[key], { group: 'seo' });
  }
  cache.flush();
  activity.logReq(req, 'settings_update', { description: 'تنظیمات سئو' });
  auth.flash(req, 'success', 'تنظیمات سئو ذخیره شد.');
  res.redirect('/admin/settings/seo');
});

/* ================= درگاه‌های پرداخت ================= */

router.get('/gateways', auth.requirePermission('gateways.manage'), (req, res) => {
  res.locals.pageTitle = 'درگاه‌های پرداخت';
  const enabled = setting('gateways_enabled', 'zarinpal,zibal,nextpay,snappay,torobpay,card2card,wallet,cod').split(',');
  res.render('admin/settings/gateways', {
    gateways: payment.listGateways().map((g) => ({ ...g, enabled: enabled.includes(g.key), settings: Object.fromEntries(g.fields.map((f) => [f, setting(`gw_${g.key}_${f}`, '')])) })),
    transactions: all('SELECT t.*, u.phone FROM transactions t LEFT JOIN users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 30'),
  });
});

router.post('/gateways', auth.requirePermission('gateways.manage'), (req, res) => {
  const enabled = [].concat(req.body.enabled || []).filter(Boolean);
  setSetting('gateways_enabled', enabled.join(','), { group: 'payment' });
  setSetting('payment_sandbox', req.body.sandbox ? '1' : '0', { group: 'payment' });
  setSetting('default_gateway', req.body.default_gateway || 'zarinpal', { group: 'payment' });
  // ذخیره کلیدها
  for (const g of payment.listGateways()) {
    for (const f of g.fields) {
      const key = `gw_${g.key}_${f}`;
      if (req.body[key] !== undefined) setSetting(key, req.body[key], { group: 'payment' });
    }
  }
  // اطلاعات کارت به کارت
  for (const key of ['c2c_card_number', 'c2c_owner_name', 'c2c_bank_name', 'c2c_note', 'cod_max_amount']) {
    if (req.body[key] !== undefined) setSetting(key, req.body[key], { group: 'payment' });
  }
  cache.flush();
  activity.logReq(req, 'gateways_update', { description: 'درگاه‌های پرداخت' });
  auth.flash(req, 'success', 'تنظیمات درگاه‌ها ذخیره شد.');
  res.redirect('/admin/settings/gateways');
});

/* ================= پیامک ================= */

router.get('/sms', auth.requirePermission('gateways.manage'), (req, res) => {
  res.locals.pageTitle = 'درگاه‌های پیامکی';
  res.render('admin/settings/sms', { drivers: smsService.listDrivers(), logs: smsService.logs(60) });
});

router.post('/sms', auth.requirePermission('gateways.manage'), (req, res) => {
  setSetting('sms_enabled', req.body.sms_enabled ? '1' : '0', { group: 'sms' });
  setSetting('sms_driver', req.body.sms_driver || 'mock', { group: 'sms' });
  for (const key of ['sms_kavenegar_key', 'sms_kavenegar_sender', 'sms_kavenegar_template', 'sms_ghasedak_key', 'sms_ghasedak_line',
    'sms_melipayamak_user', 'sms_melipayamak_pass', 'sms_melipayamak_from', 'sms_smsir_key', 'sms_smsir_template',
    'sms_ippanel_key', 'sms_ippanel_sender', 'sms_ippanel_pattern', 'sms_mediana_key', 'sms_mediana_sender', 'sms_otp_template',
    'sms_notify_order', 'sms_notify_shipping', 'sms_notify_seller']) {
    if (req.body[key] !== undefined) setSetting(key, req.body[key], { group: 'sms' });
  }
  cache.flush();
  auth.flash(req, 'success', 'تنظیمات پیامک ذخیره شد.');
  res.redirect('/admin/settings/sms');
});

router.post('/sms/test', auth.requirePermission('gateways.manage'), async (req, res) => {
  const r = await smsService.send({ phone: req.body.phone, body: req.body.body || 'تست ارسال پیامک از بالی‌وو' });
  auth.flash(req, r.ok ? 'success' : 'danger', r.ok ? 'پیامک ارسال شد (در حالت mock فقط لاگ می‌شود).' : ('خطا: ' + (r.error || 'نامشخص')));
  res.redirect('/admin/settings/sms');
});

/* ================= نرخ ارز ================= */

router.get('/currency', auth.requirePermission('currency.manage'), (req, res) => {
  res.locals.pageTitle = 'نرخ ارز';
  res.render('admin/settings/currency', { currencies: all('SELECT * FROM currencies ORDER BY is_base DESC, id ASC') });
});

router.post('/currency', auth.requirePermission('currency.manage'), (req, res) => {
  const b = req.body;
  if (b.action === 'save') {
    const data = { code: b.code, title: b.title, rate: toInt(b.rate), is_base: b.is_base ? 1 : 0 };
    if (b.id) update('currencies', toInt(b.id), { ...data, updated_at: now() });
    else insert('currencies', { ...data, updated_at: now() });
    if (b.is_base) run('UPDATE currencies SET is_base=0 WHERE code<>@c', { c: b.code });
    auth.flash(req, 'success', 'نرخ ارز ذخیره شد.');
  } else if (b.action === 'reprice') {
    const rate = toFloat(b.rate, 1);
    const n = catalog.repriceByCurrency(rate);
    activity.logReq(req, 'currency_update', { description: `بروزرسانی ${n} محصول با نرخ ${rate}` });
    auth.flash(req, 'success', `قیمت ${toPersianDigits(n)} محصول بر اساس نرخ ارز جدید بروزرسانی شد.`);
  } else if (b.action === 'delete') {
    run('DELETE FROM currencies WHERE id=@id', { id: toInt(b.id) });
  }
  res.redirect('/admin/settings/currency');
});

/* ================= نقشه و موقعیت ================= */

router.get('/map', auth.requirePermission('settings.manage'), (req, res) => {
  res.locals.pageTitle = 'نقشه و موقعیت';
  res.render('admin/settings/map', { provinces: all('SELECT * FROM provinces ORDER BY name') });
});
router.post('/map', auth.requirePermission('settings.manage'), (req, res) => {
  for (const key of ['map_enabled', 'map_provider', 'neshan_api_key', 'map_default_lat', 'map_default_lng', 'map_default_zoom']) {
    if (req.body[key] !== undefined) setSetting(key, req.body[key], { group: 'map' });
  }
  auth.flash(req, 'success', 'تنظیمات نقشه ذخیره شد.');
  res.redirect('/admin/settings/map');
});

/* ================= خدمات منزل (ویجت‌ها) ================= */

router.get('/widgets', auth.requirePermission('settings.manage'), (req, res) => {
  res.locals.pageTitle = 'ویجت‌های فروشگاه';
  res.render('admin/settings/widgets', { services: jparse(setting('home_services', '[]'), []), topSearches: catalog.topSearches(20) });
});
router.post('/widgets', auth.requirePermission('settings.manage'), (req, res) => {
  const services = [].concat(req.body.service_titles || []).map((t, i) => ({ icon: [].concat(req.body.service_icons || [])[i] || 'check', title: t, text: [].concat(req.body.service_texts || [])[i] || '' })).filter((s) => s.title);
  setSetting('home_services', JSON.stringify(services), { group: 'widgets', type: 'json' });
  if (req.body.searches) {
    for (const term of String(req.body.searches).split('\n').map((t) => t.trim()).filter(Boolean)) {
      run(`INSERT INTO search_terms(term,count,last_at) VALUES(@t,@c,@n) ON CONFLICT(term) DO UPDATE SET count=@c`, { t: term, c: toInt(req.body.search_count, 10), n: now() });
    }
  }
  cache.flush();
  auth.flash(req, 'success', 'ویجت‌ها ذخیره شد.');
  res.redirect('/admin/settings/widgets');
});

module.exports = router;
