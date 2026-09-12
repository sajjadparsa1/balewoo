'use strict';
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { all, get, insert, update, run, db, jparse, jstringify, setting, setSetting, DATA_DIR } = require('../../../db');
const auth = require('../../../core/auth');
const acl = require('../../../core/acl');
const notify = require('../../../core/notify');
const activity = require('../../../core/activity');
const media = require('../../../core/media');
const cache = require('../../../core/cache');
const orders = require('../../orders');
const smsService = require('../../../services/sms');
const { now, toInt, numberFormat, paginate, truncate, humanSize, slugify } = require('../../../core/utils');
const { formatJalali, toPersianDigits, timeAgo } = require('../../../core/jalali');

/* ================= کتابخانه مدیا ================= */

router.get('/media', auth.requirePermission('media.view'), (req, res) => {
  const page = toInt(req.query.page, 1), perPage = 40;
  const result = media.list({ folder: req.query.folder === '/' ? null : req.query.folder, q: req.query.q, limit: perPage, offset: (page - 1) * perPage });
  // پاسخ JSON برای انتخابگر مدیا (پنجره کتابخانه در فرم‌ها)
  if (req.query.ajax || req.xhr) return res.json({ ok: true, rows: result.rows, total: result.total, folders: media.folders() });
  res.locals.pageTitle = 'کتابخانه مدیا';
  res.render('admin/media', { rows: result.rows, pg: paginate(result.total, page, perPage), folders: media.folders(), stats: media.stats() });
});

router.post('/media/upload', auth.requirePermission('media.upload'), media.upload.array('files', 12), (req, res) => {
  const uploaded = [];
  for (const f of req.files || []) uploaded.push(media.register(f, { userId: req.user.id, folder: req.body.folder || '/' }));
  activity.logReq(req, 'media_upload', { description: `${uploaded.length} فایل` });
  if (req.xhr) return res.json({ ok: true, files: uploaded });
  auth.flash(req, 'success', `${toPersianDigits(uploaded.length)} فایل بارگذاری شد.`);
  res.redirect('/admin/system/media');
});

router.post('/media/:id/update', auth.requirePermission('media.upload'), (req, res) => {
  media.updateMedia(toInt(req.params.id), { alt: req.body.alt, folder: req.body.folder });
  if (req.xhr) return res.json({ ok: true });
  res.redirect('/admin/system/media');
});

router.post('/media/:id/delete', auth.requirePermission('media.delete'), (req, res) => {
  media.destroy(toInt(req.params.id));
  if (req.xhr) return res.json({ ok: true });
  auth.flash(req, 'success', 'فایل حذف شد.');
  res.redirect('/admin/system/media');
});

/* ================= تیکت‌ها ================= */

router.get('/tickets', auth.requirePermission('tickets.view'), (req, res) => {
  const page = toInt(req.query.page, 1), perPage = 20;
  const where = ['1=1'];
  const values = { l: perPage, o: (page - 1) * perPage };
  if (req.query.status) { where.push('t.status=@st'); values.st = req.query.status; }
  if (req.query.department) { where.push('t.department=@d'); values.d = req.query.department; }
  if (req.query.search) { where.push('(t.code LIKE @q OR t.subject LIKE @q)'); values.q = `%${req.query.search}%`; }
  const W = where.join(' AND ');
  const total = get(`SELECT COUNT(*) AS c FROM tickets t WHERE ${W}`, values).c;
  const rows = all(`SELECT t.*, u.name AS owner_name, u.phone AS owner_phone, s.shop_name,
                    (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id=t.id) AS messages
                    FROM tickets t LEFT JOIN users u ON u.id=t.owner_id LEFT JOIN sellers s ON s.id=t.seller_id
                    WHERE ${W} ORDER BY t.id DESC LIMIT @l OFFSET @o`, values);
  res.locals.pageTitle = 'تیکت‌ها';
  res.render('admin/tickets', { rows, pg: paginate(total, page, perPage) });
});

