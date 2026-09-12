'use strict';
const express = require('express');
const router = express.Router();
const { all, get, insert, update, run, jparse, jstringify, setting } = require('../../db');
const auth = require('../../core/auth');
const acl = require('../../core/acl');
const seo = require('../../core/seo');
const notify = require('../../core/notify');
const activity = require('../../core/activity');
const catalog = require('../../core/catalog');
const orders = require('../orders');
const media = require('../../core/media');
const payment = require('../../services/payment');
const { now, toInt, numberFormat, normalizePhone, isValidPhone, luhn, maskCard, normalizeCard, truncate, slugify, randomCode, paginate } = require('../../core/utils');
const { formatJalali, formatJalaliLong, timeAgo, toPersianDigits, MONTHS } = require('../../core/jalali');

router.use(auth.requireLogin);

function locals(req, res, title, extra = {}) {
  res.locals.panel = 'user';
  res.locals.pageTitle = title;
  res.locals.meta = seo.meta({ title, noindex: true });
  res.locals.notifications = notify.forUser(req.user.id, { limit: 15 });
  Object.assign(res.locals, extra);
}

const MENU = [
  { href: '/user/dashboard', title: 'داشبورد', icon: 'grid', match: '^/user/dashboard$' },
  { href: '/user/orders', title: 'سفارش‌ها', icon: 'cart', match: '^/user/orders' },
  { href: '/user/preinvoices', title: 'پیش‌فاکتورها', icon: 'file', match: '^/user/preinvoices' },
  { href: '/user/wallet', title: 'کیف پول و تراکنش‌ها', icon: 'wallet', match: '^/user/wallet|^/user/transactions' },
  { href: '/user/club', title: 'باشگاه مشتریان', icon: 'award', match: '^/user/club' },
  { href: '/user/favorites', title: 'علاقمندی‌ها', icon: 'heart', match: '^/user/favorites' },
  { href: '/user/compare', title: 'مقایسه', icon: 'columns', match: '^/user/compare' },
  { href: '/user/recently-viewed', title: 'بازدیدهای اخیر', icon: 'clock', match: '^/user/recently' },
  { href: '/user/addresses', title: 'نشانی‌ها', icon: 'map-pin', match: '^/user/addresses' },
  { href: '/user/reviews', title: 'دیدگاه‌های من', icon: 'star', match: '^/user/reviews' },
  { href: '/user/alerts', title: 'اعلان موجودی و تخفیف', icon: 'bell', match: '^/user/alerts' },
  { href: '/user/affiliate', title: 'همکاری در فروش', icon: 'link', match: '^/user/affiliate' },
  { href: '/user/bank-accounts', title: 'حساب‌های بانکی', icon: 'credit-card', match: '^/user/bank' },
  { href: '/user/withdrawals', title: 'درخواست برداشت', icon: 'bank', match: '^/user/withdrawals' },
  { href: '/user/tickets', title: 'تیکت‌ها', icon: 'life-buoy', match: '^/user/tickets' },
  { href: '/user/notifications', title: 'اعلان‌ها', icon: 'bell-ring', match: '^/user/notifications' },
  { href: '/user/sessions', title: 'نشست‌های فعال', icon: 'monitor', match: '^/user/sessions' },
  { href: '/user/profile', title: 'ویرایش پروفایل', icon: 'user', match: '^/user/profile' },
];

router.use((req, res, next) => { res.locals.userMenu = MENU.map((m) => ({ ...m, active: new RegExp(m.match).test(req.path) })); next(); });

/* ---------------- داشبورد ---------------- */

