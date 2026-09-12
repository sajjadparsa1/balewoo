'use strict';
const { all, get, insert, update, run, db, jparse, jstringify, setting } = require('../db');
const { now, orderCode, randomCode, numberFormat, toInt, daysFromNow } = require('../core/utils');
const { formatJalali, formatJalaliLong, toPersianDigits } = require('../core/jalali');
const catalog = require('../core/catalog');
const cart = require('./cart');
const notify = require('../core/notify');
const activity = require('../core/activity');
const shipping = require('../services/shipping');
const payment = require('../services/payment');

/**
 * چرخه کامل سفارش:
 *  ثبت -> پرداخت -> پردازش -> ارسال -> تحویل (یا لغو / مرجوعی)
 * همراه با: کسر موجودی انبار، کمیسیون فروشنده، تسویه روزشمار،
 *           پورسانت همکاری در فروش، امتیاز باشگاه مشتریان، صدور فاکتور
 */

const STATUS = {
  pending: { title: 'در انتظار پرداخت', color: 'warning', icon: 'clock' },
  paid: { title: 'پرداخت شده', color: 'info', icon: 'check' },
  processing: { title: 'در حال پردازش', color: 'info', icon: 'package' },
  shipping: { title: 'ارسال شده', color: 'primary', icon: 'truck' },
  delivered: { title: 'تحویل داده شده', color: 'success', icon: 'home' },
  canceled: { title: 'لغو شده', color: 'danger', icon: 'x' },
  returned: { title: 'مرجوع شده', color: 'secondary', icon: 'rotate' },
};

function statusTitle(s) { return STATUS[s]?.title || s; }
function statuses() { return STATUS; }

/* ---------------- ثبت سفارش ---------------- */