router.get('/tickets/:code', auth.requirePermission('tickets.view'), (req, res) => {
  const t = get('SELECT * FROM tickets WHERE code=@c', { c: req.params.code });
  if (!t) return res.redirect('/admin/system/tickets');
  res.locals.pageTitle = `تیکت ${t.code}`;
  res.render('admin/ticket', {
    ticket: t,
    messages: all('SELECT m.*, u.name AS author, u.role FROM ticket_messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.ticket_id=@t ORDER BY m.id ASC', { t: t.id }),
    owner: t.owner_id ? auth.findUser(t.owner_id) : null,
    order: t.order_id ? orders.detail(t.order_id) : null,
    seller: t.seller_id ? get('SELECT * FROM sellers WHERE id=@id', { id: t.seller_id }) : null,
    admins: all(`SELECT id,name FROM users WHERE role IN ('staff','admin') AND deleted_at IS NULL`),
  });
});

router.post('/tickets/:code/reply', auth.requirePermission('tickets.manage'), media.upload.single('attachment'), (req, res) => {
  const t = get('SELECT * FROM tickets WHERE code=@c', { c: req.params.code });
  if (!t) return res.redirect('/admin/system/tickets');
  const attach = req.file ? media.register(req.file, { userId: req.user.id, folder: '/tickets' }).url : null;
  insert('ticket_messages', { ticket_id: t.id, user_id: req.user.id, role_label: 'admin', body: req.body.body, attachment: attach, is_internal: req.body.internal ? 1 : 0, created_at: now() });
  run(`UPDATE tickets SET status=@s, last_message_at=@t, messages_count=messages_count+1, assignee_id=@a, updated_at=@t WHERE id=@id`,
    { s: req.body.close ? 'closed' : 'open', t: now(), a: toInt(req.body.assignee_id) || t.assignee_id, id: t.id });
  if (!req.body.internal) {
    const userId = t.owner_type === 'user' ? t.owner_id : get('SELECT user_id FROM sellers WHERE id=@id', { id: t.owner_id })?.user_id;
    if (userId) {
      notify.push(userId, { ...notify.T.ticketReply(t.code), link: t.owner_type === 'seller' ? `/seller/tickets/${t.code}` : `/user/tickets/${t.code}` });
      if (setting('sms_notify_ticket', '0') === '1') smsService.send({ phone: get('SELECT phone FROM users WHERE id=@id', { id: userId })?.phone, body: `پاسخ تیکت ${t.code} در ${setting('site_name', 'بالی‌وو')}` });
    }
  }
  activity.logReq(req, 'ticket_reply', { subjectType: 'ticket', subjectId: t.id, description: t.code });
  res.redirect('/admin/system/tickets/' + t.code);
});

router.post('/tickets/:code/status', auth.requirePermission('tickets.manage'), (req, res) => {
  run('UPDATE tickets SET status=@s, updated_at=@t WHERE code=@c', { s: req.body.status, t: now(), c: req.params.code });
  res.redirect('back');
});

/* ================= اعلان‌ها ================= */

router.get('/notifications', auth.requirePermission('notifications.send'), (req, res) => {
  res.locals.pageTitle = 'ارسال اعلان';
  res.render('admin/notifications', {
    recent: all('SELECT n.*, u.name, u.phone FROM notifications n LEFT JOIN users u ON u.id=n.user_id ORDER BY n.id DESC LIMIT 40'),
    segments: [
      { key: 'all', title: 'همه کاربران', count: get(`SELECT COUNT(*) AS c FROM users WHERE deleted_at IS NULL AND role='customer'`).c },
      { key: 'buyers', title: 'خریداران (حداقل یک سفارش)', count: get(`SELECT COUNT(DISTINCT user_id) AS c FROM orders WHERE user_id IS NOT NULL`).c },
      { key: 'club_gold', title: 'اعضای طلایی باشگاه', count: get(`SELECT COUNT(*) AS c FROM users WHERE club_level='gold'`).c },
      { key: 'club_silver', title: 'اعضای نقره‌ای باشگاه', count: get(`SELECT COUNT(*) AS c FROM users WHERE club_level='silver'`).c },
      { key: 'sellers', title: 'فروشندگان فعال', count: get(`SELECT COUNT(*) AS c FROM sellers WHERE status='active'`).c },
      { key: 'inactive30', title: 'کاربران غیرفعال ۳۰ روز', count: get(`SELECT COUNT(*) AS c FROM users WHERE last_seen_at < datetime('now','-30 days') OR last_seen_at IS NULL`).c },
    ],
  });
});

