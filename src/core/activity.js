'use strict';
const { insert, all, get, run } = require('../db');
const { now, jstringify } = require('./utils');

/** ثبت فعالیت‌های اخیر (مشابه Recent Actions تلگرام) */
function log(actor, action, opts = {}) {
  try {
    return insert('activity_logs', {
      user_id: actor?.id || null,
      actor_type: actor?.role || (actor?.id ? 'user' : 'guest'),
      action,
      subject_type: opts.subjectType || null,
      subject_id: opts.subjectId || null,
      description: opts.description || null,
      ip: opts.ip || null,
      meta: jstringify(opts.meta || {}),
      created_at: now(),
    });
  } catch (e) { return null; }
}

/** از روی درخواست اکسپرس */
function logReq(req, action, opts = {}) {
  return log(req.user, action, { ip: req.ip, ...opts });
}

function forUser(userId, limit = 50, offset = 0) {
  return all(`SELECT * FROM activity_logs WHERE user_id=@u ORDER BY id DESC LIMIT @l OFFSET @o`, { u: userId, l: limit, o: offset });
}

function latest(limit = 30, actorType = null) {
  if (actorType) return all(`SELECT a.*, u.name AS user_name, u.phone AS user_phone FROM activity_logs a LEFT JOIN users u ON u.id=a.user_id WHERE a.actor_type=@t ORDER BY a.id DESC LIMIT @l`, { t: actorType, l: limit });
  return all(`SELECT a.*, u.name AS user_name, u.phone AS user_phone FROM activity_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT @l`, { l: limit });
}

function actionsSummary(days = 30) {
  return all(`SELECT action, COUNT(*) AS c FROM activity_logs WHERE created_at >= datetime('now', @d) GROUP BY action ORDER BY c DESC LIMIT 25`, { d: `-${days} days` });
}

function purgeOlderThan(days = 120) {
  return run(`DELETE FROM activity_logs WHERE created_at < datetime('now', @d)`, { d: `-${days} days` }).changes;
}

const ACTION_LABELS = {
  login: 'ورود به حساب', logout: 'خروج از حساب', otp_sent: 'ارسال کد ورود', otp_verified: 'تایید کد ورود',
  register: 'ثبت‌نام', profile_update: 'ویرایش پروفایل', password_change: 'تغییر گذرواژه',
  product_create: 'ایجاد محصول', product_update: 'ویرایش محصول', product_delete: 'حذف محصول', product_restore: 'بازیابی محصول',
  order_create: 'ثبت سفارش', order_pay: 'پرداخت سفارش', order_status: 'تغییر وضعیت سفارش', order_cancel: 'لغو سفارش',
  cart_add: 'افزودن به سبد', cart_remove: 'حذف از سبد', checkout: 'تکمیل فرایند خرید',
  wallet_deposit: 'شارژ کیف پول', wallet_withdraw: 'برداشت از کیف پول', withdraw_request: 'درخواست برداشت وجه',
  review_create: 'ثبت دیدگاه', question_create: 'ثبت پرسش', answer_create: 'پاسخ به پرسش',
  ticket_create: 'ایجاد تیکت', ticket_reply: 'پاسخ به تیکت',
  post_create: 'انتشار مقاله', story_create: 'انتشار استوری',
  media_upload: 'بارگذاری فایل', settings_update: 'تغییر تنظیمات',
  seller_register: 'ثبت‌نام فروشنده', seller_approve: 'تایید فروشنده', seller_block: 'مسدودسازی فروشنده',
  stock_change: 'تغییر موجودی انبار', price_update: 'بروزرسانی قیمت', currency_update: 'بروزرسانی نرخ ارز',
  session_revoke: 'خاتمه نشست', coupon_create: 'ایجاد کد تخفیف', affiliate_sale: 'فروش همکاری',
  user_block: 'مسدودسازی کاربر', user_unblock: 'لغو مسدودسازی کاربر', wallet_adjust: 'تغییر موجودی کیف پول',
  points_adjust: 'تغییر امتیاز باشگاه', admin_create: 'افزودن مدیر', role_update: 'تغییر نقش و دسترسی',
  review_status: 'بررسی دیدگاه', question_status: 'بررسی پرسش', withdraw_review: 'بررسی درخواست برداشت',
  settlement_pay: 'پرداخت تسویه فروشنده', gateways_update: 'تغییر درگاه‌های پرداخت', backup_create: 'ساخت پشتیبان',
  notification_send: 'ارسال اعلان گروهی', seller_update: 'ویرایش فروشگاه', seller_wallet: 'تغییر موجودی فروشگاه',
  preinvoice_create: 'صدور پیش‌فاکتور', preinvoice_cancel: 'لغو پیش‌فاکتور', shipping_update: 'تغییر روش‌های ارسال',
  warehouse_adjust: 'اصلاح موجودی انبار', page_save: 'ذخیره صفحه', form_save: 'ذخیره فرم', order_refund: 'بازگشت وجه',
  cart_abandon_notify: 'یادآوری سبد رهاشده', install_complete: 'تکمیل نصب', login_failed: 'تلاش ناموفق ورود',
};
function label(action) { return ACTION_LABELS[action] || action; }

module.exports = { log, logReq, forUser, latest, actionsSummary, purgeOlderThan, label, ACTION_LABELS };