function create(req, opts = {}) {
  const userId = req.user?.id || null;
  const totals = cart.compute(req);
  if (!totals.availableItems.length) return { ok: false, error: 'سبد خرید شما خالی است' };

  // بررسی نهایی موجودی
  for (const it of totals.availableItems) {
    const stock = it.variant_id ? (get('SELECT stock FROM product_variants WHERE id=@id', { id: it.variant_id })?.stock ?? 0) : (get('SELECT stock FROM products WHERE id=@id', { id: it.product_id })?.stock ?? 0);
    if (stock < it.qty) return { ok: false, error: `موجودی «${it.title}» کافی نیست (${numberFormat(stock)} عدد)` };
  }

  const address = opts.addressId ? get('SELECT * FROM addresses WHERE id=@id AND user_id=@u', { id: toInt(opts.addressId), u: userId }) : opts.address;
  if (!address) return { ok: false, error: 'نشانی دریافت را انتخاب کنید' };

  const method = opts.shippingMethodId ? shipping.find(opts.shippingMethodId) : null;
  if (!method) return { ok: false, error: 'روش ارسال را انتخاب کنید' };

  const shippingCost = shipping.cost(method, { weight: totals.weight, subtotal: totals.subtotal - totals.couponDiscount });
  const vat = catalog.applyVat(setting('vat_on_shipping', '0') === '1' ? totals.subtotal - totals.couponDiscount + shippingCost : totals.subtotal - totals.couponDiscount);
  const total = Math.max(0, totals.subtotal - totals.couponDiscount - (totals.pointsDiscount || 0) + shippingCost + vat);

  const code = orderCode();
  const orderId = insert('orders', {
    code, user_id: userId, guest_phone: req.body?.guest_phone || null,
    status: 'pending', payment_status: 'unpaid', payment_method: opts.paymentMethod || null,
    coupon_code: totals.cart?.coupon_code || null,
    subtotal: totals.subtotal, items_discount: totals.itemsDiscount, coupon_discount: totals.couponDiscount,
    shipping_cost: shippingCost, vat, wallet_used: 0, points_used: totals.cart?.points_used || 0, points_discount: totals.pointsDiscount || 0,
    commission_total: totals.commissionTotal, total,
    shipping_method_id: method.id, shipping_title: method.title,
    pickup_id: opts.pickupId || null,
    address_snapshot: jstringify(address),
    receiver_name: opts.receiverName || address.receiver || req.user?.name || '—',
    receiver_phone: opts.receiverPhone || address.phone || req.user?.phone,
    postal_code: address.postal_code || null,
    lat: address.lat || null, lng: address.lng || null,
    customer_note: opts.note || null,
    affiliate_id: req.session.affiliateId || null,
    invoice_no: null,
    created_at: now(), updated_at: now(),
  });

  // آیتم‌ها
  for (const it of totals.availableItems) {
    const seller = it.seller_id ? get('SELECT commission FROM sellers WHERE id=@id', { id: it.seller_id }) : null;
    const commission = seller?.commission ? Math.round((it.line_total * seller.commission) / 100) : 0;
    const itemId = insert('order_items', {
      order_id: orderId, product_id: it.product_id, variant_id: it.variant_id, seller_id: it.seller_id,
      title: it.title, variant_title: it.variant_title || null, image: it.image,
      qty: it.qty, price: it.unit_price, old_price: it.unit_old_price,
      discount: it.line_discount, options: jstringify(it.options_list), options_total: it.options_total * it.qty,
      total: it.line_total, commission, status: 'pending', created_at: now(),
    });

    // کسر موجودی
    deductStock(it, orderId, req.user?.id);

    // تسویه فروشنده با روزشمار
    if (it.seller_id) {
      const s = get('SELECT settlement_days FROM sellers WHERE id=@id', { id: it.seller_id });
      const net = it.line_total - commission;
      insert('settlements', {
        seller_id: it.seller_id, order_item_id: itemId, amount: it.line_total, commission, net,
        due_at: new Date(daysFromNow(s?.settlement_days || 7)).toISOString().replace('T', ' ').slice(0, 19),
        status: 'pending', created_at: now(),
      });
    }
  }

  logStatus(orderId, 'pending', 'سفارش ثبت شد', userId);

  // مصرف کد تخفیف
  if (totals.cart?.coupon_code) {
    run('UPDATE coupons SET used_count = used_count + 1 WHERE code=@c', { c: totals.cart.coupon_code });
  }
  // مصرف امتیاز
  if (totals.cart?.points_used && userId) {
    run('UPDATE users SET points = points - @p WHERE id=@u', { p: totals.cart.points_used, u: userId });
    insert('club_activities', { user_id: userId, points: -totals.cart.points_used, reason: 'redeem', reference: code, created_at: now() });
  }

  activity.log(req.user, 'order_create', { ip: req.ip, subjectType: 'order', subjectId: orderId, description: `سفارش ${code} ثبت شد` });
  if (userId) notify.push(userId, notify.T.orderPlaced(code));
  notify.pushToStaff({ ...notify.T.newOrder(code), type: 'order', icon: 'cart', title: 'سفارش جدید', body: `سفارش ${code} به مبلغ ${numberFormat(total)} تومان ثبت شد.`, link: `/admin/orders/${code}` }, 'orders.view');

  cart.clear(req);
  req.session.affiliateId = null;
  return { ok: true, orderId, code, total, order: find(orderId) };
}

function deductStock(item, orderId, userId) {
  const qty = item.qty;
  if (item.variant_id) {
    run('UPDATE product_variants SET stock = MAX(0, stock - @q) WHERE id=@id', { q: qty, id: item.variant_id });
  }
  run('UPDATE products SET stock = MAX(0, stock - @q) WHERE id=@id', { q: qty, id: item.product_id });

  // انبار پیش‌فرض فروشنده یا فروشگاه اصلی
  const seller = get('SELECT seller_id FROM products WHERE id=@id', { id: item.product_id })?.seller_id;
  const wh = get(`SELECT * FROM warehouses WHERE owner_type=@t AND owner_id=@o AND is_default=1 LIMIT 1`, { t: seller ? 'seller' : 'main', o: seller || 0 });
  if (wh) {
    const wi = get('SELECT * FROM warehouse_items WHERE warehouse_id=@w AND variant_id IS @v AND product_id IS @p', { w: wh.id, v: item.variant_id || null, p: item.product_id });
    if (wi) {
      run('UPDATE warehouse_items SET qty = MAX(0, qty - @q), updated_at=@t WHERE id=@id', { q: qty, t: now(), id: wi.id });
      insert('stock_movements', { warehouse_id: wh.id, product_id: item.product_id, variant_id: item.variant_id, change: -qty, reason: 'sale', reference: 'order:' + orderId, user_id: userId, created_at: now() });
    }
  }
  run('UPDATE products SET sold = sold + @q WHERE id=@id', { q: qty, id: item.product_id });
}