router.post('/notifications/send', auth.requirePermission('notifications.send'), (req, res) => {
  const { segment, title, body, link, type, sendSms } = req.body;
  let users = [];
  switch (segment) {
    case 'all': users = all(`SELECT id, phone FROM users WHERE deleted_at IS NULL`); break;
    case 'buyers': users = all(`SELECT DISTINCT user_id AS id FROM orders WHERE user_id IS NOT NULL`); break;
    case 'club_gold': users = all(`SELECT id, phone FROM users WHERE club_level='gold'`); break;
    case 'club_silver': users = all(`SELECT id, phone FROM users WHERE club_level='silver'`); break;
    case 'sellers': users = all(`SELECT user_id AS id, phone FROM sellers WHERE status='active'`); break;
    case 'inactive30': users = all(`SELECT id, phone FROM users WHERE last_seen_at < datetime('now','-30 days') OR last_seen_at IS NULL`); break;
    case 'single': {
      const one = get('SELECT id, phone FROM users WHERE id=@id AND deleted_at IS NULL', { id: toInt(req.body.user_id) });
      users = one ? [one] : [];
      break;
    }
    case 'phones': users = String(req.body.phones || '').split(/[\n,،\s]+/).filter(Boolean).map((p) => ({ id: get('SELECT id FROM users WHERE phone=@p', { p: require('../../../core/utils').normalizePhone(p) })?.id, phone: p })).filter((u) => u.id); break;
    default: users = [];
  }
  let n = 0;
  db.transaction(() => {
    for (const u of users) {
      notify.push(u.id, { type: type || 'info', title, body, link: link || '', sendSms: sendSms === '1', icon: 'megaphone' });
      n++;
    }
  })();
  activity.logReq(req, 'notification_send', { description: `${n} گیرنده — ${truncate(title, 40)}` });
  auth.flash(req, 'success', `اعلان برای ${toPersianDigits(n)} کاربر ارسال شد.`);
  res.redirect('/admin/system/notifications');
});

/* ================= گزارش فعالیت‌ها ================= */

router.get('/activities', auth.requirePermission('logs.view'), (req, res) => {
  const page = toInt(req.query.page, 1), perPage = 40;
  const where = ['1=1'];
  const values = { l: perPage, o: (page - 1) * perPage };
  if (req.query.user) { where.push('a.user_id=@u'); values.u = toInt(req.query.user); }
  if (req.query.action) { where.push('a.action=@ac'); values.ac = req.query.action; }
  if (req.query.from) where.push(`date(a.created_at) >= date('${req.query.from}')`);
  const W = where.join(' AND ');
  const total = get(`SELECT COUNT(*) AS c FROM activity_logs a WHERE ${W}`, values).c;
  res.locals.pageTitle = 'فعالیت‌های اخیر';
  res.render('admin/activities', {
    rows: all(`SELECT a.*, u.name AS user_name, u.phone FROM activity_logs a LEFT JOIN users u ON u.id=a.user_id WHERE ${W} ORDER BY a.id DESC LIMIT @l OFFSET @o`, values),
    pg: paginate(total, page, perPage),
    actions: all('SELECT DISTINCT action FROM activity_logs ORDER BY action'),
    summary: activity.actionsSummary(30),
  });
});

