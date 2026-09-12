'use strict';
const express = require('express');
const router = express.Router();
const { all, get, insert, update, run, jparse, jstringify, setting } = require('../../db');
const auth = require('../../core/auth');
const seo = require('../../core/seo');
const notify = require('../../core/notify');
const activity = require('../../core/activity');
const media = require('../../core/media');
const { now, normalizePhone, isValidPhone, slugify, toInt, randomCode, numberFormat } = require('../../core/utils');
const { toPersianDigits } = require('../../core/jalali');
const payment = require('../../services/payment');

/* ---------------- ورود / ثبت‌نام یکپارچه ---------------- */

router.get('/login', (req, res) => {
  if (req.user) return res.redirect(req.query.prev || panelFor(req.user));
  if (req.query.reset) { req.session.otpPhone = null; req.session.otpResendAt = null; req.session.otpDev = null; }
  const step = req.query.status === 'password' ? 'password' : (req.session.otpPhone ? 'code' : 'phone');
  res.render('auth/login', {
    meta: seo.meta({ title: 'ورود به حساب', noindex: true }),
    step, phone: req.session.otpPhone || '', resendIn: req.session.otpResendAt ? Math.max(0, Math.round((req.session.otpResendAt - Date.now()) / 1000)) : 0,
    prev: req.query.prev || req.session.returnTo || '',
    ttl: setting('otp_ttl', 2),
  });
});

router.post('/login/send-code', (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!isValidPhone(phone)) { auth.flash(req, 'danger', 'شماره موبایل معتبر نیست (مثال: ۰۹۱۲۱۲۳۴۵۶۷)'); return res.redirect('/login'); }
  if (req.session.otpResendAt && Date.now() < req.session.otpResendAt) {
    auth.flash(req, 'warning', 'کمی صبر کنید تا امکان ارسال مجدد فعال شود.');
    return res.redirect('/login');
  }
  const otp = auth.issueOtp(req, phone, 'login');
  req.session.otpPhone = phone;
  req.session.otpResendAt = Date.now() + (parseInt(setting('otp_resend_wait', '90'), 10) * 1000);
  req.session.otpDev = otp.dev;
  activity.log(null, 'otp_sent', { ip: req.ip, description: `ارسال کد به ${phone}` });
  if (req.xhr) return res.json({ ok: true, devCode: otp.dev, ttl: otp.ttl });
  auth.flash(req, 'success', `کد ${toPersianDigits(setting('otp_length', 5))} رقمی به ${phone} ارسال شد.` + (otp.dev ? ` (حالت آزمایشی — کد: ${otp.dev})` : ''));
  res.redirect('/login');
});

router.post('/login/verify', (req, res) => {
  const phone = req.session.otpPhone || normalizePhone(req.body.phone);
  const result = auth.verifyOtp(phone, req.body.code, 'login');
  if (!result.ok) {
    if (req.xhr) return res.status(400).json(result);
    auth.flash(req, 'danger', result.error);
    return res.redirect('/login');
  }
  let user = auth.findUserByPhone(phone);
  let isNew = false;
  if (!user) {
    const id = auth.createUser({ phone, role: 'customer', referrer_id: req.session.referrerId || null });
    user = auth.findUser(id);
    isNew = true;
    notify.push(id, notify.T.welcome(user.name));
    activity.log(user, 'register', { ip: req.ip, description: 'ثبت‌نام با شماره موبایل' });
    // پاداش ثبت‌نام
    const bonus = toInt(setting('club_register_points', '50'), 0);
    if (bonus > 0) {
      run('UPDATE users SET points = points + @p WHERE id=@id', { p: bonus, id });
      insert('club_activities', { user_id: id, points: bonus, reason: 'register', created_at: now() });
    }
  }
  if (user.status === 'blocked') {
    auth.flash(req, 'danger', 'حساب شما مسدود است. با پشتیبانی تماس بگیرید.');
    return res.redirect('/login');
  }
  auth.login(req, res, user);
  req.session.otpPhone = null; req.session.otpResendAt = null; req.session.otpDev = null;
  // انتقال سبد مهمان به کاربر
  const c = get('SELECT * FROM carts WHERE session_id=@s AND user_id IS NULL', { s: req.sessionID });
  if (c) run('UPDATE carts SET user_id=@u WHERE id=@id', { u: user.id, id: c.id });

  const prev = req.session.returnTo || req.query.prev;
  req.session.returnTo = null;
  if (req.xhr) return res.json({ ok: true, redirect: prev || panelFor(user) });
  auth.flash(req, 'success', isNew ? 'حساب شما ساخته شد. خوش آمدید!' : 'خوش آمدید!');
  res.redirect(prev || panelFor(user));
});

