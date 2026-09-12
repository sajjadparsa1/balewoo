'use strict';
const express = require('express');
const router = express.Router();
const { all, get, insert, update, run, db, jparse, jstringify, setting } = require('../../../db');
const auth = require('../../../core/auth');
const acl = require('../../../core/acl');
const notify = require('../../../core/notify');
const activity = require('../../../core/activity');
const orders = require('../../orders');
const media = require('../../../core/media');
const { now, toInt, toFloat, numberFormat, normalizePhone, isValidPhone, paginate, truncate, randomCode } = require('../../../core/utils');
const { formatJalali, formatJalaliLong, toPersianDigits, timeAgo } = require('../../../core/jalali');

/* ================= کاربران ================= */

router.get('/users', auth.requirePermission('users.view'), (req, res) => {
  const page = toInt(req.query.page, 1), perPage = 20;
  const where = ['u.deleted_at IS NULL'];
  const values = { l: perPage, o: (page - 1) * perPage };
  if (req.query.search) { where.push('(u.name LIKE @q OR u.phone LIKE @q OR u.email LIKE @q)'); values.q = `%${req.query.search}%`; }
  if (req.query.role) { where.push('u.role=@r'); values.r = req.query.role; }
  if (req.query.status) { where.push('u.status=@st'); values.st = req.query.status; }
  if (req.query.level) { where.push('u.club_level=@lv'); values.lv = req.query.level; }
  const W = where.join(' AND ');
  const total = get(`SELECT COUNT(*) AS c FROM users u WHERE ${W}`, values).c;
  const rows = all(`SELECT u.*, r.name AS role_name, s.shop_name,
                    (SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id) AS orders_count,
                    (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.user_id=u.id AND payment_status='paid') AS spending
                    FROM users u LEFT JOIN roles r ON r.id=u.role_id LEFT JOIN sellers s ON s.id=u.seller_id
                    WHERE ${W} ORDER BY u.id DESC LIMIT @l OFFSET @o`, values);
  res.locals.pageTitle = 'کاربران';
  res.render('admin/users', { rows, pg: paginate(total, page, perPage), roles: acl.allRoles(), levels: all('SELECT * FROM club_levels ORDER BY min_points') });
});

router.get('/users/:id', auth.requirePermission('users.view'), (req, res) => {
  const u = auth.findUser(toInt(req.params.id));
  if (!u) return res.redirect('/admin/people/users');
  res.locals.pageTitle = u.name || u.phone;
  res.render('admin/user-detail', {
    u,
    orders: all('SELECT * FROM orders WHERE user_id=@u ORDER BY id DESC LIMIT 20', { u: u.id }).map((o) => ({ ...o, status_title: orders.statusTitle(o.status) })),
    transactions: all('SELECT * FROM transactions WHERE user_id=@u ORDER BY id DESC LIMIT 20', { u: u.id }),
    addresses: all('SELECT * FROM addresses WHERE user_id=@u', { u: u.id }),
    tickets: all(`SELECT * FROM tickets WHERE owner_type='user' AND owner_id=@u ORDER BY id DESC LIMIT 10`, { u: u.id }),
    reviews: all(`SELECT r.*, p.title FROM reviews r JOIN products p ON p.id=r.product_id WHERE r.user_id=@u ORDER BY r.id DESC LIMIT 10`, { u: u.id }),
    clubActivities: all('SELECT * FROM club_activities WHERE user_id=@u ORDER BY id DESC LIMIT 20', { u: u.id }),
    sessions: auth.sessionsOf(u.id),
    activities: activity.forUser(u.id, 30),
    commissions: all('SELECT * FROM affiliate_commissions WHERE user_id=@u ORDER BY id DESC LIMIT 10', { u: u.id }),
    bankAccounts: all(`SELECT * FROM bank_accounts WHERE owner_type='user' AND owner_id=@u`, { u: u.id }),
    withdrawals: all(`SELECT * FROM withdrawals WHERE owner_type='user' AND owner_id=@u ORDER BY id DESC LIMIT 10`, { u: u.id }),
    seller: u.seller_id ? get('SELECT * FROM sellers WHERE id=@id', { id: u.seller_id }) : null,
    roles: acl.allRoles(),
  });
});