function restoreStock(item, orderId, userId, reason = 'cancel') {
  if (item.variant_id) run('UPDATE product_variants SET stock = stock + @q WHERE id=@id', { q: item.qty, id: item.variant_id });
  run('UPDATE products SET stock = stock + @q WHERE id=@id', { q: item.qty, id: item.product_id });
  run('UPDATE products SET sold = MAX(0, sold - @q) WHERE id=@id', { q: item.qty, id: item.product_id });
  insert('stock_movements', { warehouse_id: null, product_id: item.product_id, variant_id: item.variant_id, change: item.qty, reason, reference: 'order:' + orderId, user_id: userId, created_at: now() });
}

/* ---------------- پرداخت ---------------- */

function markPaid(orderId, { gateway = null, reference = null, userId = null, method = null } = {}) {
  const order = find(orderId);
  if (!order) return { ok: false, error: 'سفارش یافت نشد' };
  if (order.payment_status === 'paid') return { ok: true, already: true, order };

  db.transaction(() => {
    run(`UPDATE orders SET payment_status='paid', paid_at=@t, status = CASE WHEN status='pending' THEN 'paid' ELSE status END,
         gateway=@g, gateway_ref=@r, payment_method=@m, invoice_no=@inv, updated_at=@t WHERE id=@id`,
      { t: now(), g: gateway, r: reference, m: method || gateway, inv: 'INV-' + order.code.replace('-', ''), id: orderId });
    run(`UPDATE order_items SET status='processing' WHERE order_id=@id`, { id: orderId });
    logStatus(orderId, 'paid', `پرداخت از طریق ${gateway || 'کیف پول'} تایید شد`, userId);

    // کیف پول: کسر مبلغ
    if (order.wallet_used > 0 && order.user_id) {
      run('UPDATE users SET wallet = MAX(0, wallet - @a) WHERE id=@u', { a: order.wallet_used, u: order.user_id });
    }

    // امتیاز باشگاه مشتریان
    if (order.user_id) {
      const rate = parseFloat(setting('club_point_per_toman', '1000')) || 1000;
      const points = Math.floor(order.total / rate);
      if (points > 0) awardPoints(order.user_id, points, 'purchase', order.code);
    }

    // پورسانت همکاری در فروش
    if (order.affiliate_id) awardAffiliate(order);

    // درآمد فروشنده
    run(`UPDATE sellers SET wallet = wallet + (SELECT COALESCE(SUM(net),0) FROM settlements WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id=@id) AND seller_id=sellers.id)
         WHERE sellers.id IN (SELECT seller_id FROM order_items WHERE order_id=@id AND seller_id IS NOT NULL)`, { id: orderId });
  })();

  const fresh = find(orderId);
  if (fresh.user_id) notify.push(fresh.user_id, notify.T.orderPaid(fresh.code));
  notify.pushToStaff({ type: 'order', icon: 'check', title: 'پرداخت موفق', body: `سفارش ${fresh.code} پرداخت شد (${numberFormat(fresh.total)} تومان).`, link: `/admin/orders/${fresh.code}` }, 'orders.view');

  // فروشندگان
  for (const sid of [...new Set(all('SELECT DISTINCT seller_id FROM order_items WHERE order_id=@id AND seller_id IS NOT NULL', { id: orderId }).map((r) => r.seller_id))]) {
    const s = get('SELECT user_id, shop_name FROM sellers WHERE id=@id', { id: sid });
    if (s?.user_id) notify.push(s.user_id, { type: 'order', icon: 'cart', title: 'سفارش جدید برای فروشگاه شما', body: `سفارش ${fresh.code} شامل محصولات فروشگاه «${s.shop_name}» است.`, link: '/seller/orders' });
  }

  activity.log({ id: userId || fresh.user_id, role: 'user' }, 'order_pay', { subjectType: 'order', subjectId: orderId, description: `پرداخت سفارش ${fresh.code}` });
  return { ok: true, order: fresh };
}

function awardPoints(userId, points, reason = 'purchase', reference = null) {
  run('UPDATE users SET points = points + @p WHERE id=@u', { p: points, u: userId });
  insert('club_activities', { user_id: userId, points, reason, reference, created_at: now() });
  const level = clubLevelFor(userId);
  const user = get('SELECT club_level FROM users WHERE id=@id', { id: userId });
  if (level !== user.club_level) {
    run('UPDATE users SET club_level=@l WHERE id=@id', { l: level, id: userId });
    const lv = get('SELECT title FROM club_levels WHERE level=@l', { l: level });
    notify.push(userId, notify.T.levelUp(lv?.title || level));
  }
  notify.push(userId, notify.T.pointsAwarded(numberFormat(points)));
}