router.post('/login/password', (req, res) => {
  const identifier = String(req.body.identifier || '').trim();
  const user = /^0?9\d{9}$/.test(identifier.replace(/\s/g, '')) ? auth.findUserByPhone(identifier) : get(`SELECT * FROM users WHERE email=@e AND deleted_at IS NULL`, { e: identifier });
  if (!user || !user.password_hash || !auth.checkPassword(req.body.password, user.password_hash)) {
    activity.log(null, 'login_failed', { ip: req.ip, description: `تلاش ناموفق ورود: ${identifier}` });
    auth.flash(req, 'danger', 'شناسه کاربری یا گذرواژه اشتباه است.');
    return res.redirect('/login?status=password');
  }
  if (user.status === 'blocked') { auth.flash(req, 'danger', 'حساب شما مسدود است.'); return res.redirect('/login'); }
  auth.login(req, res, user, { remember: req.body.remember === '1' });
  const prev = req.session.returnTo || req.query.prev; req.session.returnTo = null;
  res.redirect(prev || panelFor(user));
});

router.post('/password/set', auth.requireLogin, (req, res) => {
  if (String(req.body.password).length < 6) { auth.flash(req, 'danger', 'گذرواژه باید حداقل ۶ کاراکتر باشد.'); return res.redirect('/login?status=password'); }
  run('UPDATE users SET password_hash=@h, updated_at=@t WHERE id=@id', { h: auth.hashPassword(req.body.password), t: now(), id: req.user.id });
  activity.logReq(req, 'password_change', { description: 'گذرواژه تعیین شد' });
  auth.login(req, res, req.user);
  res.redirect(panelFor(req.user));
});

router.get('/logout', (req, res) => { auth.logout(req); res.redirect('/'); });
router.post('/logout', (req, res) => { auth.logout(req); res.redirect('/'); });

function panelFor(user) {
  if (user.role === 'admin' || user.role === 'staff') return '/admin/dashboard';
  if (user.role === 'seller' && user.seller_id) return '/seller/dashboard';
  return '/user/dashboard';
}

/* ---------------- ثبت‌نام فروشنده ---------------- */

router.get('/auth/seller/register', (req, res) => {
  if (setting('seller_registration_enabled', '1') === '0') {
    auth.flash(req, 'warning', 'ثبت‌نام فروشندگان موقتاً غیرفعال است.');
    return res.redirect('/');
  }
  res.render('auth/seller-register', { meta: seo.meta({ title: 'فروشنده شوید', path: '/auth/seller/register' }), provinces: all('SELECT * FROM provinces ORDER BY name') });
});

