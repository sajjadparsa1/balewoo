'use strict';
const express = require('express');
const router = express.Router();
const { all, get, insert, update, run, jparse, jstringify, setting } = require('../../db');
const auth = require('../../core/auth');
const seo = require('../../core/seo');
const notify = require('../../core/notify');
const activity = require('../../core/activity');
const catalog = require('../../core/catalog');
const orders = require('../orders');
const media = require('../../core/media');
const shipping = require('../../services/shipping');
const { now, toInt, toFloat, numberFormat, slugify, randomCode, paginate, truncate } = require('../../core/utils');
const { formatJalali, formatJalaliLong, toPersianDigits, timeAgo } = require('../../core/jalali');

router.use(auth.requireLogin, auth.requireSeller);

const MENU = [
  { href: '/seller/dashboard', title: 'داشبورد', icon: 'grid', match: '^/dashboard$' },
  { href: '/seller/products', title: 'محصولات من', icon: 'box', match: '^/products' },
  { href: '/seller/pricing', title: 'قیمت‌گذاری روی محصولات', icon: 'tag', match: '^/pricing' },
  { href: '/seller/orders', title: 'سفارش‌ها', icon: 'cart', match: '^/orders' },
  { href: '/seller/warehouses', title: 'انبارها', icon: 'archive', match: '^/warehouses' },
  { href: '/seller/settlements', title: 'تسویه حساب', icon: 'bank', match: '^/settlements|^/bank' },
  { href: '/seller/blog', title: 'مقالات', icon: 'edit', match: '^/blog' },
  { href: '/seller/questions', title: 'پرسش‌ها و دیدگاه‌ها', icon: 'help', match: '^/questions|^/reviews' },
  { href: '/seller/tickets', title: 'تیکت‌ها', icon: 'life-buoy', match: '^/tickets' },
  { href: '/seller/store', title: 'ویرایش فروشگاه', icon: 'store', match: '^/store' },
];

router.use((req, res, next) => {
  res.locals.panel = 'seller';
  res.locals.sellerMenu = MENU.map((m) => ({ ...m, active: new RegExp(m.match).test(req.path) }));
  res.locals.notifications = notify.forUser(req.user.id, { limit: 12 });
  res.locals.meta = res.locals.meta || seo.meta({ title: 'پنل فروشنده', noindex: true });
  next();
});

/* ---------------- داشبورد ---------------- */

router.get('/dashboard', (req, res) => {
  const s = req.seller;
  const stats = {
    products: get('SELECT COUNT(*) AS c FROM products WHERE seller_id=@s AND deleted_at IS NULL', { s: s.id }).c,
    active: get(`SELECT COUNT(*) AS c FROM products WHERE seller_id=@s AND status='active' AND deleted_at IS NULL`, { s: s.id }).c,
    pending: get(`SELECT COUNT(*) AS c FROM products WHERE seller_id=@s AND status='pending' AND deleted_at IS NULL`, { s: s.id }).c,
    orders: get(`SELECT COUNT(DISTINCT oi.order_id) AS c FROM order_items oi WHERE oi.seller_id=@s`, { s: s.id }).c,
    openOrders: get(`SELECT COUNT(DISTINCT oi.order_id) AS c FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.seller_id=@s AND o.status IN ('paid','processing','shipping')`, { s: s.id }).c,
    revenue: get(`SELECT COALESCE(SUM(oi.total),0) AS s FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.seller_id=@s AND o.payment_status='paid' AND o.status<>'canceled'`, { s: s.id }).s,
    commission: get(`SELECT COALESCE(SUM(oi.commission),0) AS s FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.seller_id=@s AND o.payment_status='paid'`, { s: s.id }).s,
    wallet: s.wallet || 0,
    views: s.views || 0,
    score: s.score,
    questions: get(`SELECT COUNT(*) AS c FROM questions q JOIN products p ON p.id=q.product_id WHERE p.seller_id=@s AND q.status='pending'`, { s: s.id }).c,
    tickets: get(`SELECT COUNT(*) AS c FROM tickets WHERE owner_type='seller' AND owner_id=@s AND status<>'closed'`, { s: s.id }).c,
  };
  const salesChart = all(`SELECT date(o.created_at) AS d, SUM(oi.total) AS revenue, SUM(oi.qty) AS qty
                          FROM order_items oi JOIN orders o ON o.id=oi.order_id
                          WHERE oi.seller_id=@s AND o.payment_status='paid' AND o.created_at >= datetime('now','-30 days')
                          GROUP BY date(o.created_at) ORDER BY d ASC`, { s: s.id });
  const topProducts = all(`SELECT oi.product_id, oi.title, SUM(oi.qty) AS qty, SUM(oi.total) AS revenue
                           FROM order_items oi JOIN orders o ON o.id=oi.order_id
                           WHERE oi.seller_id=@s AND o.payment_status='paid' GROUP BY oi.product_id ORDER BY qty DESC LIMIT 6`, { s: s.id });
  const lowStock = all(`SELECT p.id,p.title,p.stock,p.price FROM products p WHERE p.seller_id=@s AND p.deleted_at IS NULL AND p.stock <= @t ORDER BY p.stock ASC LIMIT 6`, { s: s.id, t: toInt(setting('low_stock_threshold', '5'), 5) });
  const recentOrders = all(`SELECT DISTINCT o.code, o.created_at, o.total, o.status, o.receiver_name FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.seller_id=@s ORDER BY o.id DESC LIMIT 6`, { s: s.id });
  res.locals.meta = seo.meta({ title: 'داشبورد فروشنده', noindex: true });
  res.render('seller/dashboard', { stats, salesChart, topProducts, lowStock, recentOrders });
});