router.post('/users/:id', auth.requirePermission('users.manage'), (req, res) => {
  const id = toInt(req.params.id);
  const b = req.body;
  const data = { updated_at: now() };
  if (b.name !== undefined) data.name = b.name;
  if (b.email !== undefined) data.email = b.email || null;
  if (b.status !== undefined) data.status = b.status;
  if (b.role !== undefined) data.role = b.role;
  if (b.role_id !== undefined) data.role_id = toInt(b.role_id) || null;
  if (b.password) data.password_hash = auth.hashPassword(b.password);
  update('users', id, data);
  activity.logReq(req, 'user_update', { subjectType: 'user', subjectId: id, description: b.name || '' });
  auth.flash(req, 'success', 'اطلاعات کاربر بروزرسانی شد.');
  res.redirect('/admin/people/users/' + id);
});

router.post('/users/:id/wallet', auth.requirePermission('users.wallet'), (req, res) => {
  const id = toInt(req.params.id);
  const amount = toInt(req.body.amount);
  if (!amount) { auth.flash(req, 'danger', 'مبلغ را وارد کنید.'); return res.redirect('back'); }
  const u = get('SELECT wallet, name, phone FROM users WHERE id=@id', { id });
  if (!u) return res.redirect('/admin/people/users');
  if (u.wallet + amount < 0) { auth.flash(req, 'danger', 'موجودی کیف پول منفی می‌شود.'); return res.redirect('back'); }
  run('UPDATE users SET wallet = wallet + @a WHERE id=@id', { a: amount, id });
  const bal = get('SELECT wallet FROM users WHERE id=@id', { id });
  insert('transactions', {
    user_id: id, owner_type: 'user', owner_id: id, type: 'adjust', amount, balance: bal.wallet, gateway: 'admin',
    reference: 'ADJ-' + randomCode('', 6), status: 'success', description: req.body.description || (amount > 0 ? 'شارژ توسط مدیر' : 'کسر توسط مدیر'), created_at: now(),
  });
  notify.push(id, { type: 'wallet', icon: 'wallet', title: amount > 0 ? 'شارژ کیف پول' : 'کسر از کیف پول', body: `${numberFormat(Math.abs(amount))} تومان ${amount > 0 ? 'به کیف پول شما اضافه شد' : 'از کیف پول شما کسر شد'}.`, link: '/user/wallet' });
  activity.logReq(req, 'wallet_adjust', { subjectType: 'user', subjectId: id, description: `${numberFormat(amount)} تومان` });
  auth.flash(req, 'success', 'کیف پول بروزرسانی شد.');
  res.redirect('back');
});

router.post('/users/:id/points', auth.requirePermission('users.points'), (req, res) => {
  const id = toInt(req.params.id);
  const points = toInt(req.body.points);
  if (!points) return res.redirect('back');
  run('UPDATE users SET points = MAX(0, points + @p) WHERE id=@id', { p: points, id });
  insert('club_activities', { user_id: id, points, reason: 'admin', reference: req.body.reason || null, created_at: now() });
  const level = orders.clubLevelFor(id);
  run('UPDATE users SET club_level=@l WHERE id=@id', { l: level, id });
  notify.push(id, notify.T.pointsAwarded(numberFormat(Math.abs(points))));
  activity.logReq(req, 'points_adjust', { subjectType: 'user', subjectId: id, description: `${points} امتیاز` });
  auth.flash(req, 'success', 'امتیاز باشگاه مشتریان بروزرسانی شد.');
  res.redirect('back');
});

router.post('/users/:id/block', auth.requirePermission('users.manage'), (req, res) => {
  const id = toInt(req.params.id);
  const status = req.body.status === 'blocked' ? 'blocked' : 'active';
  run('UPDATE users SET status=@s WHERE id=@id', { s: status, id });
  if (status === 'blocked') run('UPDATE user_sessions SET revoked_at=@t WHERE user_id=@u AND revoked_at IS NULL', { t: now(), u: id });
  activity.logReq(req, status === 'blocked' ? 'user_block' : 'user_unblock', { subjectType: 'user', subjectId: id });
  auth.flash(req, 'success', status === 'blocked' ? 'کاربر مسدود شد.' : 'مسدودسازی کاربر لغو شد.');
  res.redirect('back');
});