router.get('/dashboard', (req, res) => {
  const u = req.user;
  locals(req, res, 'داشبورد');
  const stats = {
    orders: get('SELECT COUNT(*) AS c FROM orders WHERE user_id=@u', { u: u.id }).c,
    paidOrders: get(`SELECT COUNT(*) AS c FROM orders WHERE user_id=@u AND payment_status='paid'`, { u: u.id }).c,
    spending: get(`SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE user_id=@u AND payment_status='paid' AND status<>'canceled'`, { u: u.id }).s,
    wallet: u.wallet || 0,
    points: u.points || 0,
    favorites: get('SELECT COUNT(*) AS c FROM favorites WHERE user_id=@u', { u: u.id }).c,
    tickets: get('SELECT COUNT(*) AS c FROM tickets WHERE owner_type=\'user\' AND owner_id=@u AND status<>\'closed\'', { u: u.id }).c,
    affiliate: get(`SELECT COALESCE(SUM(amount),0) AS s FROM affiliate_commissions WHERE user_id=@u AND status<>'rejected'`, { u: u.id }).s,
  };
  const recentOrders = all(`SELECT * FROM orders WHERE user_id=@u ORDER BY id DESC LIMIT 5`, { u: u.id }).map((o) => ({ ...o, status_title: orders.statusTitle(o.status) }));
  const level = get('SELECT * FROM club_levels WHERE level=@l', { l: u.club_level });
  const nextLevel = get('SELECT * FROM club_levels WHERE min_points > @p ORDER BY min_points ASC LIMIT 1', { p: u.points });
  const suggestions = catalog.listProducts({ perPage: 6, sort: 'popular' }).rows;
  res.render('user/dashboard', { stats, recentOrders, level, nextLevel, suggestions });
});

/* ---------------- سفارش‌ها ---------------- */

router.get('/orders', (req, res) => {
  const page = toInt(req.query.page, 1), perPage = 10;
  const where = ['o.user_id=@u'];
  const values = { u: req.user.id, l: perPage, o: (page - 1) * perPage };
  if (req.query.status) { where.push('o.status=@st'); values.st = req.query.status; }
  const W = where.join(' AND ');
  const total = get(`SELECT COUNT(*) AS c FROM orders o WHERE ${W}`, values).c;
  const rows = all(`SELECT o.*, (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id) AS items_count,
                    (SELECT image FROM order_items oi WHERE oi.order_id=o.id LIMIT 1) AS cover
                    FROM orders o WHERE ${W} ORDER BY o.id DESC LIMIT @l OFFSET @o`, values)
    .map((o) => ({ ...o, status_title: orders.statusTitle(o.status) }));
  locals(req, res, 'سفارش‌ها');
  res.render('user/orders', { rows, pg: paginate(total, page, perPage), statuses: orders.statuses() });
});

router.get('/orders/:code', (req, res) => {
  const order = get('SELECT * FROM orders WHERE code=@c AND user_id=@u', { c: req.params.code, u: req.user.id });
  if (!order) return res.status(404).render('errors/404', { meta: seo.meta({ title: 'سفارش یافت نشد', noindex: true }) });
  const detail = orders.detail(order.id);
  locals(req, res, `سفارش ${order.code}`);
  const shippingMethods = require('../../services/shipping').allMethods();
  res.render('user/order-detail', { order: detail, shippingMethods, invoice: orders.invoiceData(order.id), canCancel: ['pending', 'paid', 'processing'].includes(order.status), statuses: orders.statuses() });
});

router.post('/orders/:code/cancel', (req, res) => {
  const order = get('SELECT * FROM orders WHERE code=@c AND user_id=@u', { c: req.params.code, u: req.user.id });
  if (!order) return res.redirect('/user/orders');
  if (!['pending', 'paid', 'processing'].includes(order.status)) { auth.flash(req, 'danger', 'در این وضعیت امکان لغو سفارش نیست.'); return res.redirect('/user/orders/' + order.code); }
  orders.setStatus(order.id, 'canceled', { note: 'لغو توسط کاربر: ' + (req.body.reason || 'بدون ذکر دلیل'), userId: req.user.id });
  activity.logReq(req, 'order_cancel', { subjectType: 'order', subjectId: order.id, description: req.body.reason });
  auth.flash(req, 'success', 'سفارش لغو شد' + (order.payment_status === 'paid' ? ' و مبلغ به کیف پول شما بازگشت.' : '.'));
  res.redirect('/user/orders/' + order.code);
});