/* ---------------- محصولات ---------------- */

router.get('/products', (req, res) => {
  const page = toInt(req.query.page, 1), perPage = 12;
  const where = ['p.seller_id=@s'];
  const values = { s: req.seller.id, l: perPage, o: (page - 1) * perPage };
  if (req.query.status) { where.push('p.status=@st'); values.st = req.query.status; } else where.push('p.deleted_at IS NULL');
  if (req.query.search) { where.push('p.title LIKE @q'); values.q = `%${req.query.search}%`; }
  const W = where.join(' AND ');
  const total = get(`SELECT COUNT(*) AS c FROM products p WHERE ${W}`, values).c;
  const rows = all(`${catalog.baseSelect()} WHERE ${W} ORDER BY p.id DESC LIMIT @l OFFSET @o`, values).map(catalog.rowHydrate);
  res.locals.meta = seo.meta({ title: 'محصولات من', noindex: true });
  res.render('seller/products', { rows, pg: paginate(total, page, perPage) });
});

router.get('/products/create', (req, res) => {
  res.locals.meta = seo.meta({ title: 'افزودن محصول', noindex: true });
  res.render('seller/product-form', {
    p: null, categories: catalog.categoryTree(null), brands: catalog.brandList(),
    attributeGroups: all('SELECT * FROM attribute_groups ORDER BY sort ASC').map((g) => ({ ...g, options: jparse(g.options, []) })),
    warehouses: sellerWarehouses(req.seller.id),
    variants: [], extraOptions: [], tiers: [], images: [],
  });
});

router.get('/products/:id/edit', (req, res) => {
  const p = get('SELECT * FROM products WHERE id=@id AND seller_id=@s', { id: toInt(req.params.id), s: req.seller.id });
  if (!p) return res.redirect('/seller/products');
  p.specs = jparse(p.specs, []); p.highlights = jparse(p.highlights, []); p.attributes = jparse(p.attributes, {});
  res.locals.meta = seo.meta({ title: 'ویرایش محصول', noindex: true });
  res.render('seller/product-form', {
    p, categories: catalog.categoryTree(null), brands: catalog.brandList(),
    attributeGroups: all('SELECT * FROM attribute_groups ORDER BY sort ASC').map((g) => ({ ...g, options: jparse(g.options, []) })),
    warehouses: sellerWarehouses(req.seller.id),
    variants: catalog.variantsOf(p.id).map((v) => ({ ...v, options: jparse(v.options, {}) })),
    extraOptions: catalog.optionsOf(p.id), tiers: catalog.tierDiscountsOf(p.id), images: catalog.imagesOf(p.id),
  });
});