router.post('/users/:id/delete', auth.requirePermission('users.manage'), (req, res) => {
  run('UPDATE users SET deleted_at=@t WHERE id=@id', { t: now(), id: toInt(req.params.id) });
  auth.flash(req, 'success', 'کاربر به سطل زباله منتقل شد.');
  res.redirect('/admin/people/users');
});

/* ================= فروشندگان ================= */

router.get('/sellers', auth.requirePermission('sellers.view'), (req, res) => {
  const page = toInt(req.query.page, 1), perPage = 20;
  const where = ['s.deleted_at IS NULL'];
  const values = { l: perPage, o: (page - 1) * perPage };
  if (req.query.status) { where.push('s.status=@st'); values.st = req.query.status; }
  if (req.query.search) { where.push('(s.shop_name LIKE @q OR s.phone LIKE @q OR s.national_id LIKE @q)'); values.q = `%${req.query.search}%`; }
  const W = where.join(' AND ');
  const total = get(`SELECT COUNT(*) AS c FROM sellers s WHERE ${W}`, values).c;
  const rows = all(`SELECT s.*, u.name AS owner_name, u.phone AS owner_phone, u.status AS owner_status,
                    (SELECT COUNT(*) FROM products p WHERE p.seller_id=s.id AND p.deleted_at IS NULL) AS products_count,
                    (SELECT COALESCE(SUM(oi.total),0) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.seller_id=s.id AND o.payment_status='paid') AS revenue
                    FROM sellers s LEFT JOIN users u ON u.id=s.user_id WHERE ${W} ORDER BY s.id DESC LIMIT @l OFFSET @o`, values);
  res.locals.pageTitle = 'فروشندگان';
  res.render('admin/sellers', { rows, pg: paginate(total, page, perPage) });
});

router.get('/sellers/:id', auth.requirePermission('sellers.view'), (req, res) => {
  const s = get('SELECT * FROM sellers WHERE id=@id', { id: toInt(req.params.id) });
  if (!s) return res.redirect('/admin/people/sellers');
  s.documents = jparse(s.documents, []);
  res.locals.pageTitle = s.shop_name;
  res.render('admin/seller-detail', {
    s,
    owner: s.user_id ? auth.findUser(s.user_id) : null,
    products: all('SELECT id,title,price,stock,status,views,sold FROM products WHERE seller_id=@s AND deleted_at IS NULL ORDER BY id DESC LIMIT 30', { s: s.id }),
    orderItems: all(`SELECT oi.*, o.code AS order_code, o.created_at AS order_date FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.seller_id=@s ORDER BY oi.id DESC LIMIT 20`, { s: s.id }),
    settlements: all('SELECT * FROM settlements WHERE seller_id=@s ORDER BY id DESC LIMIT 20', { s: s.id }),
    warehouses: all('SELECT * FROM warehouses WHERE owner_type=\'seller\' AND owner_id=@s', { s: s.id }),
    bankAccounts: all(`SELECT * FROM bank_accounts WHERE owner_type='seller' AND owner_id=@s`, { s: s.id }),
    withdrawals: all(`SELECT * FROM withdrawals WHERE owner_type='seller' AND owner_id=@s ORDER BY id DESC LIMIT 10`, { s: s.id }),
    tickets: all(`SELECT * FROM tickets WHERE owner_type='seller' AND owner_id=@s ORDER BY id DESC LIMIT 10`, { s: s.id }),
    reviews: all(`SELECT r.*, p.title, u.name AS author FROM reviews r JOIN products p ON p.id=r.product_id LEFT JOIN users u ON u.id=r.user_id WHERE p.seller_id=@s ORDER BY r.id DESC LIMIT 10`, { s: s.id }),
    stats: {
      revenue: get(`SELECT COALESCE(SUM(oi.total),0) AS s FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.seller_id=@sid AND o.payment_status='paid'`, { sid: s.id }).s,
      commission: get(`SELECT COALESCE(SUM(oi.commission),0) AS s FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.seller_id=@sid AND o.payment_status='paid'`, { sid: s.id }).s,
      canceled: get(`SELECT COUNT(*) AS c FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.seller_id=@sid AND o.status='canceled'`, { sid: s.id }).c,
      returned: get(`SELECT COUNT(*) AS c FROM order_items oi WHERE oi.seller_id=@sid AND oi.status='returned'`, { sid: s.id }).c,
      delivered: get(`SELECT COUNT(*) AS c FROM order_items oi WHERE oi.seller_id=@sid AND oi.status='delivered'`, { sid: s.id }).c,
    },
  });
});