router.post('/orders/:code/receipt', (req, res) => {
  const order = get('SELECT * FROM orders WHERE code=@c AND user_id=@u', { c: req.params.code, u: req.user.id });
  if (!order || order.payment_method !== 'card2card') return res.redirect('/user/orders');
  payment.submitCardReceipt(order.id, req.user.id, {
    card_prefix: req.body.card_prefix, card_last4: req.body.card_last4, paid_at: req.body.paid_at, note: req.body.note,
  });
  notify.pushToStaff({ type: 'order', icon: 'card', title: 'رسید کارت به کارت', body: `رسید پرداخت سفارش ${order.code} ثبت شد و نیاز به بررسی دارد.`, link: `/admin/orders/${order.code}` }, 'orders.manage');
  auth.flash(req, 'success', 'رسید شما ثبت شد و پس از بررسی، سفارش تایید می‌شود.');
  res.redirect('/user/orders/' + order.code);
});

router.post('/orders/:code/confirm-delivery', (req, res) => {
  const order = get('SELECT * FROM orders WHERE code=@c AND user_id=@u', { c: req.params.code, u: req.user.id });
  if (!order || order.status !== 'shipping') return res.redirect('/user/orders');
  orders.setStatus(order.id, 'delivered', { note: 'تایید دریافت توسط مشتری', userId: req.user.id });
  auth.flash(req, 'success', 'رسیدن کالا تایید شد. ممنون از خرید شما!');
  res.redirect('/user/orders/' + order.code);
});

/* ---------------- پیش‌فاکتور ---------------- */

router.get('/preinvoices', (req, res) => {
  const rows = all('SELECT * FROM preinvoices WHERE user_id=@u ORDER BY id DESC', { u: req.user.id }).map((p) => ({ ...p, items: jparse(p.items, []) }));
  locals(req, res, 'پیش‌فاکتورها');
  res.render('user/preinvoices', { rows, gateways: payment.enabledGateways() });
});

router.get('/preinvoices/:code', (req, res) => {
  const pi = get('SELECT * FROM preinvoices WHERE code=@c AND user_id=@u', { c: req.params.code, u: req.user.id });
  if (!pi) return res.redirect('/user/preinvoices');
  pi.items = jparse(pi.items, []);
  locals(req, res, `پیش‌فاکتور ${pi.code}`);
  res.render('user/preinvoice', { pi, gateways: payment.enabledGateways() });
});

/* ---------------- کیف پول ---------------- */

router.get('/wallet', (req, res) => {
  const page = toInt(req.query.page, 1), perPage = 15;
  const total = get('SELECT COUNT(*) AS c FROM transactions WHERE user_id=@u', { u: req.user.id }).c;
  const rows = all('SELECT * FROM transactions WHERE user_id=@u ORDER BY id DESC LIMIT @l OFFSET @o', { u: req.user.id, l: perPage, o: (page - 1) * perPage });
  locals(req, res, 'کیف پول');
  res.render('user/wallet', {
    rows, pg: paginate(total, page, perPage),
    income: get(`SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE user_id=@u AND amount>0 AND status='success'`, { u: req.user.id }).s,
    outcome: get(`SELECT COALESCE(SUM(-amount),0) AS s FROM transactions WHERE user_id=@u AND amount<0 AND status='success'`, { u: req.user.id }).s,
    gateways: payment.enabledGateways(),
    monthly: all(`SELECT strftime('%Y-%m', created_at) AS m, SUM(CASE WHEN amount>0 THEN amount ELSE 0 END) AS income, SUM(CASE WHEN amount<0 THEN -amount ELSE 0 END) AS outcome
                  FROM transactions WHERE user_id=@u AND status='success' GROUP BY m ORDER BY m DESC LIMIT 6`, { u: req.user.id }),
  });
});

/* ---------------- باشگاه مشتریان ---------------- */

router.get('/club', (req, res) => {
  const levels = all('SELECT * FROM club_levels ORDER BY min_points ASC').map((l) => ({ ...l, perks: jparse(l.perks, []) }));
  const activities = all('SELECT * FROM club_activities WHERE user_id=@u ORDER BY id DESC LIMIT 40', { u: req.user.id });
  const current = levels.find((l) => l.level === req.user.club_level);
  const next = levels.find((l) => l.min_points > req.user.points);
  locals(req, res, 'باشگاه مشتریان');
  res.render('user/club', { levels, activities, current, next, pointValue: setting('club_point_value', '100') });
});