router.post('/products', media.upload.array('images', 12), (req, res) => {
  const b = req.body;
  const isEdit = !!b.id;
  const data = {
    seller_id: req.seller.id,
    title: String(b.title || '').trim(),
    title_en: b.title_en || null,
    slug: slugify(b.slug || b.title),
    category_id: toInt(b.category_id) || null,
    brand_id: toInt(b.brand_id) || null,
    sku: b.sku || null,
    type: b.is_inquiry ? 'inquiry' : 'normal',
    is_inquiry: b.is_inquiry ? 1 : 0,
    condition_txt: b.condition_txt || 'new',
    warranty: b.warranty || null,
    short_desc: b.short_desc || null,
    description: b.description || null,
    keywords: b.keywords || null,
    specs: parseKeyValue(b.spec_titles, b.spec_values),
    highlights: parseKeyValue(b.highlight_titles, b.highlight_values),
    attributes: parseAttributes(b.attributes),
    price: toInt(b.price),
    old_price: toInt(b.old_price),
    discount_start: b.discount_start || null,
    discount_end: b.discount_end || null,
    stock: toInt(b.stock),
    weight: toFloat(b.weight),
    affiliate: b.affiliate ? 1 : 0,
    aff_gold: toFloat(b.aff_gold), aff_silver: toFloat(b.aff_silver), aff_bronze: toFloat(b.aff_bronze),
    seo_title: b.seo_title || null, seo_desc: b.seo_desc || null,
    status: setting('seller_products_need_approval', '1') === '1' ? 'pending' : 'active',
  };
  if (!data.title) { auth.flash(req, 'danger', 'عنوان محصول الزامی است.'); return res.redirect('back'); }

  let productId;
  if (isEdit) {
    const owned = get('SELECT id FROM products WHERE id=@id AND seller_id=@s', { id: toInt(b.id), s: req.seller.id });
    if (!owned) return res.status(403).send('forbidden');
    productId = owned.id;
    catalog.updateProduct(productId, data);
    activity.logReq(req, 'product_update', { subjectType: 'product', subjectId: productId, description: data.title });
  } else {
    productId = catalog.createProduct(data, { userId: req.user.id });
    activity.logReq(req, 'product_create', { subjectType: 'product', subjectId: productId, description: data.title });
  }

  // متغیرها
  if (b.variant_titles?.length) {
    run('DELETE FROM product_variants WHERE product_id=@p', { p: productId });
    for (let i = 0; i < b.variant_titles.length; i++) {
      const title = String(b.variant_titles[i] || '').trim();
      if (!title) continue;
      insert('product_variants', {
        product_id: productId, seller_id: req.seller.id, title, options: jstringify({ 'متغیر': title }),
        price: toInt(b.variant_prices?.[i]), old_price: toInt(b.variant_old_prices?.[i]),
        stock: toInt(b.variant_stocks?.[i]), sku: b.variant_skus?.[i] || null, is_default: i === 0 ? 1 : 0, created_at: now(),
      });
    }
    catalog.syncProductAggregates(productId);
  }

  // ویژگی‌های اضافی
  if (b.option_titles?.length) {
    run('DELETE FROM product_options WHERE product_id=@p', { p: productId });
    for (let i = 0; i < b.option_titles.length; i++) {
      const t = String(b.option_titles[i] || '').trim();
      if (!t) continue;
      insert('product_options', { product_id: productId, title: t, price: toInt(b.option_prices?.[i]), is_required: b.option_required?.[i] ? 1 : 0, sort: i });
    }
  }

  // تخفیف پلکانی
  if (b.tier_qty?.length) {
    run('DELETE FROM tier_discounts WHERE product_id=@p', { p: productId });
    for (let i = 0; i < b.tier_qty.length; i++) {
      const q = toInt(b.tier_qty[i]);
      if (!q) continue;
      insert('tier_discounts', { product_id: productId, min_qty: q, price: toInt(b.tier_price?.[i]) || null, percent: toFloat(b.tier_percent?.[i]) || null });
    }
  }

  // تصاویر
  for (const f of req.files || []) {
    const m = media.register(f, { userId: req.user.id, ownerType: 'seller', folder: '/products' });
    insert('product_images', { product_id: productId, media_path: m.url, alt: data.title, kind: 'gallery', sort: 0, created_at: now() });
  }
  // تصاویر انتخاب‌شده از کتابخانه
  if (b.library_images?.length) {
    for (const pth of [].concat(b.library_images)) insert('product_images', { product_id: productId, media_path: pth, alt: data.title, kind: 'gallery', created_at: now() });
  }
  if (b.cover_image) run(`UPDATE product_images SET kind='cover' WHERE product_id=@p AND media_path=@m`, { p: productId, m: b.cover_image });

  notify.pushToStaff({ type: 'product', icon: 'box', title: 'محصول در انتظار تایید', body: `فروشنده «${req.seller.shop_name}» محصول «${truncate(data.title, 50)}» را ثبت کرد.`, link: '/admin/products?status=pending' }, 'products.approve');
  auth.flash(req, 'success', isEdit ? 'محصول بروزرسانی شد.' : 'محصول ثبت شد و در انتظار تایید مدیریت است.');
  res.redirect('/seller/products');
});

router.post('/products/:id/delete', (req, res) => {
  const p = get('SELECT id FROM products WHERE id=@id AND seller_id=@s', { id: toInt(req.params.id), s: req.seller.id });
  if (p) { catalog.softDelete('products', p.id); activity.logReq(req, 'product_delete', { subjectType: 'product', subjectId: p.id }); }
  auth.flash(req, 'success', 'محصول به سطل زباله منتقل شد.');
  res.redirect('/seller/products');
});

router.post('/products/:id/toggle', (req, res) => {
  const p = get('SELECT * FROM products WHERE id=@id AND seller_id=@s', { id: toInt(req.params.id), s: req.seller.id });
  if (p) catalog.updateProduct(p.id, { status: p.status === 'active' ? 'inactive' : 'active' });
  res.redirect('back');
});

/* ---------------- قیمت‌گذاری روی محصولات دیگران ---------------- */