router.post('/sellers/:id/status', auth.requirePermission('sellers.approve'), (req, res) => {
  const id = toInt(req.params.id);
  const s = get('SELECT * FROM sellers WHERE id=@id', { id });
  if (!s) return res.redirect('/admin/people/sellers');
  const status = req.body.status;
  run('UPDATE sellers SET status=@s, updated_at=@t WHERE id=@id', { s: status, t: now(), id });
  run('UPDATE users SET status=@s WHERE id=@u', { s: status === 'active' ? 'active' : status, u: s.user_id });
  if (status === 'active') notify.push(s.user_id, notify.T.sellerApproved(s.shop_name));
  if (status === 'blocked') notify.push(s.user_id, notify.T.sellerRejected());
  if (status === 'rejected') notify.push(s.user_id, notify.T.sellerRejected());
  activity.logReq(req, status === 'active' ? 'seller_approve' : 'seller_block', { subjectType: 'seller', subjectId: id, description: s.shop_name });
  auth.flash(req, 'success', 'وضعیت فروشنده بروزرسانی شد.');
  res.redirect('back');
});

router.post('/sellers/:id', auth.requirePermission('sellers.manage'), (req, res) => {
  const id = toInt(req.params.id);
  const b = req.body;
  update('sellers', id, {
    shop_name: b.shop_name, shop_en: b.shop_en || null, description: b.description || null,
    phone: b.phone, email: b.email || null, province: b.province, city: b.city, address: b.address || null,
    commission: toFloat(b.commission), settlement_days: toInt(b.settlement_days, 7),
    direct_shipping: b.direct_shipping ? 1 : 0, score: toFloat(b.score, 5), updated_at: now(),
  });
  activity.logReq(req, 'seller_update', { subjectType: 'seller', subjectId: id, description: b.shop_name });
  auth.flash(req, 'success', 'اطلاعات فروشگاه بروزرسانی شد.');
  res.redirect('back');
});

router.post('/sellers/:id/wallet', auth.requirePermission('sellers.manage'), (req, res) => {
  const id = toInt(req.params.id);
  const amount = toInt(req.body.amount);
  run('UPDATE sellers SET wallet = MAX(0, wallet + @a) WHERE id=@id', { a: amount, id });
  activity.logReq(req, 'seller_wallet', { subjectType: 'seller', subjectId: id, description: numberFormat(amount) });
  const s = get('SELECT user_id, shop_name FROM sellers WHERE id=@id', { id });
  if (s?.user_id) notify.push(s.user_id, { type: 'wallet', icon: 'wallet', title: 'تغییر موجودی فروشگاه', body: `${numberFormat(Math.abs(amount))} تومان ${amount > 0 ? 'افزوده' : 'کسر'} شد.`, link: '/seller/settlements' });
  auth.flash(req, 'success', 'موجودی فروشنده بروزرسانی شد.');
  res.redirect('back');
});

router.get('/withdrawals', auth.requirePermission('users.wallet'), (req, res) => {
  res.locals.pageTitle = 'درخواست‌های برداشت';
  res.render('admin/withdrawals', {
    rows: all(`SELECT w.*, u.name AS user_name, u.phone AS user_phone, s.shop_name, b.bank_name, b.card_number, b.owner_name AS account_owner
               FROM withdrawals w
               LEFT JOIN users u ON (w.owner_type='user' AND u.id=w.owner_id)
               LEFT JOIN sellers s ON (w.owner_type='seller' AND s.id=w.owner_id)
               LEFT JOIN bank_accounts b ON b.id=w.bank_account_id
               ORDER BY w.id DESC LIMIT 200`),
  });
});