/* ---------------- علاقمندی / مقایسه / بازدیدها ---------------- */

router.get('/favorites', (req, res) => {
  const rows = all(`SELECT ${catalog.baseSelect().replace('SELECT ', '')} WHERE p.id IN (SELECT product_id FROM favorites WHERE user_id=@u) AND p.deleted_at IS NULL ORDER BY p.id DESC`, { u: req.user.id }).map(catalog.rowHydrate);
  locals(req, res, 'علاقمندی‌ها');
  res.render('user/favorites', { products: rows });
});

router.post('/favorites/:id/remove', (req, res) => {
  run('DELETE FROM favorites WHERE user_id=@u AND product_id=@p', { u: req.user.id, p: toInt(req.params.id) });
  res.redirect('/user/favorites');
});

router.get('/compare', (req, res) => {
  const ids = all('SELECT product_id FROM compare_items WHERE user_id=@u', { u: req.user.id }).map((r) => r.product_id);
  const products = ids.length ? all(`${catalog.baseSelect()} WHERE p.id IN (${ids.map((_, i) => '@i' + i).join(',')})`, Object.fromEntries(ids.map((id, i) => ['i' + i, id]))).map(catalog.rowHydrate) : [];
  locals(req, res, 'مقایسه محصولات');
  res.render('user/compare', { products, groups: all('SELECT * FROM attribute_groups WHERE is_spec=1') });
});

router.get('/recently-viewed', (req, res) => {
  const ids = all('SELECT DISTINCT product_id FROM recently_viewed WHERE user_id=@u ORDER BY viewed_at DESC LIMIT 24', { u: req.user.id }).map((r) => r.product_id);
  const products = ids.length ? all(`${catalog.baseSelect()} WHERE p.id IN (${ids.map((_, i) => '@i' + i).join(',')})`, Object.fromEntries(ids.map((id, i) => ['i' + i, id]))).map(catalog.rowHydrate) : [];
  locals(req, res, 'بازدیدهای اخیر');
  res.render('user/recently-viewed', { products });
});

router.get('/alerts', (req, res) => {
  const rows = all(`SELECT pa.*, p.title, p.slug, p.price, p.stock, p.status FROM product_alerts pa JOIN products p ON p.id=pa.product_id WHERE pa.user_id=@u ORDER BY pa.id DESC`, { u: req.user.id });
  locals(req, res, 'اعلان موجودی و تخفیف');
  res.render('user/alerts', { rows });
});

router.post('/alerts/:id/remove', (req, res) => {
  run('DELETE FROM product_alerts WHERE user_id=@u AND id=@id', { u: req.user.id, id: toInt(req.params.id) });
  res.redirect('/user/alerts');
});

/* ---------------- نشانی‌ها ---------------- */

router.get('/addresses', (req, res) => {
  locals(req, res, 'نشانی‌ها');
  res.render('user/addresses', { rows: all('SELECT * FROM addresses WHERE user_id=@u ORDER BY is_default DESC, id DESC', { u: req.user.id }), provinces: all('SELECT * FROM provinces ORDER BY name') });
});

router.post('/addresses', (req, res) => {
  const b = req.body;
  if (!String(b.address || '').trim()) { auth.flash(req, 'danger', 'متن نشانی الزامی است.'); return res.redirect('/user/addresses'); }
  const id = insert('addresses', {
    user_id: req.user.id, title: b.title || 'نشانی', receiver: b.receiver || req.user.name, phone: normalizePhone(b.phone) || req.user.phone,
    province: b.province, city: b.city, address: b.address, postal_code: b.postal_code, lat: b.lat ? parseFloat(b.lat) : null, lng: b.lng ? parseFloat(b.lng) : null,
    is_default: b.is_default ? 1 : 0, created_at: now(),
  });
  if (b.is_default) run('UPDATE addresses SET is_default=0 WHERE user_id=@u AND id<>@id', { u: req.user.id, id });
  if (!get('SELECT id FROM addresses WHERE user_id=@u AND is_default=1', { u: req.user.id })) run('UPDATE addresses SET is_default=1 WHERE id=@id', { id });
  auth.flash(req, 'success', 'نشانی ذخیره شد.');
  res.redirect('/user/addresses');
});