router.post('/auth/seller/register', media.upload.array('documents', 6), async (req, res) => {
  if (setting('seller_registration_enabled', '1') === '0') { auth.flash(req, 'danger', 'ثبت‌نام فروشندگان غیرفعال است.'); return res.redirect('/'); }
  const phone = normalizePhone(req.body.phone);
  if (!isValidPhone(phone)) { auth.flash(req, 'danger', 'شماره موبایل معتبر نیست.'); return res.redirect('/auth/seller/register'); }
  const shopName = String(req.body.shop_name || '').trim();
  if (shopName.length < 3) { auth.flash(req, 'danger', 'نام فروشگاه باید حداقل ۳ کاراکتر باشد.'); return res.redirect('/auth/seller/register'); }

  let user = auth.findUserByPhone(phone);
  if (!user) {
    const uid = auth.createUser({ phone, name: req.body.full_name || shopName, role: 'seller', status: 'pending', password: req.body.password || null });
    user = auth.findUser(uid);
  } else if (user.seller_id) {
    auth.flash(req, 'warning', 'با این شماره قبلاً فروشگاهی ثبت شده است.');
    return res.redirect('/seller/dashboard');
  }

  const docs = [];
  if (setting('sms_driver', 'mock') === 'mock' || true) {
    // رمزنگاری مدارک: فقط مسیر ذخیره می‌شود
  }
  for (const f of req.files || []) docs.push(media.register(f, { userId: user.id, ownerType: 'seller', folder: '/seller-documents' }).url);

  const slug = catalogUniqueSlug('sellers', slugify(req.body.shop_slug || shopName), 'shop_slug');
  const sellerId = insert('sellers', {
    user_id: user.id, shop_name: shopName, shop_slug: slug, shop_en: req.body.shop_en || null,
    type: req.body.type === 'legal' ? 'legal' : 'real',
    national_id: req.body.national_id || null, reg_no: req.body.reg_no || null,
    phone, email: req.body.email || null, province: req.body.province || null, city: req.body.city || null,
    address: req.body.address || null, documents: jstringify(docs), description: req.body.description || null,
    commission: parseFloat(setting('seller_default_commission', '5')), settlement_days: toInt(setting('seller_default_settlement', '7'), 7),
    status: setting('seller_auto_approve', '0') === '1' ? 'active' : 'pending',
    created_at: now(), updated_at: now(),
  });
  run('UPDATE users SET seller_id=@s, role=\'seller\', status=@st WHERE id=@u', { s: sellerId, st: setting('seller_auto_approve', '0') === '1' ? 'active' : 'pending', u: user.id });

  notify.pushToStaff({ type: 'seller', icon: 'store', title: 'درخواست فروشنده جدید', body: `فروشگاه «${shopName}» درخواست همکاری ثبت کرد.`, link: '/admin/sellers?status=pending' }, 'sellers.view');
  activity.log(user, 'seller_register', { ip: req.ip, subjectType: 'seller', subjectId: sellerId, description: `ثبت فروشگاه ${shopName}` });

  if (setting('seller_auto_approve', '0') === '1') {
    auth.login(req, res, auth.findUser(user.id));
    auth.flash(req, 'success', 'فروشگاه شما فعال شد. به پنل فروشندگی خوش آمدید!');
    return res.redirect('/seller/dashboard');
  }
  auth.flash(req, 'success', 'درخواست شما ثبت شد. پس از بررسی توسط کارشناسان، نتیجه از طریق پیامک و اعلان به شما اطلاع داده می‌شود.');
  res.redirect('/login?phone=' + phone);
});

function catalogUniqueSlug(table, base, column = 'slug') {
  let slug = base || 'item';
  let n = 1;
  while (get(`SELECT id FROM ${table} WHERE ${column}=@s`, { s: slug })) slug = `${base}-${++n}`;
  return slug;
}

/* ---------------- بازیابی گذرواژه ---------------- */

router.get('/forgot', (req, res) => res.render('auth/forgot', { meta: seo.meta({ title: 'بازیابی گذرواژه', noindex: true }), step: req.session.otpPhone ? 'code' : 'phone', phone: req.session.otpPhone || '', dev: req.session.otpDev }));

router.post('/forgot/send', (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!isValidPhone(phone)) { auth.flash(req, 'danger', 'شماره موبایل معتبر نیست.'); return res.redirect('/forgot'); }
  const otp = auth.issueOtp(req, phone, 'verify');
  req.session.otpPhone = phone; req.session.otpDev = otp.dev;
  auth.flash(req, 'success', `کد تایید ارسال شد.` + (otp.dev ? ` (کد آزمایشی: ${otp.dev})` : ''));
  res.redirect('/forgot');
});

router.post('/forgot/reset', (req, res) => {
  const result = auth.verifyOtp(req.session.otpPhone, req.body.code, 'verify');
  if (!result.ok) { auth.flash(req, 'danger', result.error); return res.redirect('/forgot'); }
  if (String(req.body.password || '').length < 6) { auth.flash(req, 'danger', 'گذرواژه حداقل ۶ کاراکتر باشد.'); return res.redirect('/forgot'); }
  const user = auth.findUserByPhone(req.session.otpPhone);
  if (!user) { auth.flash(req, 'danger', 'حسابی با این شماره یافت نشد.'); return res.redirect('/login'); }
  run('UPDATE users SET password_hash=@h, updated_at=@t WHERE id=@id', { h: auth.hashPassword(req.body.password), t: now(), id: user.id });
  req.session.otpPhone = null; req.session.otpDev = null;
  auth.login(req, res, user);
  auth.flash(req, 'success', 'گذرواژه شما با موفقیت تغییر کرد.');
  res.redirect(panelFor(user));
});

module.exports = router;