router.get('/pricing', (req, res) => {
  const page = toInt(req.query.page, 1), perPage = 20;
  const search = req.query.search ? `%${req.query.search}%` : null;
  const total = get(`SELECT COUNT(*) AS c FROM products p WHERE p.deleted_at IS NULL AND p.status='active' AND p.seller_id <> @s ${search ? 'AND p.title LIKE @q' : ''}`, { s: req.seller.id, q: search }).c;
  const rows = all(`SELECT p.id,p.title,p.slug,p.price,p.stock,p.seller_id, s.shop_name,
                    (SELECT COUNT(*) FROM product_variants v WHERE v.product_id=p.id AND v.seller_id=@s) AS my_variants,
                    (SELECT MIN(v.price) FROM product_variants v WHERE v.product_id=p.id AND v.seller_id=@s) AS my_price,
                    (SELECT MIN(v.id) FROM product_variants v WHERE v.product_id=p.id AND v.seller_id=@s) AS my_variant_id
                    FROM products p LEFT JOIN sellers s ON s.id=p.seller_id
                    WHERE p.deleted_at IS NULL AND p.status='active' AND p.seller_id <> @s ${search ? 'AND p.title LIKE @q' : ''}
                    ORDER BY p.id DESC LIMIT @l OFFSET @o`, { s: req.seller.id, q: search, l: perPage, o: (page - 1) * perPage });
  res.locals.meta = seo.meta({ title: 'قیمت‌گذاری روی محصولات', noindex: true });
  res.render('seller/pricing', { rows, pg: paginate(total, page, perPage) });
});

router.post('/pricing', (req, res) => {
  const productId = toInt(req.body.product_id);
  const p = get('SELECT * FROM products WHERE id=@id AND deleted_at IS NULL', { id: productId });
  if (!p) return res.redirect('/seller/pricing');
  const title = String(req.body.variant_title || req.seller.shop_name).trim();
  const existing = get('SELECT * FROM product_variants WHERE product_id=@p AND seller_id=@s AND title=@t', { p: productId, s: req.seller.id, t: title });
  const data = { product_id: productId, seller_id: req.seller.id, title, price: toInt(req.body.price), old_price: toInt(req.body.old_price), stock: toInt(req.body.stock), sku: req.body.sku || null, status: setting('seller_products_need_approval', '1') === '1' ? 'pending' : 'active', options: jstringify({ 'فروشنده': req.seller.shop_name }) };
  if (existing) update('product_variants', existing.id, data);
  else insert('product_variants', { ...data, created_at: now() });
  catalog.syncProductAggregates(productId);
  activity.logReq(req, 'price_update', { subjectType: 'product', subjectId: productId, description: `قیمت‌گذاری «${p.title}» توسط ${req.seller.shop_name}` });
  auth.flash(req, 'success', 'قیمت‌گذاری شما ثبت شد.');
  res.redirect('/seller/pricing');
});

router.post('/pricing/:variantId/delete', (req, res) => {
  run('DELETE FROM product_variants WHERE id=@id AND seller_id=@s', { id: toInt(req.params.variantId), s: req.seller.id });
  res.redirect('/seller/pricing');
});

/* ---------------- سفارش‌ها ---------------- */

router.get('/orders', (req, res) => {
  const result = orders.sellerOrderItems(req.seller.id, { page: toInt(req.query.page, 1), perPage: 15, status: req.query.status });
  res.locals.meta = seo.meta({ title: 'سفارش‌های فروشگاه', noindex: true });
  res.render('seller/orders', { rows: result.rows, pg: paginate(result.total, result.page, result.perPage), statuses: orders.statuses() });
});

router.post('/orders/:itemId/status', (req, res) => {
  const item = get('SELECT * FROM order_items WHERE id=@id AND seller_id=@s', { id: toInt(req.params.itemId), s: req.seller.id });
  if (!item) return res.redirect('/seller/orders');
  const status = req.body.status;
  if (!['processing', 'shipping', 'delivered', 'canceled', 'returned'].includes(status)) return res.redirect('/seller/orders');
  run('UPDATE order_items SET status=@st, shipped_at=CASE WHEN @st=\'shipping\' THEN @t ELSE shipped_at END WHERE id=@id', { st: status, t: now(), id: item.id });
  if (req.body.tracking_code) run('UPDATE order_items SET tracking_code=@c WHERE id=@id', { c: req.body.tracking_code, id: item.id });
  orders.logStatus(item.order_id, status, `تغییر وضعیت آیتم توسط فروشنده ${req.seller.shop_name}${req.body.tracking_code ? ' — کد رهگیری: ' + req.body.tracking_code : ''}${req.body.note ? ' — ' + req.body.note : ''}`, req.user.id);
  const order = orders.find(item.order_id);
  if (order?.user_id) notify.push(order.user_id, { ...notify.T.orderStatus(order.code, orders.statusTitle(status)), link: `/user/orders/${order.code}` });
  if (status === 'canceled' || status === 'returned') {
    orders.restoreStock(item, item.order_id, req.user.id, status === 'returned' ? 'return' : 'cancel');
    run(`UPDATE sellers SET return_rate = MIN(100, return_rate + 1) WHERE id=@id`, { id: req.seller.id });
  }
  activity.logReq(req, 'order_status', { subjectType: 'order_item', subjectId: item.id, description: status });
  auth.flash(req, 'success', 'وضعیت آیتم سفارش بروزرسانی شد.');
  res.redirect('/seller/orders');
});

router.get('/orders/:code/label', (req, res) => {
  const row = get(`SELECT oi.order_id FROM order_items oi
                     JOIN orders o ON o.id = oi.order_id
                    WHERE oi.seller_id=@s AND o.code=@c LIMIT 1`, { s: req.seller.id, c: req.params.code });
  const order = row ? orders.detail(row.order_id) : null;
  if (!order) return res.redirect('/seller/orders');
  res.render('seller/label', { order, label: require('../../services/shipping').labelData(order), layout: false });
});