router.post('/addresses/:id/delete', (req, res) => {
  run('DELETE FROM addresses WHERE id=@id AND user_id=@u', { id: toInt(req.params.id), u: req.user.id });
  res.redirect('/user/addresses');
});

/* ---------------- دیدگاه‌ها ---------------- */

router.get('/reviews', (req, res) => {
  const rows = all(`SELECT r.*, p.title, p.slug FROM reviews r JOIN products p ON p.id=r.product_id WHERE r.user_id=@u ORDER BY r.id DESC`, { u: req.user.id });
  locals(req, res, 'دیدگاه‌های من');
  res.render('user/reviews', { rows });
});

router.get('/questions', (req, res) => {
  const rows = all(`SELECT q.*, p.title, p.slug FROM questions q JOIN products p ON p.id=q.product_id WHERE q.user_id=@u ORDER BY q.id DESC`, { u: req.user.id })
    .map((q) => ({ ...q, answers: all('SELECT a.*, u.name FROM answers a LEFT JOIN users u ON u.id=a.user_id WHERE a.question_id=@q', { q: q.id }) }));
  locals(req, res, 'پرسش‌های من');
  res.render('user/questions', { rows });
});

/* ---------------- همکاری در فروش ---------------- */

router.get('/affiliate', (req, res) => {
  const commissions = all(`SELECT ac.*, p.title, p.slug, o.code AS order_code FROM affiliate_commissions ac
                           LEFT JOIN products p ON p.id=ac.product_id LEFT JOIN orders o ON o.id=ac.order_id
                           WHERE ac.user_id=@u ORDER BY ac.id DESC LIMIT 50`, { u: req.user.id });
  const stats = {
    total: get(`SELECT COALESCE(SUM(amount),0) AS s FROM affiliate_commissions WHERE user_id=@u`, { u: req.user.id }).s,
    approved: get(`SELECT COALESCE(SUM(amount),0) AS s FROM affiliate_commissions WHERE user_id=@u AND status IN ('approved','paid')`, { u: req.user.id }).s,
    pending: get(`SELECT COALESCE(SUM(amount),0) AS s FROM affiliate_commissions WHERE user_id=@u AND status='pending'`, { u: req.user.id }).s,
    clicks: get('SELECT COUNT(*) AS c FROM affiliate_clicks WHERE user_id=@u', { u: req.user.id }).c,
    referrals: get('SELECT COUNT(*) AS c FROM affiliate_referrals WHERE affiliate_id=@u', { u: req.user.id }).c,
    sales: get('SELECT COUNT(*) AS c FROM affiliate_commissions WHERE user_id=@u', { u: req.user.id }).c,
  };
  const products = all(`SELECT id,title,slug,price,affiliate,aff_gold,aff_silver,aff_bronze FROM products WHERE affiliate=1 AND status='active' AND deleted_at IS NULL ORDER BY sold DESC LIMIT 20`);
  locals(req, res, 'همکاری در فروش');
  res.render('user/affiliate', { commissions, stats, products, siteUrl: setting('site_url', '') });
});

router.post('/affiliate/activate', (req, res) => {
  run('UPDATE users SET is_affiliate=1 WHERE id=@id', { id: req.user.id });
  auth.flash(req, 'success', 'همکاری در فروش برای حساب شما فعال شد.');
  res.redirect('/user/affiliate');
});

/* ---------------- حساب بانکی و برداشت ---------------- */

router.get('/bank-accounts', (req, res) => {
  locals(req, res, 'حساب‌های بانکی');
  res.render('user/bank-accounts', { rows: all(`SELECT * FROM bank_accounts WHERE owner_type='user' AND owner_id=@u ORDER BY is_default DESC, id DESC`, { u: req.user.id }) });
});