router.post('/activities/purge', auth.requirePermission('logs.view'), (req, res) => {
  const n = activity.purgeOlderThan(toInt(req.body.days, 120));
  auth.flash(req, 'success', `${toPersianDigits(n)} رکورد قدیمی پاک شد.`);
  res.redirect('/admin/system/activities');
});

/* ================= نشست‌های فعال ================= */

router.get('/sessions', auth.requirePermission('sessions.manage'), (req, res) => {
  res.locals.pageTitle = 'نشست‌های فعال';
  res.render('admin/sessions', {
    rows: all(`SELECT us.*, u.name, u.phone, u.role FROM user_sessions us JOIN users u ON u.id=us.user_id WHERE us.revoked_at IS NULL ORDER BY us.last_seen_at DESC LIMIT 300`),
  });
});
router.post('/sessions/:id/revoke', auth.requirePermission('sessions.manage'), (req, res) => {
  run('UPDATE user_sessions SET revoked_at=@t WHERE id=@id', { t: now(), id: toInt(req.params.id) });
  activity.logReq(req, 'session_revoke', { description: `نشست #${req.params.id}` });
  auth.flash(req, 'success', 'نشست خاتمه یافت.');
  res.redirect('/admin/system/sessions');
});
router.post('/sessions/revoke-user/:userId', auth.requirePermission('sessions.manage'), (req, res) => {
  run('UPDATE user_sessions SET revoked_at=@t WHERE user_id=@u', { t: now(), u: toInt(req.params.userId) });
  auth.flash(req, 'success', 'همه نشست‌های این کاربر خاتمه یافت.');
  res.redirect('back');
});

/* ================= آمار و نمودارها ================= */

router.get('/reports', auth.requirePermission('reports.view'), (req, res) => {
  const days = toInt(req.query.days, 30);
  res.locals.pageTitle = 'آمار و گزارش‌ها';
  const sales = all(`SELECT date(created_at) AS d, COUNT(*) AS c, COALESCE(SUM(total),0) AS revenue
                     FROM orders WHERE created_at >= datetime('now','-${days} days') GROUP BY date(created_at) ORDER BY d ASC`);
  const visits = all(`SELECT date(created_at) AS d, COUNT(*) AS c, COUNT(DISTINCT ip) AS uniq
                      FROM page_views WHERE created_at >= datetime('now','-${days} days') GROUP BY date(created_at) ORDER BY d ASC`);
  const byGateway = all(`SELECT COALESCE(payment_method,'—') AS m, COUNT(*) AS c, COALESCE(SUM(total),0) AS s FROM orders WHERE payment_status='paid' GROUP BY payment_method ORDER BY s DESC`);
  const byCategory = all(`SELECT c.name, COUNT(p.id) AS products, COALESCE(SUM(p.sold),0) AS sold
                          FROM categories c LEFT JOIN products p ON p.category_id=c.id AND p.deleted_at IS NULL GROUP BY c.id ORDER BY sold DESC LIMIT 10`);
  const topProducts = all(`SELECT p.title, p.sold, p.views, p.price FROM products p WHERE p.deleted_at IS NULL ORDER BY p.sold DESC LIMIT 10`);
  const topPages = all(`SELECT path, COUNT(*) AS c FROM page_views GROUP BY path ORDER BY c DESC LIMIT 15`);
  const sellers = all(`SELECT s.shop_name, COALESCE(SUM(oi.total),0) AS revenue, COUNT(DISTINCT oi.order_id) AS orders
                       FROM sellers s LEFT JOIN order_items oi ON oi.seller_id=s.id LEFT JOIN orders o ON o.id=oi.order_id AND o.payment_status='paid'
                       WHERE s.deleted_at IS NULL GROUP BY s.id ORDER BY revenue DESC LIMIT 10`);
  const usersGrowth = all(`SELECT date(created_at) AS d, COUNT(*) AS c FROM users WHERE created_at >= datetime('now','-${days} days') GROUP BY date(created_at) ORDER BY d ASC`);
  const funnel = {
    visits: get(`SELECT COUNT(*) AS c FROM page_views WHERE created_at >= datetime('now','-${days} days')`).c,
    carts: get(`SELECT COUNT(*) AS c FROM carts WHERE created_at >= datetime('now','-${days} days')`).c,
    orders: get(`SELECT COUNT(*) AS c FROM orders WHERE created_at >= datetime('now','-${days} days')`).c,
    paid: get(`SELECT COUNT(*) AS c FROM orders WHERE created_at >= datetime('now','-${days} days') AND payment_status='paid'`).c,
  };
  res.render('admin/reports', { sales, visits, byGateway, byCategory, topProducts, topPages, sellers, usersGrowth, funnel, days, totals: orders.stats() });
});

