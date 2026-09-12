'use strict';
const { insert, get, all, run } = require('../db');
const { now } = require('./utils');
const { setting } = require('../db');
const sms = require('../services/sms');

/**
 * سیستم یکپارچه اعلان‌ها — اعلان داخلی + پیامک اختیاری
 */

function push(userId, { type = 'info', title, body = '', link = '', icon = '', sendSms = false, template = null, smsParams = {} }) {
  if (!userId) return null;
  const id = insert('notifications', { user_id: userId, type, title, body, link, icon, created_at: now() });
  if (sendSms && setting('sms_enabled', '1') !== '0') {
    const user = get('SELECT phone FROM users WHERE id=@id', { id: userId });
    if (user?.phone) sms.send({ phone: user.phone, body, template, params: smsParams });
  }
  return id;
}

function pushMany(userIds, payload) {
  let n = 0;
  for (const uid of new Set(userIds.filter(Boolean))) { push(uid, payload); n++; }
  return n;
}

/** اعلان به همه مدیران دارای یک دسترسی */
function pushToStaff(payload, permission = null) {
  const rows = permission
    ? all(`SELECT u.id FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.role IN ('staff','admin') AND u.deleted_at IS NULL AND (u.role='admin' OR r.permissions LIKE @p)`, { p: `%"${permission}"%` })
    : all(`SELECT id FROM users WHERE role IN ('staff','admin') AND deleted_at IS NULL`);
  return pushMany(rows.map((r) => r.id), payload);
}

function forUser(userId, { limit = 20, offset = 0, unreadOnly = false } = {}) {
  const w = unreadOnly ? ' AND read_at IS NULL' : '';
  const rows = all(`SELECT * FROM notifications WHERE user_id=@u ${w} ORDER BY id DESC LIMIT @l OFFSET @o`, { u: userId, l: limit, o: offset });
  const total = get(`SELECT COUNT(*) AS c FROM notifications WHERE user_id=@u ${w}`, { u: userId }).c;
  return { rows, total };
}

function unreadCount(userId) {
  if (!userId) return 0;
  return get('SELECT COUNT(*) AS c FROM notifications WHERE user_id=@u AND read_at IS NULL', { u: userId }).c;
}

function markRead(id, userId) { return run('UPDATE notifications SET read_at=@t WHERE id=@id AND user_id=@u', { t: now(), id, u: userId }).changes; }
function markAllRead(userId) { return run('UPDATE notifications SET read_at=@t WHERE user_id=@u AND read_at IS NULL', { t: now(), u: userId }).changes; }
function removeNotification(id, userId) { return run('DELETE FROM notifications WHERE id=@id AND user_id=@u', { id, u: userId }).changes; }

/* ---------------- قالب‌های آماده اعلان ---------------- */