router.post('/bank-accounts', (req, res) => {
  const card = normalizeCard(req.body.card_number);
  if (card && !luhn(card)) { auth.flash(req, 'danger', 'شماره کارت معتبر نیست.'); return res.redirect('/user/bank-accounts'); }
  const id = insert('bank_accounts', {
    owner_type: 'user', owner_id: req.user.id, owner_name: req.body.owner_name || req.user.name,
    bank_name: req.body.bank_name, card_number: card || null, iban: req.body.iban || null, account_no: req.body.account_no || null,
    is_default: req.body.is_default ? 1 : 0, created_at: now(),
  });
  if (req.body.is_default) run(`UPDATE bank_accounts SET is_default=0 WHERE owner_type='user' AND owner_id=@u AND id<>@id`, { u: req.user.id, id });
  auth.flash(req, 'success', 'حساب بانکی ثبت شد.');
  res.redirect('/user/bank-accounts');
});

router.post('/bank-accounts/:id/delete', (req, res) => {
  run(`DELETE FROM bank_accounts WHERE id=@id AND owner_type='user' AND owner_id=@u`, { id: toInt(req.params.id), u: req.user.id });
  res.redirect('/user/bank-accounts');
});

router.get('/withdrawals', (req, res) => {
  locals(req, res, 'درخواست برداشت وجه');
  res.render('user/withdrawals', {
    rows: all(`SELECT w.*, b.bank_name, b.card_number FROM withdrawals w LEFT JOIN bank_accounts b ON b.id=w.bank_account_id WHERE w.owner_type='user' AND w.owner_id=@u ORDER BY w.id DESC`, { u: req.user.id }),
    accounts: all(`SELECT * FROM bank_accounts WHERE owner_type='user' AND owner_id=@u AND status='approved'`, { u: req.user.id }),
    minWithdraw: toInt(setting('min_withdraw_amount', '50000'), 50000),
  });
});

router.post('/withdrawals', (req, res) => {
  const amount = toInt(req.body.amount);
  const min = toInt(setting('min_withdraw_amount', '50000'), 50000);
  if (amount < min) { auth.flash(req, 'danger', `حداقل مبلغ برداشت ${numberFormat(min)} تومان است.`); return res.redirect('/user/withdrawals'); }
  const acc = get(`SELECT * FROM bank_accounts WHERE id=@id AND owner_type='user' AND owner_id=@u AND status='approved'`, { id: toInt(req.body.bank_account_id), u: req.user.id });
  if (!acc) { auth.flash(req, 'danger', 'حساب بانکی تاییدشده‌ای ندارید.'); return res.redirect('/user/bank-accounts'); }
  if (req.user.wallet < amount) { auth.flash(req, 'danger', 'موجودی کیف پول کافی نیست.'); return res.redirect('/user/withdrawals'); }
  run('UPDATE users SET wallet = wallet - @a WHERE id=@u', { a: amount, u: req.user.id });
  const bal = get('SELECT wallet FROM users WHERE id=@id', { id: req.user.id });
  const id = insert('withdrawals', { owner_type: 'user', owner_id: req.user.id, bank_account_id: acc.id, amount, status: 'pending', created_at: now() });
  insert('transactions', { user_id: req.user.id, owner_type: 'user', owner_id: req.user.id, type: 'withdraw_request', amount: -amount, balance: bal.wallet, gateway: 'system', reference: 'WD-' + randomCode('', 6), status: 'pending', description: 'درخواست برداشت وجه', created_at: now() });
  notify.pushToStaff({ type: 'wallet', icon: 'bank', title: 'درخواست برداشت جدید', body: `کاربر ${req.user.name || req.user.phone} درخواست برداشت ${numberFormat(amount)} تومان دارد.`, link: '/admin/people/withdrawals' }, 'users.wallet');
  activity.logReq(req, 'withdraw_request', { subjectType: 'withdrawal', subjectId: id, description: `${numberFormat(amount)} تومان` });
  auth.flash(req, 'success', 'درخواست برداشت ثبت شد و پس از بررسی پرداخت می‌گردد.');
  res.redirect('/user/withdrawals');
});

/* ---------------- تیکت‌ها ---------------- */