/* ---------------- انبارها ---------------- */

function sellerWarehouses(sellerId) { return all(`SELECT * FROM warehouses WHERE (owner_type='seller' AND owner_id=@s) ORDER BY is_default DESC, id ASC`, { s: sellerId }); }

router.get('/warehouses', (req, res) => {
  const warehouses = sellerWarehouses(req.seller.id).map((w) => ({
    ...w,
    items: all(`SELECT wi.*, p.title, v.title AS variant_title FROM warehouse_items wi LEFT JOIN products p ON p.id=wi.product_id LEFT JOIN product_variants v ON v.id=wi.variant_id WHERE wi.warehouse_id=@w ORDER BY wi.id DESC LIMIT 100`, { w: w.id }),
  }));
  const movements = all(`SELECT sm.*, p.title FROM stock_movements sm LEFT JOIN products p ON p.id=sm.product_id
                         WHERE sm.warehouse_id IN (SELECT id FROM warehouses WHERE owner_type='seller' AND owner_id=@s) ORDER BY sm.id DESC LIMIT 50`, { s: req.seller.id });
  res.locals.meta = seo.meta({ title: 'انبارها', noindex: true });
  res.render('seller/warehouses', { warehouses, movements, products: all(`SELECT id,title FROM products WHERE seller_id=@s AND deleted_at IS NULL ORDER BY id DESC LIMIT 200`, { s: req.seller.id }), variants: all(`SELECT v.*, p.title AS product_title FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.seller_id=@s AND p.deleted_at IS NULL`, { s: req.seller.id }) });
});

router.post('/warehouses', (req, res) => {
  const id = insert('warehouses', { owner_type: 'seller', owner_id: req.seller.id, name: req.body.name, address: req.body.address, phone: req.body.phone, is_default: req.body.is_default ? 1 : 0, created_at: now() });
  if (req.body.is_default) run(`UPDATE warehouses SET is_default=0 WHERE owner_type='seller' AND owner_id=@s AND id<>@id`, { s: req.seller.id, id });
  auth.flash(req, 'success', 'انبار ایجاد شد.');
  res.redirect('/seller/warehouses');
});

router.post('/warehouses/:id/items', (req, res) => {
  const w = get(`SELECT * FROM warehouses WHERE id=@id AND owner_type='seller' AND owner_id=@s`, { id: toInt(req.params.id), s: req.seller.id });
  if (!w) return res.redirect('/seller/warehouses');
  const productId = toInt(req.body.product_id) || null;
  const variantId = toInt(req.body.variant_id) || null;
  const qty = toInt(req.body.qty);
  const price = toInt(req.body.price);
  const existing = get('SELECT * FROM warehouse_items WHERE warehouse_id=@w AND product_id IS @p AND variant_id IS @v', { w: w.id, p: productId, v: variantId });
  if (existing) {
    run('UPDATE warehouse_items SET qty=@q, price=@pr, updated_at=@t WHERE id=@id', { q: Math.max(0, qty), pr: price, t: now(), id: existing.id });
    insert('stock_movements', { warehouse_id: w.id, product_id: productId, variant_id: variantId, change: qty - existing.qty, reason: 'adjust', user_id: req.user.id, created_at: now() });
  } else {
    insert('warehouse_items', { warehouse_id: w.id, product_id: productId, variant_id: variantId, qty, price, updated_at: now() });
    insert('stock_movements', { warehouse_id: w.id, product_id: productId, variant_id: variantId, change: qty, reason: 'purchase', user_id: req.user.id, created_at: now() });
  }
  if (variantId) { run('UPDATE product_variants SET stock=@q WHERE id=@id AND seller_id=@s', { q: Math.max(0, qty), id: variantId, s: req.seller.id }); catalog.syncProductAggregates(productId); }
  else if (productId) { run('UPDATE products SET stock=@q WHERE id=@id AND seller_id=@s', { q: Math.max(0, qty), id: productId, s: req.seller.id }); }
  activity.logReq(req, 'stock_change', { subjectType: 'warehouse', subjectId: w.id, description: `موجودی ${qty}` });
  auth.flash(req, 'success', 'موجودی انبار بروزرسانی شد.');
  res.redirect('/seller/warehouses');
});

router.post('/warehouses/:id/delete', (req, res) => {
  const w = get(`SELECT id FROM warehouses WHERE id=@id AND owner_type='seller' AND owner_id=@s`, { id: toInt(req.params.id), s: req.seller.id });
  if (w) { run('DELETE FROM warehouse_items WHERE warehouse_id=@id', { id: w.id }); run('DELETE FROM warehouses WHERE id=@id', { id: w.id }); }
  res.redirect('/seller/warehouses');
});

/* ---------------- تسویه ---------------- */