const T = {
  orderPlaced: (code) => ({ type: 'order', icon: 'cart', title: 'سفارش ثبت شد', body: `سفارش ${code} با موفقیت ثبت شد و در انتظار پرداخت است.`, link: `/user/orders/${code}` }),
  orderPaid: (code) => ({ type: 'order', icon: 'check', title: 'پرداخت موفق', body: `پرداخت سفارش ${code} تایید شد.`, link: `/user/orders/${code}` }),
  orderStatus: (code, status) => ({ type: 'order', icon: 'truck', title: 'تغییر وضعیت سفارش', body: `وضعیت سفارش ${code} به «${status}» تغییر کرد.`, link: `/user/orders/${code}` }),
  orderCanceled: (code) => ({ type: 'order', icon: 'x', title: 'لغو سفارش', body: `سفارش ${code} لغو شد و مبلغ به کیف پول شما بازگشت.`, link: `/user/wallet` }),
  shipped: (code, tracking) => ({ type: 'order', icon: 'truck', title: 'سفارش ارسال شد', body: `سفارش ${code} ارسال شد. کد رهگیری: ${tracking || '—'}`, link: `/user/orders/${code}` }),
  walletDeposit: (amount) => ({ type: 'wallet', icon: 'wallet', title: 'شارژ کیف پول', body: `مبلغ ${amount} تومان به کیف پول شما اضافه شد.`, link: '/user/wallet' }),
  withdrawPaid: (amount) => ({ type: 'wallet', icon: 'bank', title: 'برداشت وجه', body: `درخواست برداشت ${amount} تومان پرداخت شد.`, link: '/user/withdrawals' }),
  ticketReply: (code) => ({ type: 'ticket', icon: 'message', title: 'پاسخ تیکت', body: `تیکت ${code} پاسخ داده شد.`, link: `/user/tickets/${code}` }),
  sellerApproved: (name) => ({ type: 'seller', icon: 'store', title: 'فروشگاه شما تایید شد', body: `فروشگاه «${name}» فعال شد. اکنون می‌توانید محصول ثبت کنید.`, link: '/seller/dashboard' }),
  sellerRejected: () => ({ type: 'seller', icon: 'x', title: 'درخواست فروشندگی', body: 'متاسفانه درخواست شما تایید نشد. برای جزئیات با پشتیبانی در ارتباط باشید.', link: '/user/tickets' }),
  newSellerRequest: (name) => ({ type: 'seller', icon: 'store', title: 'درخواست فروشنده جدید', body: `فروشگاه «${name}» درخواست همکاری ثبت کرده است.`, link: '/admin/sellers?status=pending' }),
  productApproved: (title) => ({ type: 'product', icon: 'check', title: 'محصول تایید شد', body: `محصول «${title}» تایید و منتشر شد.`, link: '/seller/products' }),
  productRejected: (title) => ({ type: 'product', icon: 'x', title: 'محصول تایید نشد', body: `محصول «${title}» نیاز به اصلاح دارد.`, link: '/seller/products' }),
  newProductPending: (title) => ({ type: 'product', icon: 'alert', title: 'محصول در انتظار تایید', body: `محصول «${title}» توسط فروشنده ثبت شد.`, link: '/admin/products?status=pending' }),
  newOrder: (code) => ({ type: 'order', icon: 'cart', title: 'سفارش جدید', body: `سفارش جدید ${code} ثبت شد.`, link: '/admin/orders' }),
  inStock: (title) => ({ type: 'product', icon: 'bell', title: 'موجود شد!', body: `محصول «${title}» که منتظرش بودید موجود شد.`, link: '' }),
  onSale: (title) => ({ type: 'product', icon: 'percent', title: 'تخفیف خورد!', body: `محصول «${title}» تخفیف خورد.`, link: '' }),
  reviewApproved: (title) => ({ type: 'review', icon: 'star', title: 'دیدگاه شما منتشر شد', body: `دیدگاه شما برای «${title}» تایید شد.`, link: '' }),
  pointsAwarded: (points) => ({ type: 'club', icon: 'award', title: 'امتیاز باشگاه مشتریان', body: `${points} امتیاز به باشگاه مشتریان شما اضافه شد.`, link: '/user/club' }),
  levelUp: (level) => ({ type: 'club', icon: 'award', title: 'ارتقای سطح', body: `تبریک! سطح شما در باشگاه مشتریان به «${level}» ارتقا یافت.`, link: '/user/club' }),
  affiliateSale: (amount) => ({ type: 'affiliate', icon: 'link', title: 'کمیسیون همکاری در فروش', body: `${amount} تومان پورسانت از فروش همکاری برای شما ثبت شد.`, link: '/user/affiliate' }),
  abandonedCart: () => ({ type: 'cart', icon: 'cart', title: 'سبد خرید شما منتظر شماست', body: 'محصولات سبد خریدتان را فراموش نکنید؛ موجودی محدود است.', link: '/cart' }),
  questionAnswered: (title) => ({ type: 'question', icon: 'help', title: 'پرسش شما پاسخ داده شد', body: `پرسش شما درباره «${title}» پاسخ داده شد.`, link: '' }),
  welcome: (name) => ({ type: 'info', icon: 'heart', title: 'خوش آمدید', body: `${name || 'کاربر'} عزیز، به خانواده ما خوش آمدید. با اولین خرید امتیاز باشگاه مشتریان بگیرید.`, link: '/products' }),
};

module.exports = { push, pushMany, pushToStaff, forUser, unreadCount, markRead, markAllRead, removeNotification, T };