function clubLevelFor(userId) {
  const u = get('SELECT points FROM users WHERE id=@id', { id: userId });
  const levels = all('SELECT * FROM club_levels ORDER BY min_points DESC');
  for (const l of levels) if (u.points >= l.min_points) return l.level;
  return 'bronze';
}

function awardAffiliate(order) {
  const aff = get('SELECT * FROM users WHERE id=@id', { id: order.affiliate_id });
  if (!aff || !aff.is_affiliate) return;
  const level = aff.club_level || 'bronze';
  for (const it of all('SELECT * FROM order_items WHERE order_id=@id', { id: order.id })) {
    const p = get('SELECT affiliate, aff_gold, aff_silver, aff_bronze FROM products WHERE id=@id', { id: it.product_id });
    if (!p?.affiliate) continue;
    const percent = level === 'gold' ? p.aff_gold : level === 'silver' ? p.aff_silver : p.aff_bronze;
    const amount = Math.round((it.total * percent) / 100);
    if (amount <= 0) continue;
    insert('affiliate_commissions', {
      user_id: aff.id, order_id: order.id, order_item_id: it.id, product_id: it.product_id,
      buyer_id: order.user_id, level, percent, amount, status: 'approved', created_at: now(),
    });
    run('UPDATE users SET wallet = wallet + @a WHERE id=@u', { a: amount, u: aff.id });
    const bal = get('SELECT wallet FROM users WHERE id=@id', { id: aff.id });
    insert('transactions', { user_id: aff.id, owner_type: 'user', owner_id: aff.id, type: 'affiliate', amount, balance: bal.wallet, gateway: 'system', reference: 'AFF-' + randomCode('', 6), order_id: order.id, status: 'success', description: `پورسانت همکاری در فروش — سفارش ${order.code}`, created_at: now() });
    notify.push(aff.id, { ...notify.T.affiliateSale(numberFormat(amount)), link: '/user/affiliate' });
    activity.log(aff, 'affiliate_sale', { subjectType: 'order', subjectId: order.id, description: `${numberFormat(amount)} تومان پورسانت` });
  }
}

/* ---------------- تغییر وضعیت ---------------- */

function setStatus(orderId, status, { note = '', userId = null, notifyUser = true } = {}) {
  const order = find(orderId);
  if (!order) return { ok: false, error: 'سفارش یافت نشد' };
  const allowed = ['pending', 'paid', 'processing', 'shipping', 'delivered', 'canceled', 'returned'];
  if (!allowed.includes(status)) return { ok: false, error: 'وضعیت نامعتبر' };

  db.transaction(() => {
    const extra = status === 'delivered' ? ', delivered_at=@t' : status === 'canceled' ? ', canceled_at=@t' : '';
    run(`UPDATE orders SET status=@s, updated_at=@t ${extra} WHERE id=@id`, { s: status, t: now(), id: orderId });
    if (status === 'shipping' || status === 'delivered' || status === 'canceled') {
      run('UPDATE order_items SET status=@s WHERE order_id=@id AND status NOT IN (\'returned\')', { s: status, id: orderId });
    }
    logStatus(orderId, status, note, userId);
  })();

  if (status === 'canceled') cancelRefund(order, userId);
  if (status === 'delivered') onDelivered(order);

  if (notifyUser && order.user_id) {
    notify.push(order.user_id, { ...notify.T.orderStatus(order.code, statusTitle(status)), link: `/user/orders/${order.code}` });
  }
  activity.log({ id: userId, role: userId ? 'staff' : 'system' }, 'order_status', { subjectType: 'order', subjectId: orderId, description: `${order.code} → ${statusTitle(status)}${note ? ' — ' + note : ''}` });
  return { ok: true, order: find(orderId) };
}