router.get('/settlements', (req, res) => {
  const rows = all(`SELECT st.*, oi.title, o.code AS order_code FROM settlements st LEFT JOIN order_items oi ON oi.id=st.order_item_id LEFT JOIN orders o ON o.id=oi.order_id WHERE st.seller_id=@s ORDER BY st.id DESC LIMIT 200`, { s: req.seller.id });
  const accounts = all(`SELECT * FROM bank_accounts WHERE owner_type='seller' AND owner_id=@s ORDER BY is_default DESC`, { s: req.seller.id });
  const withdrawals = all(`SELECT * FROM withdrawals WHERE owner_type='seller' AND owner_id=@s ORDER BY id DESC LIMIT 30`, { s: req.seller.id });
  res.locals.meta = seo.meta({ title: 'تسویه حساب', noindex: true });
  res.render('seller/settlements', {
    rows, accounts, withdrawals,
    due: get(`SELECT COALESCE(SUM(net),0) AS s FROM settlements WHERE seller_id=@s AND status='pending' AND due_at<=datetime('now')`, { s: req.seller.id }).s,
    pending: get(`SELECT COALESCE(SUM(net),0) AS s FROM settlements WHERE seller_id=@s AND status='pending'`, { s: req.seller.id }).s,
    paid: get(`SELECT COALESCE(SUM(net),0) AS s FROM settlements WHERE seller_id=@s AND status='paid'`, { s: req.seller.id }).s,
  });
});

router.post('/settlements/withdraw', (req, res) => {
  const amount = toInt(req.body.amount);
  const acc = get(`SELECT * FROM bank_accounts WHERE id=@id AND owner_type='seller' AND owner_id=@s AND status='approved'`, { id: toInt(req.body.bank_account_id), s: req.seller.id });
  if (!acc) { auth.flash(req, 'danger', 'ابتدا یک حساب بانکی تاییدشده ثبت کنید.'); return res.redirect('/seller/settlements'); }
  const min = toInt(setting('min_seller_withdraw', '500000'), 500000);
  if (amount < min) { auth.flash(req, 'danger', `حداقل مبلغ برداشت ${numberFormat(min)} تومان است.`); return res.redirect('/seller/settlements'); }
  if ((req.seller.wallet || 0) < amount) { auth.flash(req, 'danger', 'موجودی قابل برداشت کافی نیست.'); return res.redirect('/seller/settlements'); }
  run('UPDATE sellers SET wallet = wallet - @a WHERE id=@id', { a: amount, id: req.seller.id });
  insert('withdrawals', { owner_type: 'seller', owner_id: req.seller.id, bank_account_id: acc.id, amount, status: 'pending', created_at: now() });
  notify.pushToStaff({ type: 'wallet', icon: 'bank', title: 'درخواست برداشت فروشنده', body: `فروشگاه «${req.seller.shop_name}» درخواست برداشت ${numberFormat(amount)} تومان دارد.`, link: '/admin/people/withdrawals' }, 'sellers.manage');
  auth.flash(req, 'success', 'درخواست برداشت ثبت شد.');
  res.redirect('/seller/settlements');
});

router.post('/bank-accounts', (req, res) => {
  const b = req.body;
  insert('bank_accounts', { owner_type: 'seller', owner_id: req.seller.id, owner_name: b.owner_name, bank_name: b.bank_name, card_number: (b.card_number || '').replace(/\D/g, ''), iban: b.iban, account_no: b.account_no, is_default: b.is_default ? 1 : 0, created_at: now() });
  auth.flash(req, 'success', 'حساب بانکی ثبت شد و پس از تایید مدیریت قابل استفاده است.');
  res.redirect('/seller/settlements');
});

/* ---------------- مقالات ---------------- */

router.get('/blog', (req, res) => {
  res.locals.meta = seo.meta({ title: 'مقالات من', noindex: true });
  res.render('seller/blog', {
    rows: all(`SELECT * FROM posts WHERE seller_id=@s AND deleted_at IS NULL ORDER BY id DESC`, { s: req.seller.id }).map((p) => ({ ...p, tags: jparse(p.tags, []) })),
    categories: all(`SELECT * FROM post_categories WHERE status='active'`),
    products: all(`SELECT id, title FROM products WHERE seller_id=@s AND deleted_at IS NULL ORDER BY id DESC LIMIT 300`, { s: req.seller.id }),
    linked: all('SELECT post_id, product_id FROM post_products WHERE post_id IN (SELECT id FROM posts WHERE seller_id=@s)', { s: req.seller.id }),
  });
});

