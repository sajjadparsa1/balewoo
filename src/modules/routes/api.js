'use strict';
const express = require('express');
const router = express.Router();
const { all, get, insert, run, jparse, setting } = require('../../db');
const catalog = require('../../core/catalog');
const cart = require('../cart');
const { toInt, numberFormat, truncate } = require('../../core/utils');
const { toPersianDigits } = require('../../core/jalali');

/**
 * API عمومی — جستجوی زنده، سبد خرید، فیلترها، استوری‌ها، نظرسنجی و وب‌سرویس ترب/دیجی‌کالا
 */

/* جستجوی زنده (محصول + دسته + برند) */
router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ products: [], categories: [], brands: [] });
  const like = `%${q}%`;
  const products = all(`SELECT p.id,p.title,p.slug,p.price,p.old_price,p.stock,
                        (SELECT media_path FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.sort LIMIT 1) AS image
                        FROM products p WHERE p.deleted_at IS NULL AND p.status='active' AND (p.title LIKE @q OR p.title_en LIKE @q OR p.keywords LIKE @q)
                        ORDER BY p.sold DESC LIMIT 8`, { q: like }).map(catalog.rowHydrate);
  const categories = all(`SELECT id,name,slug FROM categories WHERE deleted_at IS NULL AND name LIKE @q LIMIT 4`, { q: like });
  const brands = all(`SELECT id,name,slug,logo FROM brands WHERE deleted_at IS NULL AND name LIKE @q LIMIT 4`, { q: like });
  res.json({ products, categories, brands, term: q });
});

/* سبد خرید */
router.get('/cart', (req, res) => res.json(cart.compute(req)));
router.post('/cart/add', (req, res) => res.json(cart.add(req, req.body)));
router.post('/cart/update', (req, res) => res.json({ ...cart.setQty(req, req.body.item_id, req.body.qty), totals: cart.compute(req) }));
router.post('/cart/remove', (req, res) => res.json({ ...cart.removeItem(req, req.body.item_id), totals: cart.compute(req) }));
router.post('/cart/coupon', (req, res) => res.json({ ...cart.applyCoupon(req, req.body.code), totals: cart.compute(req) }));

/* فیلترهای دسته */
router.get('/categories/:slug/filters', (req, res) => {
  const c = catalog.findCategory(req.params.slug);
  if (!c) return res.status(404).json({ error: 'not found' });
  const groups = all('SELECT * FROM attribute_groups WHERE is_filter=1 AND (category_id=@c OR category_id IS NULL) ORDER BY sort', { c: c.id })
    .map((g) => ({ ...g, options: jparse(g.options, []) }));
  const ids = catalog.descendantIds(c.id);
  const priceBounds = get(`SELECT MIN(price) AS min, MAX(price) AS max FROM products WHERE status='active' AND deleted_at IS NULL AND category_id IN (${ids.join(',') || '0'})`);
  const brands = all(`SELECT DISTINCT b.id,b.name,b.slug FROM brands b JOIN products p ON p.brand_id=b.id WHERE p.category_id IN (${ids.join(',') || '0'}) AND p.status='active' AND p.deleted_at IS NULL`);
  res.json({ groups, priceBounds, brands, count: get(`SELECT COUNT(*) AS c FROM products WHERE status='active' AND deleted_at IS NULL AND category_id IN (${ids.join(',') || '0'})`).c });
});