router.get('/tickets', (req, res) => {
  locals(req, res, 'تیکت‌ها');
  res.render('user/tickets', { rows: all(`SELECT * FROM tickets WHERE owner_type='user' AND owner_id=@u ORDER BY id DESC`, { u: req.user.id }) });
});

router.get('/tickets/new', (req, res) => {
  locals(req, res, 'تیکت جدید');
  res.render('user/ticket-new', {
    departments: jparse(setting('ticket_departments', JSON.stringify([['support', 'پشتیبانی'], ['sales', 'فروش'], ['finance', 'مالی'], ['technical', 'فنی']])), []),
    orders: all('SELECT code, created_at, total FROM orders WHERE user_id=@u ORDER BY id DESC LIMIT 20', { u: req.user.id }),
  });
});

router.post('/tickets', media.upload.single('attachment'), (req, res) => {
  const code = 'TK-' + randomCode('', 6);
  const id = insert('tickets', {
    code, subject: String(req.body.subject || '').slice(0, 200), body: req.body.body, department: req.body.department || 'support',
    priority: req.body.priority || 'normal', owner_type: 'user', owner_id: req.user.id, order_id: req.body.order_id ? toInt(req.body.order_id) : null,
    status: 'open', last_message_at: now(), messages_count: 1, created_at: now(), updated_at: now(),
  });
  const attach = req.file ? media.register(req.file, { userId: req.user.id, ownerType: 'user', folder: '/tickets' }).url : null;
  insert('ticket_messages', { ticket_id: id, user_id: req.user.id, role_label: 'user', body: req.body.body, attachment: attach, created_at: now() });
  notify.pushToStaff({ type: 'ticket', icon: 'message', title: 'تیکت جدید', body: `${req.user.name || req.user.phone}: ${truncate(req.body.subject, 60)}`, link: `/admin/system/tickets/${code}` }, 'tickets.view');
  activity.logReq(req, 'ticket_create', { subjectType: 'ticket', subjectId: id, description: code });
  auth.flash(req, 'success', `تیکت با کد ${code} ثبت شد.`);
  res.redirect('/user/tickets/' + code);
});

router.get('/tickets/:code', (req, res) => {
  const t = get(`SELECT * FROM tickets WHERE code=@c AND ((owner_type='user' AND owner_id=@u) OR (owner_type='seller' AND owner_id=@s))`, { c: req.params.code, u: req.user.id, s: req.user.seller_id || 0 });
  if (!t) return res.status(404).render('errors/404', { meta: seo.meta({ title: 'تیکت یافت نشد', noindex: true }) });
  locals(req, res, `تیکت ${t.code}`);
  res.render('user/ticket', {
    ticket: t,
    messages: all('SELECT m.*, u.name AS author, u.role FROM ticket_messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.ticket_id=@t ORDER BY m.id ASC', { t: t.id }),
  });
});

router.post('/tickets/:code/reply', media.upload.single('attachment'), (req, res) => {
  const t = get(`SELECT * FROM tickets WHERE code=@c AND ((owner_type='user' AND owner_id=@u) OR (owner_type='seller' AND owner_id=@s))`, { c: req.params.code, u: req.user.id, s: req.user.seller_id || 0 });
  if (!t) return res.redirect('/user/tickets');
  const attach = req.file ? media.register(req.file, { userId: req.user.id, ownerType: 'user', folder: '/tickets' }).url : null;
  insert('ticket_messages', { ticket_id: t.id, user_id: req.user.id, role_label: req.user.role === 'seller' ? 'seller' : 'user', body: req.body.body, attachment: attach, created_at: now() });
  run(`UPDATE tickets SET status='answered', last_message_at=@t, messages_count=messages_count+1, updated_at=@t WHERE id=@id`, { t: now(), id: t.id });
  notify.pushToStaff({ type: 'ticket', icon: 'message', title: 'پاسخ تیکت', body: `${t.code}: ${truncate(req.body.body, 60)}`, link: `/admin/system/tickets/${t.code}` }, 'tickets.view');
  activity.logReq(req, 'ticket_reply', { subjectType: 'ticket', subjectId: t.id });
  res.redirect('/user/tickets/' + t.code);
});