function cancelRefund(order, userId) {
  // بازگرداندن موجودی
  for (const it of all('SELECT * FROM order_items WHERE order_id=@id', { id: order.id })) restoreStock(it, order.id, userId, 'cancel');
  // بازگرداندن مبلغ به کیف پول
  if (order.user_id && order.payment_status === 'paid') {
    run('UPDATE users SET wallet = wallet + @a WHERE id=@u', { a: order.total, u: order.user_id });
    const bal = get('SELECT wallet FROM users WHERE id=@id', { id: order.user_id });
    insert('transactions', { user_id: order.user_id, owner_type: 'user', owner_id: order.user_id, type: 'refund', amount: order.total, balance: bal.wallet, gateway: 'system', reference: 'RFD-' + randomCode('', 6), order_id: order.id, status: 'success', description: `بازگشت وجه سفارش لغوشده ${order.code}`, created_at: now() });
    run(`UPDATE orders SET payment_status='refunded' WHERE id=@id`, { id: order.id });
    notify.push(order.user_id, notify.T.orderCanceled(order.code));
  }
  // حذف تسویه‌های فروشنده
  run(`DELETE FROM settlements WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id=@id)`, { id: order.id });
  // برگرداندن کوپن
  if (order.coupon_code) run('UPDATE coupons SET used_count = MAX(0, used_count - 1) WHERE code=@c', { c: order.coupon_code });
  // آمار فروشنده
  run(`UPDATE sellers SET cancel_rate = MIN(100, cancel_rate + 1) WHERE id IN (SELECT DISTINCT seller_id FROM order_items WHERE order_id=@id AND seller_id IS NOT NULL)`, { id: order.id });
}

function onDelivered(order) {
  run(`UPDATE sellers SET success_rate = MIN(100, success_rate + 0.5) WHERE id IN (SELECT DISTINCT seller_id FROM order_items WHERE order_id=@id AND seller_id IS NOT NULL)`, { id: order.id });
  // پرداخت تسویه‌های سررسید شده
  const due = all(`SELECT * FROM settlements WHERE status='pending' AND due_at <= datetime('now') AND order_item_id IN (SELECT id FROM order_items WHERE order_id=@id)`, { id: order.id });
  for (const s of due) run(`UPDATE settlements SET status='paid', paid_at=@t WHERE id=@id`, { t: now(), id: s.id });
}

function setTracking(orderId, trackingCode, { userId = null, carrier = '' } = {}) {
  const n = run('UPDATE orders SET tracking_code=@c, updated_at=@t WHERE id=@id', { c: trackingCode, t: now(), id: orderId }).changes;
  const order = find(orderId);
  if (order?.user_id) notify.push(order.user_id, notify.T.shipped(order.code, trackingCode));
  logStatus(orderId, 'shipping', `کد رهگیری پستی ثبت شد: ${trackingCode}${carrier ? ' (' + carrier + ')' : ''}`, userId);
  return n;
}

function logStatus(orderId, status, note = '', userId = null) {
  insert('order_status_history', { order_id: orderId, status, note, user_id: userId, created_at: now() });
}

/* ---------------- کوئری ---------------- */

function find(idOrCode) {
  const key = String(idOrCode);
  return get('SELECT * FROM orders WHERE (id=@k OR code=@k) LIMIT 1', { k: /^\d+$/.test(key) ? toInt(key) : key });
}

function detail(orderId) {
  const order = find(orderId);
  if (!order) return null;
  order.items = all('SELECT oi.*, p.slug AS product_slug FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=@id ORDER BY oi.id ASC', { id: order.id })
    .map((i) => ({ ...i, options: jparse(i.options, []) }));
  order.history = all('SELECT h.*, u.name AS actor FROM order_status_history h LEFT JOIN users u ON u.id=h.user_id WHERE h.order_id=@id ORDER BY h.id ASC', { id: order.id });
  order.address = jparse(order.address_snapshot, {});
  order.user = order.user_id ? get('SELECT id,name,phone,email FROM users WHERE id=@id', { id: order.user_id }) : null;
  order.transactions = all('SELECT * FROM transactions WHERE order_id=@id ORDER BY id DESC', { id: order.id });
  order.sellers = all(`SELECT DISTINCT s.* FROM order_items oi JOIN sellers s ON s.id=oi.seller_id WHERE oi.order_id=@id`, { id: order.id });
  order.status_title = statusTitle(order.status);
  order.status_meta = STATUS[order.status] || {};
  order.jalali_date = formatJalaliFullLocal(order.created_at);
  return order;
}
function formatJalaliFullLocal(iso) {
  try { return `${formatJalaliLong(new Date(String(iso).replace(' ', 'T') + 'Z'))} — ${String(iso).slice(11, 16)}`; } catch { return iso; }
}