/* متغیرها و قیمت پلکانی یک محصول */
router.get('/products/:id/variants', (req, res) => {
  const p = catalog.findProduct(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json({
    variants: catalog.variantsOf(p.id),
    options: catalog.optionsOf(p.id),
    tiers: catalog.tierDiscountsOf(p.id),
    price: p.final_price,
    stock: p.stock,
  });
});

/** محاسبه قیمت نهایی برای تعداد و متغیر انتخابی */
router.post('/products/:id/price', (req, res) => {
  const p = catalog.findProduct(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  const variant = req.body.variant_id ? get('SELECT * FROM product_variants WHERE id=@id', { id: toInt(req.body.variant_id) }) : null;
  const qty = Math.max(1, toInt(req.body.qty, 1));
  const unit = catalog.unitPriceForQty(p, qty, variant);
  const opts = catalog.optionsTotal(p.id, [].concat(req.body.option_ids || []).map(toInt));
  const total = (unit.price + opts.total) * qty;
  res.json({
    unit_price: unit.price, unit_old_price: unit.old_price, percent: unit.percent, tier: unit.tier,
    options: opts.items, options_total: opts.total, qty, total,
    formatted: { unit: toPersianDigits(numberFormat(unit.price + opts.total)), total: toPersianDigits(numberFormat(total)) },
    installment: toPersianDigits(numberFormat(Math.round(total / 4))),
  });
});

/* نمودار تغییرات قیمت */
router.get('/products/:id/price-history', (req, res) => {
  res.json(all('SELECT price, old_price, created_at FROM price_history WHERE product_id=@id ORDER BY id ASC LIMIT 120', { id: toInt(req.params.id) }));
});

/* استوری‌ها */
router.get('/stories', (req, res) => {
  res.json(all(`SELECT st.*, s.shop_name, s.logo FROM stories st LEFT JOIN sellers s ON s.id=st.owner_id
                WHERE st.status='active' AND (st.expires_at IS NULL OR st.expires_at > datetime('now')) ORDER BY st.sort ASC, st.id DESC LIMIT 40`)
    .map((s) => ({ ...s, product_ids: jparse(s.product_ids, []) })));
});

/* لیست محصولات (برای اسکرول بی‌نهایت) */
router.get('/products', (req, res) => {
  const params = { page: toInt(req.query.page, 1), perPage: Math.min(24, toInt(req.query.per, 12)), sort: req.query.sort || 'newest' };
  if (req.query.cat) { const c = catalog.findCategory(req.query.cat); if (c) params.categoryIds = catalog.descendantIds(c.id); }
  if (req.query.search) params.search = req.query.search;
  if (req.query.brand) { const b = catalog.findBrand(req.query.brand); if (b) params.brandId = b.id; }
  const r = catalog.listProducts(params);
  res.json({ rows: r.rows.map((p) => ({ id: p.id, title: p.title, slug: p.slug, price: p.price, old_price: p.old_price, discount_percent: p.discount_percent, cover: p.cover, stock: p.stock, rating: p.rating })), total: r.total, page: r.page });
});

/* نظردهی و پرسش */
router.post('/products/:id/review', (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false, error: 'برای ثبت دیدگاه وارد حساب شوید' });
  const p = catalog.findProduct(req.params.id);
  if (!p) return res.status(404).json({ ok: false });
  const isBuyer = !!get(`SELECT oi.id FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.product_id=@p AND o.user_id=@u AND o.payment_status='paid'`, { p: p.id, u: req.user.id });
  const id = insert('reviews', {
    product_id: p.id, user_id: req.user.id, rating: Math.min(5, Math.max(1, toInt(req.body.rating, 5))),
    title: req.body.title || null, body: req.body.body || '',
    pros: JSON.stringify([].concat(req.body.pros || []).filter(Boolean)),
    cons: JSON.stringify([].concat(req.body.cons || []).filter(Boolean)),
    recommend: req.body.recommend === '0' ? 0 : 1, is_buyer: isBuyer ? 1 : 0,
    status: setting('review_moderation', '1') === '1' ? 'pending' : 'approved',
    created_at: require('../../core/utils').now(),
  });
  if (setting('review_moderation', '1') !== '1') {
    const agg = get(`SELECT COUNT(*) AS c, COALESCE(SUM(rating),0) AS s, SUM(recommend) AS rec FROM reviews WHERE product_id=@p AND status='approved'`, { p: p.id });
    run('UPDATE products SET rating_count=@c, rating_sum=@s, recommend_count=@r WHERE id=@p', { c: agg.c, s: agg.s, r: agg.rec || 0, p: p.id });
  }
  res.json({ ok: true, message: setting('review_moderation', '1') === '1' ? 'دیدگاه شما پس از تایید منتشر می‌شود.' : 'دیدگاه شما ثبت شد.' });
});

router.post('/products/:id/question', (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false, error: 'وارد حساب شوید' });
  const p = catalog.findProduct(req.params.id);
  if (!p) return res.status(404).json({ ok: false });
  insert('questions', { product_id: p.id, user_id: req.user.id, body: String(req.body.body || '').slice(0, 1000), status: setting('question_moderation', '1') === '1' ? 'pending' : 'approved', created_at: require('../../core/utils').now() });
  res.json({ ok: true, message: 'پرسش شما ثبت شد.' });
});