/* ================= پشتیبان‌گیری و بروزرسانی ================= */

router.get('/backup', auth.requirePermission('backup.manage'), (req, res) => {
  const dir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sqlite') || f.endsWith('.json')).map((f) => {
    const st = fs.statSync(path.join(dir, f));
    return { name: f, size: st.size, created_at: st.mtime };
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.locals.pageTitle = 'پشتیبان‌گیری و بروزرسانی';
  res.render('admin/backup', { files, version: setting('app_version', '1.0.0') });
});

router.post('/backup/create', auth.requirePermission('backup.manage'), (req, res) => {
  const dir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const name = `balewoo-backup-${formatJalali(new Date()).replace(/\//g, '-')}-${Date.now().toString().slice(-6)}.sqlite`;
  db.backup(path.join(dir, name)).then(() => {
    activity.logReq(req, 'backup_create', { description: name });
    auth.flash(req, 'success', `پشتیبان ${name} ساخته شد.`);
    res.redirect('/admin/system/backup');
  }).catch((e) => { auth.flash(req, 'danger', 'خطا در ساخت پشتیبان: ' + e.message); res.redirect('/admin/system/backup'); });
});

router.get('/backup/download/:name', auth.requirePermission('backup.manage'), (req, res) => {
  const name = path.basename(req.params.name);
  const file = path.join(DATA_DIR, 'backups', name);
  if (!fs.existsSync(file)) return res.status(404).send('not found');
  res.download(file, name);
});

router.post('/backup/delete/:name', auth.requirePermission('backup.manage'), (req, res) => {
  const file = path.join(DATA_DIR, 'backups', path.basename(req.params.name));
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.redirect('/admin/system/backup');
});

router.post('/update/check', auth.requirePermission('backup.manage'), async (req, res) => {
  // بررسی نسخه (در استقرار واقعی به سرور بروزرسانی متصل می‌شود)
  const current = setting('app_version', '1.0.0');
  auth.flash(req, 'success', `نصب شده: ${current} — شما آخرین نسخه را دارید.`);
  res.redirect('/admin/system/backup');
});

/* ================= نگهداری (کش / بهینه‌سازی) ================= */

router.post('/maintenance/clear-cache', auth.requirePermission('settings.manage'), (req, res) => {
  cache.flush();
  auth.flash(req, 'success', 'کش صفحات پاک شد.');
  res.redirect('back');
});

router.post('/maintenance/optimize', auth.requirePermission('settings.manage'), (req, res) => {
  const before = { pv: get('SELECT COUNT(*) AS c FROM page_views').c, activities: get('SELECT COUNT(*) AS c FROM activity_logs').c };
  if (req.body.purge_views) run(`DELETE FROM page_views WHERE created_at < datetime('now','-90 days')`);
  if (req.body.purge_activities) run(`DELETE FROM activity_logs WHERE created_at < datetime('now','-180 days')`);
  if (req.body.purge_sessions) run(`DELETE FROM user_sessions WHERE revoked_at IS NOT NULL AND revoked_at < datetime('now','-30 days')`);
  run('VACUUM');
  run('ANALYZE');
  auth.flash(req, 'success', 'پایگاه داده بهینه‌سازی شد.');
  res.redirect('back');
});

module.exports = router;