function listOrders(params = {}) {
  const perPage = Math.min(100, Math.max(5, toInt(params.perPage, 15)));
  const page = Math.max(1, toInt(params.page, 1));
  const where = ['1=1'];
  const values = { l: perPage, o: (page - 1) * perPage };
  let i = 0;
  const p = (v) => { const k = 'v' + i++; values[k] = v; return '@' + k; };

  if (params.userId) where.push('o.user_id=' + p(params.userId));
  if (params.status) where.push('o.status=' + p(params.status));
  if (params.paymentStatus) where.push('o.payment_status=' + p(params.paymentStatus));
  if (params.sellerId) where.push(`o.id IN (SELECT order_id FROM order_items WHERE seller_id=${p(params.sellerId)})`);
  if (params.search) { const k = p('%' + params.search + '%'); where.push(`(o.code LIKE ${k} OR o.receiver_name LIKE ${k} OR o.receiver_phone LIKE ${k} OR o.tracking_code LIKE ${k})`); }
  if (params.from) where.push('date(o.created_at) >= date(' + p(params.from) + ')');
  if (params.to) where.push('date(o.created_at) <= date(' + p(params.to) + ')');

  const W = where.join(' AND ');
  const total = get(`SELECT COUNT(*) AS c FROM orders o WHERE ${W}`, values).c;
  const rows = all(`SELECT o.*, u.name AS user_name, u.phone AS user_phone,
                    (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id) AS items_count
                    FROM orders o LEFT JOIN users u ON u.id=o.user_id
                    WHERE ${W} ORDER BY o.id DESC LIMIT @l OFFSET @o`, values);
  return { rows: rows.map((r) => ({ ...r, status_title: statusTitle(r.status) })), total, page, perPage };
}

/** آیتم‌های یک فروشنده در همه سفارشات */
function sellerOrderItems(sellerId, params = {}) {
  const perPage = toInt(params.perPage, 15);
  const page = Math.max(1, toInt(params.page, 1));
  const where = ['oi.seller_id=@s'];
  const values = { s: sellerId, l: perPage, o: (page - 1) * perPage };
  if (params.status) { where.push('oi.status=@st'); values.st = params.status; }
  const W = where.join(' AND ');
  const total = get(`SELECT COUNT(*) AS c FROM order_items oi WHERE ${W}`, values).c;
  const rows = all(`SELECT oi.*, o.code AS order_code, o.status AS order_status, o.payment_status, o.created_at AS order_date,
                    u.name AS customer_name, u.phone AS customer_phone, o.receiver_name, o.receiver_phone, o.address_snapshot, o.shipping_title, o.tracking_code
                    FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN users u ON u.id=o.user_id
                    WHERE ${W} ORDER BY oi.id DESC LIMIT @l OFFSET @o`, values);
  return { rows: rows.map((r) => ({ ...r, address: jparse(r.address_snapshot, {}) })), total, page, perPage };
}

/* ---------------- آمار ---------------- */

function stats() {
  return {
    total: get('SELECT COUNT(*) AS c FROM orders').c,
    pending: get(`SELECT COUNT(*) AS c FROM orders WHERE status='pending'`).c,
    paid: get(`SELECT COUNT(*) AS c FROM orders WHERE payment_status='paid'`).c,
    delivered: get(`SELECT COUNT(*) AS c FROM orders WHERE status='delivered'`).c,
    canceled: get(`SELECT COUNT(*) AS c FROM orders WHERE status='canceled'`).c,
    revenue: get(`SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE payment_status='paid' AND status<>'canceled'`).s,
    today: get(`SELECT COALESCE(SUM(total),0) AS s, COUNT(*) AS c FROM orders WHERE date(created_at)=date('now')`).s,
    todayCount: get(`SELECT COUNT(*) AS c FROM orders WHERE date(created_at)=date('now')`).c,
    last7: all(`SELECT date(created_at) AS d, COUNT(*) AS c, COALESCE(SUM(total),0) AS s FROM orders WHERE created_at >= datetime('now','-7 days') GROUP BY date(created_at) ORDER BY d ASC`),
    byStatus: all(`SELECT status, COUNT(*) AS c FROM orders GROUP BY status`),
    byPayment: all(`SELECT COALESCE(payment_method,'—') AS m, COUNT(*) AS c, COALESCE(SUM(total),0) AS s FROM orders WHERE payment_status='paid' GROUP BY payment_method ORDER BY c DESC`),
    topProducts: all(`SELECT oi.title, SUM(oi.qty) AS qty, SUM(oi.total) AS revenue FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.payment_status='paid' GROUP BY oi.product_id ORDER BY qty DESC LIMIT 8`),
  };
}