router.post('/tickets/:code/close', (req, res) => {
  const t = get(`SELECT * FROM tickets WHERE code=@c AND owner_type='user' AND owner_id=@u`, { c: req.params.code, u: req.user.id });
  if (t) run(`UPDATE tickets SET status='closed', updated_at=@t WHERE id=@id`, { t: now(), id: t.id });
  auth.flash(req, 'success', 'تیکت بسته شد.');
  res.redirect('/user/tickets/' + req.params.code);
});

/* ---------------- اعلان‌ها ---------------- */

router.get('/notifications', (req, res) => {
  const page = toInt(req.query.page, 1), perPage = 20;
  const total = get('SELECT COUNT(*) AS c FROM notifications WHERE user_id=@u', { u: req.user.id }).c;
  locals(req, res, 'اعلان‌ها');
  res.render('user/notifications', { rows: all('SELECT * FROM notifications WHERE user_id=@u ORDER BY id DESC LIMIT @l OFFSET @o', { u: req.user.id, l: perPage, o: (page - 1) * perPage }), pg: paginate(total, page, perPage) });
});

router.post('/notifications/:id/read', (req, res) => {
  notify.markRead(toInt(req.params.id), req.user.id);
  if (req.xhr) return res.json({ ok: true });
  res.redirect('back');
});

router.post('/notifications/read-all', (req, res) => { notify.markAllRead(req.user.id); res.redirect('/user/notifications'); });

/* ---------------- نشست‌های فعال ---------------- */

router.get('/sessions', (req, res) => {
  locals(req, res, 'نشست‌های فعال');
  res.render('user/sessions', { rows: auth.sessionsOf(req.user.id) });
});

router.post('/sessions/:id/revoke', (req, res) => {
  auth.revokeSession(toInt(req.params.id), req.user.id);
  activity.logReq(req, 'session_revoke', { description: `خاتمه نشست #${req.params.id}` });
  auth.flash(req, 'success', 'نشست خاتمه یافت.');
  res.redirect('/user/sessions');
});

router.post('/sessions/revoke-all', (req, res) => {
  run('UPDATE user_sessions SET revoked_at=@t WHERE user_id=@u AND id<>@cur', { t: now(), u: req.user.id, cur: get('SELECT id FROM user_sessions WHERE sid=@s', { s: req.sessionID })?.id || 0 });
  auth.flash(req, 'success', 'همه نشست‌های دیگر خاتمه یافتند.');
  res.redirect('/user/sessions');
});

/* ---------------- پروفایل ---------------- */

router.get('/profile', (req, res) => {
  locals(req, res, 'ویرایش پروفایل');
  res.render('user/profile', { seller: req.user.seller_id ? get('SELECT * FROM sellers WHERE id=@id', { id: req.user.seller_id }) : null });
});

router.post('/profile', media.upload.single('avatar'), (req, res) => {
  const data = { name: String(req.body.name || '').slice(0, 80), email: req.body.email || null, gender: req.body.gender || null, birth_date: req.body.birth_date || null, national_id: req.body.national_id || null, updated_at: now() };
  if (req.file) data.avatar = media.register(req.file, { userId: req.user.id, ownerType: 'user', folder: '/avatars' }).url;
  update('users', req.user.id, data);
  if (req.body.password) {
    if (String(req.body.password).length < 6) auth.flash(req, 'danger', 'گذرواژه حداقل ۶ کاراکتر باشد.');
    else run('UPDATE users SET password_hash=@h WHERE id=@id', { h: auth.hashPassword(req.body.password), id: req.user.id });
  }
  activity.logReq(req, 'profile_update', { description: 'ویرایش پروفایل' });
  if (!auth.flash) auth.flash = (q, t, m) => { q.session.flash = { type: t, message: m }; };
  req.session.flash = req.session.flash || { type: 'success', message: 'پروفایل بروزرسانی شد.' };
  res.redirect('/user/profile');
});

/* ---------------- فعالیت‌های اخیر ---------------- */

router.get('/activity', (req, res) => {
  locals(req, res, 'فعالیت‌های اخیر');
  res.render('user/activity', { rows: activity.forUser(req.user.id, 100) });
});

module.exports = router;