router.post('/blog', media.upload.single('cover'), (req, res) => {
  const b = req.body;
  const cover = req.file ? media.register(req.file, { userId: req.user.id, ownerType: 'seller', folder: '/posts' }).url : (b.cover_url || null);
  const data = {
    author_type: 'seller', author_id: req.user.id, seller_id: req.seller.id, category_id: toInt(b.category_id) || null,
    title: String(b.title || '').trim(), slug: slugify(b.slug || b.title), excerpt: b.excerpt || null, body: b.body || '',
    cover, video_url: b.video_url || null, audio_url: b.audio_url || null, kind: b.kind || 'text',
    tags: jstringify(String(b.tags || '').split(',').map((t) => t.trim()).filter(Boolean)),
    status: setting('seller_posts_need_approval', '1') === '1' ? 'pending' : 'published',
    published_at: setting('seller_posts_need_approval', '1') === '1' ? null : now(), created_at: now(), updated_at: now(),
  };
  if (!data.title) { auth.flash(req, 'danger', 'عنوان مقاله الزامی است.'); return res.redirect('/seller/blog'); }
  const id = b.id ? (get('SELECT id FROM posts WHERE id=@id AND seller_id=@s', { id: toInt(b.id), s: req.seller.id }) ? (update('posts', toInt(b.id), data), toInt(b.id)) : null) : insert('posts', data);
  if (id) {
    run('DELETE FROM post_products WHERE post_id=@id', { id });
    for (const pid of [].concat(b.product_ids || []).map(toInt).filter(Boolean)) insert('post_products', { post_id: id, product_id: pid });
    activity.logReq(req, 'post_create', { subjectType: 'post', subjectId: id, description: data.title });
  }
  auth.flash(req, 'success', 'مقاله ذخیره شد.');
  res.redirect('/seller/blog');
});

router.post('/blog/:id/delete', (req, res) => {
  const p = get('SELECT id FROM posts WHERE id=@id AND seller_id=@s', { id: toInt(req.params.id), s: req.seller.id });
  if (p) catalog.softDelete('posts', p.id);
  res.redirect('/seller/blog');
});

/* ---------------- پرسش‌ها و دیدگاه‌ها ---------------- */

router.get('/questions', (req, res) => {
  const rows = all(`SELECT q.*, p.title, p.slug, u.name AS author FROM questions q JOIN products p ON p.id=q.product_id LEFT JOIN users u ON u.id=q.user_id
                    WHERE p.seller_id=@s ORDER BY q.id DESC LIMIT 100`, { s: req.seller.id })
    .map((q) => ({ ...q, answers: all('SELECT a.*, u.name, u.role FROM answers a LEFT JOIN users u ON u.id=a.user_id WHERE a.question_id=@q ORDER BY a.id', { q: q.id }) }));
  res.locals.meta = seo.meta({ title: 'پرسش‌ها', noindex: true });
  res.render('seller/questions', { rows });
});

router.post('/questions/:id/answer', (req, res) => {
  const q = get(`SELECT q.* FROM questions q JOIN products p ON p.id=q.product_id WHERE q.id=@id AND p.seller_id=@s`, { id: toInt(req.params.id), s: req.seller.id });
  if (!q) return res.redirect('/seller/questions');
  insert('answers', { question_id: q.id, user_id: req.user.id, role_label: 'seller', body: req.body.body, created_at: now() });
  run(`UPDATE questions SET status='approved' WHERE id=@id`, { id: q.id });
  if (q.user_id) {
    const slug = get('SELECT slug FROM products WHERE id=@id', { id: q.product_id })?.slug || q.product_id;
    notify.push(q.user_id, { type: 'question', icon: 'help', title: 'پرسش شما پاسخ داده شد', body: truncate(req.body.body, 100), link: `/product/${slug}` });
  }
  res.redirect('/seller/questions');
});

router.get('/reviews', (req, res) => {
  const rows = all(`SELECT r.*, p.title, p.slug, u.name AS author FROM reviews r JOIN products p ON p.id=r.product_id LEFT JOIN users u ON u.id=r.user_id
                    WHERE p.seller_id=@s ORDER BY r.id DESC LIMIT 100`, { s: req.seller.id }).map((r) => ({ ...r, pros: jparse(r.pros, []), cons: jparse(r.cons, []) }));
  res.locals.meta = seo.meta({ title: 'دیدگاه‌ها', noindex: true });
  res.render('seller/reviews', { rows });
});

/* ---------------- تیکت با مدیران ---------------- */

router.get('/tickets', (req, res) => {
  res.locals.meta = seo.meta({ title: 'تیکت‌ها', noindex: true });
  res.render('seller/tickets', { rows: all(`SELECT * FROM tickets WHERE (owner_type='seller' AND owner_id=@s) OR seller_id=@s ORDER BY id DESC`, { s: req.seller.id }) });
});

router.post('/tickets', media.upload.single('attachment'), (req, res) => {
  const code = 'TK-' + randomCode('', 6);
  const id = insert('tickets', {
    code, subject: req.body.subject, body: req.body.body, department: req.body.department || 'support', priority: req.body.priority || 'normal',
    owner_type: 'seller', owner_id: req.seller.id, seller_id: req.seller.id, status: 'open', last_message_at: now(), messages_count: 1, created_at: now(), updated_at: now(),
  });
  const attach = req.file ? media.register(req.file, { userId: req.user.id, ownerType: 'seller', folder: '/tickets' }).url : null;
  insert('ticket_messages', { ticket_id: id, user_id: req.user.id, role_label: 'seller', body: req.body.body, attachment: attach, created_at: now() });
  notify.pushToStaff({ type: 'ticket', icon: 'message', title: 'تیکت فروشنده', body: `${req.seller.shop_name}: ${truncate(req.body.subject, 60)}`, link: `/admin/system/tickets/${code}` }, 'tickets.view');
  auth.flash(req, 'success', 'تیکت ارسال شد.');
  res.redirect('/seller/tickets');
});