/* ---------------- پیش‌فاکتور ---------------- */

function createPreinvoice({ userId, createdBy, items = [], discount = 0, vat = 0, note = '', expiresInDays = 7 }) {
  const code = 'PI-' + randomCode('', 6);
  const subtotal = items.reduce((a, it) => a + (it.qty || 1) * (it.price || 0), 0);
  const total = Math.max(0, subtotal - discount + vat);
  const id = insert('preinvoices', {
    code, user_id: userId, created_by: createdBy, items: jstringify(items), subtotal, discount, vat, total,
    note, status: 'pending', expires_at: new Date(daysFromNow(expiresInDays)).toISOString().replace('T', ' ').slice(0, 19), created_at: now(),
  });
  if (userId) notify.push(userId, { type: 'invoice', icon: 'file', title: 'پیش‌فاکتور صادر شد', body: `پیش‌فاکتور ${code} به مبلغ ${numberFormat(total)} تومان صادر شد.`, link: `/user/preinvoices/${code}` });
  return { id, code, total };
}

function payPreinvoice(code, { gateway = 'wallet', userId } = {}) {
  const pi = get('SELECT * FROM preinvoices WHERE code=@c', { c: code });
  if (!pi) return { ok: false, error: 'پیش‌فاکتور یافت نشد' };
  if (pi.status !== 'pending') return { ok: false, error: 'این پیش‌فاکتور قبلاً پرداخت یا لغو شده است' };
  if (gateway === 'wallet') {
    const res = payment.payWithWallet(pi.user_id, pi.total, null);
    if (!res.ok) return res;
  }
  run(`UPDATE preinvoices SET status='paid', paid_at=@t WHERE id=@id`, { t: now(), id: pi.id });
  insert('transactions', { user_id: pi.user_id, owner_type: 'user', owner_id: pi.user_id, type: 'preinvoice', amount: pi.total, gateway, reference: pi.code, status: 'success', description: `پرداخت پیش‌فاکتور ${pi.code}`, created_at: now() });
  return { ok: true, pi: get('SELECT * FROM preinvoices WHERE id=@id', { id: pi.id }) };
}

/* ---------------- فاکتور و برچسب ---------------- */

function invoiceData(orderId) {
  const o = detail(orderId);
  if (!o) return null;
  return {
    ...o,
    shop: {
      name: setting('site_name', 'بالی‌وو'),
      economic_code: setting('shop_economic_code', ''),
      national_id: setting('shop_national_id', ''),
      address: setting('site_address', ''),
      phone: setting('site_phone', ''),
      postal: setting('site_postal_code', ''),
      logo: setting('site_logo', '/img/logo.svg'),
    },
    amountInWords: tomanInWords(o.total),
  };
}

const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه', 'ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES = ['', ' هزار', ' میلیون', ' میلیارد'];

function threeDigits(n) {
  const parts = [];
  const h = Math.floor(n / 100), rem = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (rem < 20 && rem > 0) parts.push(ONES[rem]);
  else if (rem >= 20) { parts.push(TENS[Math.floor(rem / 10)]); if (rem % 10) parts.push(ONES[rem % 10]); }
  return parts.join(' و ');
}

/** تبدیل عدد به حروف فارسی (تومان) */
function tomanInWords(amount) {
  let n = Math.round(Number(amount) || 0);
  if (n === 0) return 'صفر تومان';
  const groups = [];
  while (n > 0) { groups.unshift(n % 1000); n = Math.floor(n / 1000); }
  const words = [];
  groups.forEach((g, idx) => {
    if (!g) return;
    const scale = SCALES[groups.length - idx - 1] || '';
    words.push(threeDigits(g) + scale);
  });
  return words.join(' و ') + ' تومان';
}

module.exports = {
  STATUS, statuses, statusTitle, create, markPaid, setStatus, setTracking, logStatus,
  find, detail, listOrders, sellerOrderItems, stats, awardPoints, clubLevelFor,
  createPreinvoice, payPreinvoice, invoiceData, tomanInWords, restoreStock, deductStock, formatJalaliFullLocal,
};