router.post('/questions/:id/answer', (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false });
  const q = get('SELECT * FROM questions WHERE id=@id', { id: toInt(req.params.id) });
  if (!q) return res.status(404).json({ ok: false });
  const role = req.user.is_staff ? 'admin' : (req.user.role === 'seller' ? 'seller' : (get(`SELECT oi.id FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.product_id=@p AND o.user_id=@u AND o.payment_status='paid'`, { p: q.product_id, u: req.user.id }) ? 'buyer' : 'user'));
  insert('answers', { question_id: q.id, user_id: req.user.id, role_label: role, body: String(req.body.body || '').slice(0, 1000), created_at: require('../../core/utils').now() });
  res.json({ ok: true });
});

router.post('/reviews/:id/helpful', (req, res) => {
  run('UPDATE reviews SET helpful = helpful + 1 WHERE id=@id', { id: toInt(req.params.id) });
  res.json({ ok: true });
});

/* ---------------- وب‌سرویس‌های خارجی ---------------- */

/** ورودی محصولات از دیجی‌کالا (ساختار آماده — نیازمند کلید API) */
router.post('/import/digikala', async (req, res) => {
  if (!req.user?.is_staff) return res.status(403).json({ ok: false });
  const url = String(req.body.url || '');
  const apiKey = setting('digikala_api_key', '');
  if (!apiKey) return res.json({ ok: false, error: 'کلید API دیجی‌کالا در تنظیمات وارد نشده است.' });
  try {
    const response = await fetch(`https://api.digikala.com/v1/product?url=${encodeURIComponent(url)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const data = await response.json();
    res.json({ ok: response.ok, data });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

/** API مخصوص ترب (فید محصولات) */
router.get('/torob/feed', (req, res) => {
  const token = setting('torob_token', '');
  if (!token || req.query.token !== token) return res.status(403).json({ error: 'invalid token' });
  const products = all(`SELECT p.title, p.slug, p.price, p.stock, p.sku, b.name AS brand,
                        (SELECT media_path FROM product_images pi WHERE pi.product_id=p.id LIMIT 1) AS image
                        FROM products p LEFT JOIN brands b ON b.id=p.brand_id
                        WHERE p.status='active' AND p.deleted_at IS NULL LIMIT 5000`).map((p) => ({
    title: p.title,
    link: require('../../core/seo').siteUrl('/product/' + p.slug),
    price: p.price,
    availability: p.stock > 0 ? 'in stock' : 'out of stock',
    brand: p.brand,
    image: p.image ? require('../../core/seo').siteUrl(p.image) : null,
    sku: p.sku,
  }));
  res.json({ products, generated_at: new Date().toISOString() });
});

/** وب‌هوک وضعیت سفارش (برای اتصال به سرویس‌های ارسال) */
router.post('/webhooks/shipping/:code', (req, res) => {
  const token = setting('webhook_token', '');
  if (!token || req.query.token !== token) return res.status(403).json({ error: 'invalid token' });
  const order = get('SELECT * FROM orders WHERE code=@c', { c: req.params.code });
  if (!order) return res.status(404).json({ error: 'order not found' });
  if (req.body.tracking_code) run('UPDATE orders SET tracking_code=@t WHERE id=@id', { t: req.body.tracking_code, id: order.id });
  if (req.body.status) require('../orders').setStatus(order.id, req.body.status, { note: 'از طریق وب‌هوک', userId: null });
  res.json({ ok: true });
});

/* آمار زنده برای داشبورد */
router.get('/stats/live', (req, res) => {
  if (!req.user?.is_staff) return res.status(403).json({});
  res.json({
    online: get(`SELECT COUNT(*) AS c FROM user_sessions WHERE last_seen_at >= datetime('now','-5 minutes') AND revoked_at IS NULL`).c,
    visitsToday: get(`SELECT COUNT(*) AS c FROM page_views WHERE date(created_at)=date('now')`).c,
    ordersToday: get(`SELECT COUNT(*) AS c FROM orders WHERE date(created_at)=date('now')`).c,
    revenueToday: get(`SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE date(created_at)=date('now') AND payment_status='paid'`).s,
    pendingProducts: get(`SELECT COUNT(*) AS c FROM products WHERE status='pending' AND deleted_at IS NULL`).c,
    openTickets: get(`SELECT COUNT(*) AS c FROM tickets WHERE status IN ('open','answered')`).c,
  });
});

module.exports = router;