router.get('/tickets/:code', (req, res) => {
  const t = get(`SELECT * FROM tickets WHERE code=@c AND (owner_type='seller' AND owner_id=@s)`, { c: req.params.code, s: req.seller.id });
  if (!t) return res.redirect('/seller/tickets');
  res.locals.meta = seo.meta({ title: 'تیکت ' + t.code, noindex: true });
  res.render('seller/ticket', { ticket: t, messages: all('SELECT m.*, u.name AS author, u.role FROM ticket_messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.ticket_id=@t ORDER BY m.id', { t: t.id }) });
});

router.post('/tickets/:code/reply', media.upload.single('attachment'), (req, res) => {
  const t = get(`SELECT * FROM tickets WHERE code=@c AND owner_type='seller' AND owner_id=@s`, { c: req.params.code, s: req.seller.id });
  if (!t) return res.redirect('/seller/tickets');
  const attach = req.file ? media.register(req.file, { userId: req.user.id, ownerType: 'seller', folder: '/tickets' }).url : null;
  insert('ticket_messages', { ticket_id: t.id, user_id: req.user.id, role_label: 'seller', body: req.body.body, attachment: attach, created_at: now() });
  run(`UPDATE tickets SET status='answered', last_message_at=@t, messages_count=messages_count+1 WHERE id=@id`, { t: now(), id: t.id });
  notify.pushToStaff({ type: 'ticket', icon: 'message', title: 'پاسخ تیکت فروشنده', body: `${t.code}: ${truncate(req.body.body, 60)}`, link: `/admin/system/tickets/${t.code}` }, 'tickets.view');
  res.redirect('/seller/tickets/' + t.code);
});

/* ---------------- کتابخانه مدیا (فقط فایل‌های خود فروشنده) ---------------- */

router.get('/media', (req, res) => {
  const result = media.list({ userId: req.user.id, q: req.query.q || '', limit: toInt(req.query.limit, 60) });
  if (req.query.ajax) {
    return res.json({ rows: result.rows.map((m) => ({ id: m.id, path: m.path, mime: m.mime, alt: m.alt, filename: m.filename, size: m.size })), total: result.total });
  }
  res.redirect('/seller/products');
});

/* ---------------- ویرایش فروشگاه ---------------- */

router.get('/store', (req, res) => {
  res.locals.meta = seo.meta({ title: 'ویرایش فروشگاه', noindex: true });
  res.render('seller/store', { documents: jparse(req.seller.documents, []), shippingMethods: shipping.allMethods({ sellerId: req.seller.id, includeInactive: true }), provinces: all('SELECT * FROM provinces ORDER BY name') });
});

router.post('/store', media.upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'banner', maxCount: 1 }, { name: 'documents', maxCount: 6 }]), (req, res) => {
  const b = req.body;
  const data = {
    shop_name: b.shop_name || req.seller.shop_name, shop_en: b.shop_en, description: b.description,
    phone: b.phone, email: b.email, province: b.province, city: b.city, address: b.address,
    lat: b.lat ? toFloat(b.lat) : null, lng: b.lng ? toFloat(b.lng) : null,
    national_id: b.national_id, reg_no: b.reg_no, updated_at: now(),
  };
  if (req.files?.logo?.[0]) data.logo = media.register(req.files.logo[0], { userId: req.user.id, ownerType: 'seller', folder: '/sellers' }).url;
  if (req.files?.banner?.[0]) data.banner = media.register(req.files.banner[0], { userId: req.user.id, ownerType: 'seller', folder: '/sellers' }).url;
  if (req.files?.documents?.length) {
    const docs = jparse(req.seller.documents, []);
    for (const f of req.files.documents) docs.push(media.register(f, { userId: req.user.id, ownerType: 'seller', folder: '/seller-documents' }).url);
    data.documents = jstringify(docs);
  }
  update('sellers', req.seller.id, data);
  activity.logReq(req, 'profile_update', { subjectType: 'seller', subjectId: req.seller.id, description: 'ویرایش اطلاعات فروشگاه' });
  auth.flash(req, 'success', 'اطلاعات فروشگاه بروزرسانی شد.');
  res.redirect('/seller/store');
});

/* ---------------- ابزارها ---------------- */

function parseKeyValue(titles, values) {
  const out = [];
  const t = [].concat(titles || []), v = [].concat(values || []);
  for (let i = 0; i < t.length; i++) if (String(t[i] || '').trim()) out.push({ title: String(t[i]).trim(), value: String(v[i] || '').trim() });
  return out;
}
function parseAttributes(attrs) {
  const out = {};
  if (!attrs) return out;
  for (const [k, v] of Object.entries(attrs)) {
    const arr = [].concat(v).filter((x) => x !== '' && x != null);
    if (arr.length) out[k] = arr;
  }
  return out;
}

module.exports = router;