router.post('/withdrawals/:id', auth.requirePermission('users.wallet'), (req, res) => {
  const id = toInt(req.params.id);
  const w = get('SELECT * FROM withdrawals WHERE id=@id', { id });
  if (!w) return res.redirect('/admin/people/withdrawals');
  const status = req.body.status;
  update('withdrawals', id, { status, admin_note: req.body.note || null, reference: req.body.reference || null, updated_at: now() });
  if (status === 'rejected') {
    if (w.owner_type === 'user') run('UPDATE users SET wallet = wallet + @a WHERE id=@id', { a: w.amount, id: w.owner_id });
    else run('UPDATE sellers SET wallet = wallet + @a WHERE id=@id', { a: w.amount, id: w.owner_id });
  }
  if (status === 'paid') {
    run(`UPDATE transactions SET status='success' WHERE type='withdraw_request' AND owner_id=@o AND amount=-@a AND status='pending'`, { o: w.owner_id, a: w.amount });
    insert('transactions', { user_id: w.owner_type === 'user' ? w.owner_id : null, owner_type: w.owner_type, owner_id: w.owner_id, type: 'withdraw', amount: -w.amount, gateway: 'bank', reference: req.body.reference || 'BANK', status: 'success', description: 'پرداخت برداشت وجه', created_at: now() });
  }
  const userId = w.owner_type === 'user' ? w.owner_id : get('SELECT user_id FROM sellers WHERE id=@id', { id: w.owner_id })?.user_id;
  if (userId) notify.push(userId, status === 'paid' ? notify.T.withdrawPaid(numberFormat(w.amount)) : { type: 'wallet', icon: 'x', title: 'درخواست برداشت رد شد', body: req.body.note || 'درخواست شما تایید نشد.', link: '/user/withdrawals' });
  activity.logReq(req, 'withdraw_review', { subjectType: 'withdrawal', subjectId: id, description: status });
  auth.flash(req, 'success', 'وضعیت برداشت بروزرسانی شد.');
  res.redirect('/admin/people/withdrawals');
});

router.post('/bank-accounts/:id/approve', auth.requirePermission('users.wallet'), (req, res) => {
  run('UPDATE bank_accounts SET status=@s WHERE id=@id', { s: req.body.status || 'approved', id: toInt(req.params.id) });
  auth.flash(req, 'success', 'حساب بانکی بروزرسانی شد.');
  res.redirect('back');
});

router.get('/settlements', auth.requirePermission('settlements.manage'), (req, res) => {
  res.locals.pageTitle = 'تسویه فروشندگان';
  res.render('admin/settlements', {
    rows: all(`SELECT st.*, s.shop_name, o.code AS order_code FROM settlements st JOIN sellers s ON s.id=st.seller_id LEFT JOIN order_items oi ON oi.id=st.order_item_id LEFT JOIN orders o ON o.id=oi.order_id ORDER BY st.id DESC LIMIT 300`),
    dueTotal: get(`SELECT COALESCE(SUM(net),0) AS s FROM settlements WHERE status='pending' AND due_at<=datetime('now')`).s,
    pendingTotal: get(`SELECT COALESCE(SUM(net),0) AS s FROM settlements WHERE status='pending'`).s,
    paidTotal: get(`SELECT COALESCE(SUM(net),0) AS s FROM settlements WHERE status='paid'`).s,
  });
});

router.post('/settlements/pay', auth.requirePermission('settlements.manage'), (req, res) => {
  const ids = [].concat(req.body.ids || []).map(toInt).filter(Boolean);
  const all_due = req.body.all_due === '1';
  db.transaction(() => {
    if (all_due) run(`UPDATE settlements SET status='paid', paid_at=@t WHERE status='pending' AND due_at<=datetime('now')`, { t: now() });
    else for (const id of ids) run(`UPDATE settlements SET status='paid', paid_at=@t WHERE id=@id`, { t: now(), id });
  })();
  activity.logReq(req, 'settlement_pay', { description: all_due ? 'پرداخت همه سررسیدها' : `${ids.length} مورد` });
  auth.flash(req, 'success', 'تسویه‌ها پرداخت‌شده علامت خوردند.');
  res.redirect('/admin/people/settlements');
});

/* ================= نقش‌ها و مدیران ================= */

router.get('/roles', auth.requirePermission('roles.manage'), (req, res) => {
  res.locals.pageTitle = 'نقش‌ها و دسترسی‌ها';
  res.render('admin/roles', {
    roles: acl.allRoles().map((r) => ({ ...r, permissions: jparse(r.permissions, []) })),
    groups: acl.listPermissions(),
    admins: all(`SELECT u.*, r.name AS role_name FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.role IN ('staff','admin') AND u.deleted_at IS NULL ORDER BY u.id DESC`),
    allAdmins: all(`SELECT id,name,phone FROM users WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 300`),
  });
});

router.post('/roles', auth.requirePermission('roles.manage'), (req, res) => {
  const b = req.body;
  const permissions = [].concat(b.permissions || []).filter(Boolean);
  if (b.id) { acl.updateRole(toInt(b.id), { name: b.name, permissions }); }
  else { acl.createRole({ name: b.name, slug: (b.slug || require('../../../core/utils').slugify(b.name)), permissions }); }
  activity.logReq(req, 'role_update', { subjectType: 'role', description: b.name });
  auth.flash(req, 'success', 'نقش ذخیره شد.');
  res.redirect('/admin/people/roles');
});

router.post('/roles/:id/delete', auth.requirePermission('roles.manage'), (req, res) => {
  const r = acl.findRole(toInt(req.params.id));
  if (r && !r.is_system) run('DELETE FROM roles WHERE id=@id', { id: r.id });
  auth.flash(req, r?.is_system ? 'danger' : 'success', r?.is_system ? 'نقش‌های سیستمی قابل حذف نیستند.' : 'نقش حذف شد.');
  res.redirect('/admin/people/roles');
});

router.post('/admins', auth.requirePermission('admins.manage'), (req, res) => {
  const b = req.body;
  const userId = toInt(b.user_id);
  const u = get('SELECT * FROM users WHERE id=@id AND deleted_at IS NULL', { id: userId });
  if (!u) { auth.flash(req, 'danger', 'کاربر یافت نشد.'); return res.redirect('/admin/people/roles'); }
  const phone = normalizePhone(b.phone || u.phone);
  if (!isValidPhone(phone)) { auth.flash(req, 'danger', 'شماره موبایل معتبر نیست.'); return res.redirect('/admin/people/roles'); }
  let target = get('SELECT id FROM users WHERE phone=@p AND id<>@id', { p: phone, id: userId });
  if (!target) target = { id: userId };
  update('users', target.id, { phone, name: b.name || u.name, role: b.is_super ? 'admin' : 'staff', role_id: toInt(b.role_id) || null, password_hash: b.password ? auth.hashPassword(b.password) : u.password_hash, status: 'active', email: b.email || u.email });
  activity.logReq(req, 'admin_create', { subjectType: 'user', subjectId: target.id, description: b.name });
  notify.push(target.id, { type: 'info', icon: 'shield', title: 'دسترسی مدیریت', body: 'دسترسی پنل مدیریت برای حساب شما فعال شد.', link: '/admin/dashboard' });
  auth.flash(req, 'success', 'مدیر ذخیره شد.');
  res.redirect('/admin/people/roles');
});

router.post('/admins/:id/remove', auth.requirePermission('admins.manage'), (req, res) => {
  const u = get('SELECT * FROM users WHERE id=@id', { id: toInt(req.params.id) });
  if (u && u.role !== 'admin') { run(`UPDATE users SET role='customer', role_id=NULL WHERE id=@id`, { id: u.id }); auth.flash(req, 'success', 'دسترسی مدیریتی لغو شد.'); }
  else auth.flash(req, 'danger', 'حداقل یک مدیر کل باید باقی بماند.');
  res.redirect('/admin/people/roles');
});

/* ================= همکاری در فروش ================= */

router.get('/affiliates', auth.requirePermission('affiliates.manage'), (req, res) => {
  res.locals.pageTitle = 'همکاری در فروش';
  res.render('admin/affiliates', {
    affiliates: all(`SELECT u.*, (SELECT COALESCE(SUM(amount),0) FROM affiliate_commissions ac WHERE ac.user_id=u.id) AS earned,
                     (SELECT COUNT(*) FROM affiliate_referrals ar WHERE ar.affiliate_id=u.id) AS referrals
                     FROM users u WHERE u.is_affiliate=1 AND u.deleted_at IS NULL ORDER BY earned DESC LIMIT 200`),
    commissions: all(`SELECT ac.*, u.name AS affiliate_name, p.title AS product_title, o.code AS order_code
                      FROM affiliate_commissions ac LEFT JOIN users u ON u.id=ac.user_id LEFT JOIN products p ON p.id=ac.product_id LEFT JOIN orders o ON o.id=ac.order_id
                      ORDER BY ac.id DESC LIMIT 200`),
    stats: {
      total: get(`SELECT COALESCE(SUM(amount),0) AS s FROM affiliate_commissions`).s,
      paid: get(`SELECT COALESCE(SUM(amount),0) AS s FROM affiliate_commissions WHERE status='paid'`).s,
      pending: get(`SELECT COALESCE(SUM(amount),0) AS s FROM affiliate_commissions WHERE status='pending'`).s,
      count: get(`SELECT COUNT(*) AS c FROM affiliate_commissions`).c,
      clicks: get(`SELECT COUNT(*) AS c FROM affiliate_clicks`).c,
    },
  });
});

router.post('/affiliates/:id/status', auth.requirePermission('affiliates.manage'), (req, res) => {
  const id = toInt(req.params.id);
  const userId = toInt(req.body.user_id);
  if (req.body.commission) {
    run('UPDATE affiliate_commissions SET status=@s WHERE id=@id', { s: req.body.commission, id });
    if (req.body.commission === 'paid') {
      const c = get('SELECT * FROM affiliate_commissions WHERE id=@id', { id });
      run('UPDATE users SET wallet = wallet + @a WHERE id=@u', { a: c.amount, u: c.user_id });
      insert('transactions', { user_id: c.user_id, owner_type: 'user', owner_id: c.user_id, type: 'affiliate', amount: c.amount, gateway: 'admin', reference: 'AFF-PAY', order_id: c.order_id, status: 'success', description: 'پرداخت پورسانت همکاری در فروش', created_at: now() });
    }
  } else {
    run('UPDATE users SET is_affiliate=@v WHERE id=@id', { v: req.body.enabled === '1' ? 1 : 0, id: userId });
  }
  auth.flash(req, 'success', 'بروزرسانی شد.');
  res.redirect('/admin/people/affiliates');
});

/* ================= باشگاه مشتریان ================= */

router.get('/club', auth.requirePermission('club.manage'), (req, res) => {
  res.locals.pageTitle = 'باشگاه مشتریان';
  res.render('admin/club', {
    levels: all('SELECT * FROM club_levels ORDER BY min_points ASC').map((l) => ({ ...l, perks: jparse(l.perks, []), users: get('SELECT COUNT(*) AS c FROM users WHERE club_level=@l', { l: l.level }).c })),
    activities: all('SELECT ca.*, u.name, u.phone FROM club_activities ca LEFT JOIN users u ON u.id=ca.user_id ORDER BY ca.id DESC LIMIT 100'),
    top: all('SELECT id,name,phone,points,club_level FROM users WHERE deleted_at IS NULL ORDER BY points DESC LIMIT 20'),
  });
});

router.post('/club/levels', auth.requirePermission('club.manage'), (req, res) => {
  const b = req.body;
  for (let i = 0; i < [].concat(b.level || []).length; i++) {
    const level = [].concat(b.level)[i];
    if (!level) continue;
    const perks = String([].concat(b.perks || [])[i] || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const data = { title: [].concat(b.title || [])[i], min_points: toInt([].concat(b.min_points || [])[i]), color: [].concat(b.color || [])[i] || '#6366f1', perks: jstringify(perks), discount: toFloat([].concat(b.discount || [])[i]) };
    const existing = get('SELECT id FROM club_levels WHERE level=@l', { l: level });
    if (existing) update('club_levels', existing.id, data); else insert('club_levels', { level, ...data });
  }
  // بازمحاسبه سطح کاربران
  for (const u of all('SELECT id, points FROM users WHERE deleted_at IS NULL')) {
    const lvl = orders.clubLevelFor(u.id);
    run('UPDATE users SET club_level=@l WHERE id=@id', { l: lvl, id: u.id });
  }
  auth.flash(req, 'success', 'سطح‌های باشگاه مشتریان ذخیره شد.');
  res.redirect('/admin/people/club');
});

module.exports = router;
