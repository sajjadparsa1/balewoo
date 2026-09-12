'use strict';
const express = require('express');
const router = express.Router();
const { all, get, insert, update, run, db, jparse, jstringify, setting, setSetting, setMany, loadSettings } = require('../../db');
const auth = require('../../core/auth');
const acl = require('../../core/acl');
const seo = require('../../core/seo');
const notify = require('../../core/notify');
const activity = require('../../core/activity');
const catalog = require('../../core/catalog');
const orders = require('../orders');
const cart = require('../cart');
const media = require('../../core/media');
const cache = require('../../core/cache');
const payment = require('../../services/payment');
const shipping = require('../../services/shipping');
const sms = require('../../services/sms');
const { now, toInt, toFloat, numberFormat, slugify, randomCode, paginate, truncate, sum, percentOff } = require('../../core/utils');
const { formatJalali, formatJalaliLong, toPersianDigits, timeAgo } = require('../../core/jalali');

/* همه مسیرهای ادمین نیازمند نقش staff/admin هستند */
router.use(auth.requireLogin, (req, res, next) => {
  if (!req.user.is_staff) return res.status(403).render('errors/403', { meta: seo.meta({ title: 'دسترسی غیرمجاز', noindex: true }) });
  res.locals.panel = 'admin';
  res.locals.meta = seo.meta({ title: 'پنل مدیریت', noindex: true });
  res.locals.notifications = notify.forUser(req.user.id, { limit: 12 });
  res.locals.can = (perm) => acl.can(req.user, perm);
  res.locals.adminStats = () => ({
    pendingOrders: get(`SELECT COUNT(*) AS c FROM orders WHERE status='pending' OR payment_status='unpaid'`).c,
    pendingProducts: get(`SELECT COUNT(*) AS c FROM products WHERE status='pending' AND deleted_at IS NULL`).c,
    pendingSellers: get(`SELECT COUNT(*) AS c FROM sellers WHERE status='pending' AND deleted_at IS NULL`).c,
    openTickets: get(`SELECT COUNT(*) AS c FROM tickets WHERE status IN ('open','answered')`).c,
    pendingWithdrawals: get(`SELECT COUNT(*) AS c FROM withdrawals WHERE status='pending'`).c,
    pendingReviews: get(`SELECT COUNT(*) AS c FROM reviews WHERE status='pending'`).c,
  });
  next();
});

router.use('/people', require('./admin/people'));
router.use('/settings', require('./admin/settings'));
router.use('/content', require('./admin/content'));
router.use('/system', require('./admin/system'));

/* ================= داشبورد ================= */

router.get(['/', '/dashboard'], auth.requirePermission('dashboard.view'), (req, res) => {
  const s = orders.stats();
  const users = {
    total: get(`SELECT COUNT(*) AS c FROM users WHERE deleted_at IS NULL`).c,
    new7: get(`SELECT COUNT(*) AS c FROM users WHERE created_at >= datetime('now','-7 days')`).c,
    sellers: get(`SELECT COUNT(*) AS c FROM sellers WHERE status='active' AND deleted_at IS NULL`).c,
    blocked: get(`SELECT COUNT(*) AS c FROM users WHERE status='blocked'`).c,
  };
  const products = {
    total: get(`SELECT COUNT(*) AS c FROM products WHERE deleted_at IS NULL`).c,
    active: get(`SELECT COUNT(*) AS c FROM products WHERE status='active' AND deleted_at IS NULL`).c,
    outOfStock: get(`SELECT COUNT(*) AS c FROM products WHERE stock<=0 AND deleted_at IS NULL`).c,
    pending: get(`SELECT COUNT(*) AS c FROM products WHERE status='pending' AND deleted_at IS NULL`).c,
  };
  const visits = all(`SELECT date(created_at) AS d, COUNT(*) AS c FROM page_views WHERE created_at >= datetime('now','-14 days') GROUP BY date(created_at) ORDER BY d ASC`);
  const salesChart = all(`SELECT date(created_at) AS d, COUNT(*) AS c, COALESCE(SUM(total),0) AS s FROM orders WHERE created_at >= datetime('now','-14 days') GROUP BY date(created_at) ORDER BY d ASC`);
  const topSellers = all(`SELECT s.id, s.shop_name, s.logo, COALESCE(SUM(oi.total),0) AS revenue, COUNT(DISTINCT oi.order_id) AS orders
                          FROM sellers s LEFT JOIN order_items oi ON oi.seller_id=s.id LEFT JOIN orders o ON o.id=oi.order_id AND o.payment_status='paid'
                          WHERE s.deleted_at IS NULL GROUP BY s.id ORDER BY revenue DESC LIMIT 6`);
  const recentOrders = all(`SELECT o.*, u.name AS user_name, u.phone FROM orders o LEFT JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 8`).map((o) => ({ ...o, status_title: orders.statusTitle(o.status) }));
  const recentUsers = all(`SELECT * FROM users WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 6`);
  const activities = activity.latest(12);
  const lowStock = all(`SELECT id,title,stock,price FROM products WHERE stock<=@t AND deleted_at IS NULL AND status='active' ORDER BY stock ASC LIMIT 6`, { t: toInt(setting('low_stock_threshold', '5'), 5) });
  const topProducts = s.topProducts;
  res.locals.pageTitle = 'داشبورد';
  res.render('admin/dashboard', { stats: s, users, products, visits, salesChart, topSellers, recentOrders, recentUsers, activities, lowStock, topProducts });
});

/* ================= محصولات ================= */

router.get('/products', auth.requirePermission('products.view'), (req, res) => {
  const page = toInt(req.query.page, 1), perPage = 20;
  const params = { page, perPage, sort: req.query.sort || 'newest', search: req.query.search };
  if (req.query.status) params.status = req.query.status;
  if (req.query.seller) params.sellerId = toInt(req.query.seller);
  if (req.query.category) { const c = catalog.findCategory(req.query.category); if (c) params.categoryIds = catalog.descendantIds(c.id); }
  if (req.query.trashed === '1') { params.trashedOnly = 1; params.status = null; }
  const result = catalog.listProducts(params);
  res.locals.pageTitle = 'محصولات';
  res.render('admin/products', {
    rows: result.rows, pg: paginate(result.total, page, perPage),
    sellers: all(`SELECT id, shop_name FROM sellers WHERE deleted_at IS NULL ORDER BY shop_name`),
    categories: catalog.categoryTree(null),
  });
});

router.get('/products/create', auth.requirePermission('products.create'), (req, res) => {
  res.locals.pageTitle = 'افزودن محصول';
  res.render('admin/product-form', {
    p: null, variants: [], extraOptions: [], tiers: [], images: [], warehouses: all(`SELECT * FROM warehouses ORDER BY is_default DESC`),
    categories: catalog.categoryTree(null), brands: catalog.brandList(),
    attributeGroups: all('SELECT * FROM attribute_groups ORDER BY sort').map((g) => ({ ...g, options: jparse(g.options, []) })),
    sellers: all(`SELECT id, shop_name, is_main FROM sellers WHERE deleted_at IS NULL ORDER BY is_main DESC, shop_name`),
  });
});

router.get('/products/:id/edit', auth.requirePermission('products.edit'), (req, res) => {
  const p = catalog.findProduct(req.params.id, { withTrashed: true });
  if (!p) return res.redirect('/admin/products');
  p.specs = jparse(p.specs, []); p.highlights = jparse(p.highlights, []); p.attributes = jparse(p.attributes, {});
  res.locals.pageTitle = 'ویرایش محصول';
  res.render('admin/product-form', {
    p, variants: catalog.variantsOf(p.id).map((v) => ({ ...v, options: jparse(v.options, {}) })),
    extraOptions: catalog.optionsOf(p.id), tiers: catalog.tierDiscountsOf(p.id), images: catalog.imagesOf(p.id),
    warehouses: all(`SELECT * FROM warehouses ORDER BY is_default DESC`),
    categories: catalog.categoryTree(null), brands: catalog.brandList(),
    attributeGroups: all('SELECT * FROM attribute_groups ORDER BY sort').map((g) => ({ ...g, options: jparse(g.options, []) })),
    sellers: all(`SELECT id, shop_name, is_main FROM sellers WHERE deleted_at IS NULL ORDER BY is_main DESC, shop_name`),
    stock: all(`SELECT wi.*, w.name AS warehouse_name FROM warehouse_items wi JOIN warehouses w ON w.id=wi.warehouse_id WHERE wi.product_id=@p`, { p: p.id }),
    history: all('SELECT * FROM price_history WHERE product_id=@p ORDER BY id DESC LIMIT 30', { p: p.id }),
  });
});

function productPayload(b) {
  return {
    seller_id: b.seller_id ? toInt(b.seller_id) : null,
    category_id: toInt(b.category_id) || null,
    brand_id: toInt(b.brand_id) || null,
    title: String(b.title || '').trim(), title_en: b.title_en || null,
    slug: slugify(b.slug || b.title), sku: b.sku || null,
    type: b.is_inquiry ? 'inquiry' : (b.type || 'normal'),
    is_inquiry: b.is_inquiry ? 1 : 0,
    condition_txt: b.condition_txt || 'new', warranty: b.warranty || null,
    short_desc: b.short_desc || null, description: b.description || null, keywords: b.keywords || null,
    specs: kv(b.spec_titles, b.spec_values), highlights: kv(b.highlight_titles, b.highlight_values),
    attributes: attrs(b.attributes),
    price: toInt(b.price), old_price: toInt(b.old_price),
    discount_start: b.discount_start || null, discount_end: b.discount_end || null,
    base_currency_rate: toFloat(b.base_currency_rate, 1) || 1,
    stock: toInt(b.stock), weight: toFloat(b.weight),
    is_special: b.is_special ? 1 : 0, is_featured: b.is_featured ? 1 : 0, is_best_seller: b.is_best_seller ? 1 : 0,
    affiliate: b.affiliate ? 1 : 0, aff_gold: toFloat(b.aff_gold), aff_silver: toFloat(b.aff_silver), aff_bronze: toFloat(b.aff_bronze),
    points_reward: toInt(b.points_reward), min_order: toInt(b.min_order, 1), max_order: toInt(b.max_order),
    seo_title: b.seo_title || null, seo_desc: b.seo_desc || null,
    status: b.status || 'active',
  };
}
function kv(t, v) { const a = [].concat(t || []), b = [].concat(v || []), out = []; for (let i = 0; i < a.length; i++) if (String(a[i] || '').trim()) out.push({ title: String(a[i]).trim(), value: String(b[i] || '').trim() }); return out; }
function attrs(o) { const out = {}; if (!o) return out; for (const [k, v] of Object.entries(o)) { const a = [].concat(v).filter((x) => x !== '' && x != null); if (a.length) out[k] = a; } return out; }

router.post('/products', auth.requirePermission('products.create'), media.upload.array('images', 15), (req, res) => {
  const b = req.body;
  const data = productPayload(b);
  if (!data.title) { auth.flash(req, 'danger', 'عنوان محصول الزامی است.'); return res.redirect('back'); }
  const isEdit = !!b.id;
  let id;
  if (isEdit) {
    id = toInt(b.id);
    catalog.updateProduct(id, data);
    activity.logReq(req, 'product_update', { subjectType: 'product', subjectId: id, description: data.title });
  } else {
    id = catalog.createProduct(data, { userId: req.user.id });
    activity.logReq(req, 'product_create', { subjectType: 'product', subjectId: id, description: data.title });
  }

  // متغیرها
  if (b.variant_titles) {
    const keep = new Set([].concat(b.variant_ids || []).map(toInt).filter(Boolean));
    run(`DELETE FROM product_variants WHERE product_id=@p AND id NOT IN (${keep.size ? [...keep].join(',') : '0'})`, { p: id });
    for (let i = 0; i < [].concat(b.variant_titles).length; i++) {
      const title = String([].concat(b.variant_titles)[i] || '').trim();
      const vid = toInt([].concat(b.variant_ids || [])[i]);
      if (!title) continue;
      const row = {
        product_id: id, seller_id: b.seller_id ? toInt(b.seller_id) : null, title,
        options: jstringify({ 'متغیر': title }),
        price: toInt([].concat(b.variant_prices || [])[i]), old_price: toInt([].concat(b.variant_old_prices || [])[i]),
        stock: toInt([].concat(b.variant_stocks || [])[i]), sku: [].concat(b.variant_skus || [])[i] || null,
        weight: toFloat([].concat(b.variant_weights || [])[i]), is_default: i === 0 ? 1 : 0, status: 'active',
      };
      if (vid) update('product_variants', vid, row); else insert('product_variants', { ...row, created_at: now() });
    }
    catalog.syncProductAggregates(id);
  }

  // ویژگی‌های اضافی
  if (b.option_titles) {
    run('DELETE FROM product_options WHERE product_id=@p', { p: id });
    [].concat(b.option_titles).forEach((t, i) => {
      if (!String(t || '').trim()) return;
      insert('product_options', { product_id: id, title: String(t).trim(), price: toInt([].concat(b.option_prices || [])[i]), is_required: [].concat(b.option_required || [])[i] ? 1 : 0, sort: i });
    });
  }

  // تخفیف پلکانی
  if (b.tier_qty) {
    run('DELETE FROM tier_discounts WHERE product_id=@p', { p: id });
    [].concat(b.tier_qty).forEach((q, i) => {
      const qty = toInt(q); if (!qty) return;
      insert('tier_discounts', { product_id: id, min_qty: qty, price: toInt([].concat(b.tier_price || [])[i]) || null, percent: toFloat([].concat(b.tier_percent || [])[i]) || null });
    });
  }

  // تصاویر
  for (const f of req.files || []) {
    const m = media.register(f, { userId: req.user.id, folder: '/products' });
    insert('product_images', { product_id: id, media_path: m.url, alt: data.title, kind: 'gallery', created_at: now() });
  }
  if (b.library_images) for (const pth of [].concat(b.library_images)) insert('product_images', { product_id: id, media_path: pth, alt: data.title, kind: 'gallery', created_at: now() });
  if (b.cover_image) { run(`UPDATE product_images SET kind='gallery' WHERE product_id=@p`, { p: id }); run(`UPDATE product_images SET kind='cover' WHERE product_id=@p AND media_path=@m`, { p: id, m: b.cover_image }); }

  // موجودی انبار
  if (b.warehouse_qty) {
    for (const [wid, qty] of Object.entries(b.warehouse_qty)) {
      const w = get('SELECT * FROM warehouses WHERE id=@id', { id: toInt(wid) });
      if (!w) continue;
      const q = toInt(qty);
      const existing = get('SELECT * FROM warehouse_items WHERE warehouse_id=@w AND product_id=@p AND variant_id IS NULL', { w: w.id, p: id });
      if (existing) { insert('stock_movements', { warehouse_id: w.id, product_id: id, change: q - existing.qty, reason: 'adjust', user_id: req.user.id, created_at: now() }); run('UPDATE warehouse_items SET qty=@q, price=@pr, updated_at=@t WHERE id=@id', { q, pr: data.price, t: now(), id: existing.id }); }
      else { insert('warehouse_items', { warehouse_id: w.id, product_id: id, qty: q, price: data.price, updated_at: now() }); insert('stock_movements', { warehouse_id: w.id, product_id: id, change: q, reason: 'purchase', user_id: req.user.id, created_at: now() }); }
    }
  }

  cache.flushGroup('catalog');
  auth.flash(req, 'success', isEdit ? 'محصول بروزرسانی شد.' : 'محصول ایجاد شد.');
  res.redirect('/admin/products/' + id + '/edit');
});

router.post('/products/:id/approve', auth.requirePermission('products.approve'), (req, res) => {
  const p = catalog.findProduct(req.params.id);
  if (!p) return res.redirect('/admin/products');
  catalog.updateProduct(p.id, { status: 'active', reject_reason: null, published_at: now() });
  const seller = p.seller_id ? get('SELECT user_id FROM sellers WHERE id=@id', { id: p.seller_id }) : null;
  if (seller?.user_id) notify.push(seller.user_id, notify.T.productApproved(p.title));
  activity.logReq(req, 'product_approve', { subjectType: 'product', subjectId: p.id, description: p.title });
  auth.flash(req, 'success', 'محصول تایید و منتشر شد.');
  res.redirect('back');
});

router.post('/products/:id/reject', auth.requirePermission('products.approve'), (req, res) => {
  const p = catalog.findProduct(req.params.id);
  if (!p) return res.redirect('/admin/products');
  catalog.updateProduct(p.id, { status: 'rejected', reject_reason: req.body.reason || '' });
  const seller = p.seller_id ? get('SELECT user_id FROM sellers WHERE id=@id', { id: p.seller_id }) : null;
  if (seller?.user_id) notify.push(seller.user_id, notify.T.productRejected(p.title));
  auth.flash(req, 'success', 'محصول رد شد.');
  res.redirect('back');
});

router.post('/products/:id/delete', auth.requirePermission('products.delete'), (req, res) => {
  catalog.softDelete('products', toInt(req.params.id));
  activity.logReq(req, 'product_delete', { subjectType: 'product', subjectId: toInt(req.params.id) });
  auth.flash(req, 'success', 'محصول به سطل زباله منتقل شد.');
  res.redirect('back');
});

router.post('/products/bulk', auth.requirePermission('products.edit'), (req, res) => {
  const ids = [].concat(req.body.ids || []).map(toInt).filter(Boolean);
  const action = req.body.action;
  if (!ids.length) return res.redirect('back');
  db.transaction(() => {
    for (const id of ids) {
      if (action === 'activate') catalog.updateProduct(id, { status: 'active' });
      else if (action === 'deactivate') catalog.updateProduct(id, { status: 'inactive' });
      else if (action === 'special') run('UPDATE products SET is_special=1 WHERE id=@id', { id });
      else if (action === 'unspecial') run('UPDATE products SET is_special=0 WHERE id=@id', { id });
      else if (action === 'delete') catalog.softDelete('products', id);
      else if (action === 'increase' || action === 'decrease') {
        const pct = toFloat(req.body.percent, 0);
        const p = get('SELECT price FROM products WHERE id=@id', { id });
        if (p) { const np = Math.round((action === 'increase' ? p.price * (1 + pct / 100) : p.price * (1 - pct / 100)) / 1000) * 1000; catalog.updateProduct(id, { price: Math.max(0, np) }); }
      }
    }
  })();
  cache.flushGroup('catalog');
  auth.flash(req, 'success', `عملیات روی ${toPersianDigits(ids.length)} محصول انجام شد.`);
  res.redirect('back');
});

/* ---------- سطل زباله ---------- */
router.get('/trash', auth.requirePermission('trash.manage'), (req, res) => {
  res.locals.pageTitle = 'سطل زباله';
  res.render('admin/trash', {
    products: all(`SELECT p.id,p.title,p.slug,p.deleted_at,s.shop_name FROM products p LEFT JOIN sellers s ON s.id=p.seller_id WHERE p.deleted_at IS NOT NULL ORDER BY p.deleted_at DESC LIMIT 100`),
    posts: all(`SELECT id,title,slug,deleted_at FROM posts WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 50`),
    categories: all(`SELECT id,name,slug,deleted_at FROM categories WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 50`),
    brands: all(`SELECT id,name,slug,deleted_at FROM brands WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 50`),
    pages: all(`SELECT id,title,slug,deleted_at FROM pages WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 50`),
    users: all(`SELECT id,name,phone,deleted_at FROM users WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 50`),
  });
});
router.post('/trash/:table/:id/restore', auth.requirePermission('trash.manage'), (req, res) => {
  const allowed = ['products', 'posts', 'categories', 'brands', 'pages', 'users'];
  if (allowed.includes(req.params.table)) { catalog.restore(req.params.table, toInt(req.params.id)); auth.flash(req, 'success', 'بازیابی شد.'); }
  res.redirect('/admin/trash');
});
router.post('/trash/:table/:id/destroy', auth.requirePermission('trash.manage'), (req, res) => {
  const allowed = ['products', 'posts', 'categories', 'brands', 'pages', 'users'];
  if (allowed.includes(req.params.table)) { catalog.hardDelete(req.params.table, toInt(req.params.id)); auth.flash(req, 'success', 'برای همیشه حذف شد.'); }
  res.redirect('/admin/trash');
});

/* ================= دسته‌بندی‌ها / برندها / ویژگی‌ها ================= */

router.get('/categories', auth.requirePermission('categories.view'), (req, res) => {
  res.locals.pageTitle = 'دسته‌بندی‌ها';
  res.render('admin/categories', { tree: categoryAdminTree(null), rows: all(`SELECT c.*, p.name AS parent_name FROM categories c LEFT JOIN categories p ON p.id=c.parent_id WHERE c.deleted_at IS NULL ORDER BY c.parent_id IS NOT NULL, c.sort ASC, c.id ASC`) });
});
function categoryAdminTree(parentId) {
  const rows = all(`SELECT * FROM categories WHERE parent_id ${parentId ? '= @p' : 'IS NULL'} AND deleted_at IS NULL ORDER BY sort ASC, id ASC`, { p: parentId });
  return rows.map((c) => ({ ...c, children: categoryAdminTree(c.id) }));
}
router.post('/categories', auth.requirePermission('categories.manage'), media.upload.single('image'), (req, res) => {
  const b = req.body;
  const data = { name: b.name, slug: slugify(b.slug || b.name), parent_id: toInt(b.parent_id) || null, description: b.description || null, seo_title: b.seo_title || null, seo_desc: b.seo_desc || null, sort: toInt(b.sort), in_menu: b.in_menu ? 1 : 0, status: b.status || 'active' };
  if (req.file) data.image = media.register(req.file, { userId: req.user.id, folder: '/categories' }).url;
  else if (b.image_url) data.image = b.image_url;
  if (b.id) { update('categories', toInt(b.id), data); activity.logReq(req, 'category_update', { subjectType: 'category', subjectId: toInt(b.id) }); }
  else { data.created_at = now(); insert('categories', data); }
  cache.flush();
  auth.flash(req, 'success', 'دسته‌بندی ذخیره شد.');
  res.redirect('/admin/categories');
});
router.post('/categories/:id/delete', auth.requirePermission('categories.manage'), (req, res) => {
  catalog.softDelete('categories', toInt(req.params.id)); cache.flush();
  auth.flash(req, 'success', 'دسته‌بندی حذف شد.');
  res.redirect('/admin/categories');
});

router.get('/brands', auth.requirePermission('brands.view'), (req, res) => {
  res.locals.pageTitle = 'برندها';
  res.render('admin/brands', { rows: all(`SELECT * FROM brands WHERE deleted_at IS NULL ORDER BY sort ASC, id DESC`) });
});
router.post('/brands', auth.requirePermission('brands.manage'), media.upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), (req, res) => {
  const b = req.body;
  const data = { name: b.name, name_en: b.name_en || null, slug: slugify(b.slug || b.name), description: b.description || null, seo_title: b.seo_title || null, seo_desc: b.seo_desc || null, sort: toInt(b.sort), status: b.status || 'active' };
  if (req.files?.logo?.[0]) data.logo = media.register(req.files.logo[0], { userId: req.user.id, folder: '/brands' }).url;
  else if (b.logo_url) data.logo = b.logo_url;
  if (req.files?.banner?.[0]) data.banner = media.register(req.files.banner[0], { userId: req.user.id, folder: '/brands' }).url;
  if (b.id) update('brands', toInt(b.id), data); else insert('brands', { ...data, created_at: now() });
  cache.flush();
  auth.flash(req, 'success', 'برند ذخیره شد.');
  res.redirect('/admin/brands');
});
router.post('/brands/:id/delete', auth.requirePermission('brands.manage'), (req, res) => { catalog.softDelete('brands', toInt(req.params.id)); cache.flush(); res.redirect('/admin/brands'); });

router.get('/attributes', auth.requirePermission('attributes.manage'), (req, res) => {
  res.locals.pageTitle = 'فیلترها و ویژگی‌ها';
  res.render('admin/attributes', {
    rows: all(`SELECT a.*, c.name AS category_name FROM attribute_groups a LEFT JOIN categories c ON c.id=a.category_id ORDER BY a.sort ASC, a.id DESC`),
    categories: all(`SELECT id,name FROM categories WHERE deleted_at IS NULL ORDER BY name`),
  });
});
router.post('/attributes', auth.requirePermission('attributes.manage'), (req, res) => {
  const b = req.body;
  const options = [].concat(b.option_titles || []).map((t, i) => ({ id: i + 1, title: String(t || '').trim(), color: [].concat(b.option_colors || [])[i] || null })).filter((o) => o.title);
  const data = {
    name: b.name, category_id: toInt(b.category_id) || null, type: b.type || 'select', options: jstringify(options),
    unit: b.unit || null, is_filter: b.is_filter ? 1 : 0, is_variant: b.is_variant ? 1 : 0, is_spec: b.is_spec ? 1 : 0, sort: toInt(b.sort),
  };
  if (b.id) update('attribute_groups', toInt(b.id), data); else insert('attribute_groups', { ...data, created_at: now() });
  cache.flush();
  auth.flash(req, 'success', 'ذخیره شد.');
  res.redirect('/admin/attributes');
});
router.post('/attributes/:id/delete', auth.requirePermission('attributes.manage'), (req, res) => { run('DELETE FROM attribute_groups WHERE id=@id', { id: toInt(req.params.id) }); cache.flush(); res.redirect('/admin/attributes'); });

/* ================= انبارها ================= */

router.get('/warehouses', auth.requirePermission('warehouses.manage'), (req, res) => {
  res.locals.pageTitle = 'انبارها';
  res.render('admin/warehouses', {
    warehouses: all(`SELECT w.*, s.shop_name FROM warehouses w LEFT JOIN sellers s ON s.id=w.owner_id ORDER BY w.is_default DESC, w.id ASC`)
      .map((w) => ({ ...w, items_count: get('SELECT COUNT(*) AS c FROM warehouse_items WHERE warehouse_id=@id', { id: w.id }).c, qty: get('SELECT COALESCE(SUM(qty),0) AS s FROM warehouse_items WHERE warehouse_id=@id', { id: w.id }).s })),
    movements: all(`SELECT sm.*, p.title, w.name AS warehouse_name FROM stock_movements sm LEFT JOIN products p ON p.id=sm.product_id LEFT JOIN warehouses w ON w.id=sm.warehouse_id ORDER BY sm.id DESC LIMIT 60`),
    products: all(`SELECT id,title,stock FROM products WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 300`),
  });
});
router.post('/warehouses', auth.requirePermission('warehouses.manage'), (req, res) => {
  const b = req.body;
  const data = { owner_type: b.owner_type === 'seller' ? 'seller' : 'main', owner_id: toInt(b.owner_id) || 0, name: b.name, address: b.address || null, phone: b.phone || null, is_default: b.is_default ? 1 : 0 };
  if (b.id) update('warehouses', toInt(b.id), data); else insert('warehouses', { ...data, created_at: now() });
  if (b.is_default) run(`UPDATE warehouses SET is_default=0 WHERE id<>@id`, { id: toInt(b.id) || db.prepare('SELECT last_insert_rowid() AS id').get().id });
  auth.flash(req, 'success', 'انبار ذخیره شد.');
  res.redirect('/admin/warehouses');
});
router.post('/warehouses/:id/adjust', auth.requirePermission('warehouses.manage'), (req, res) => {
  const wid = toInt(req.params.id);
  const productId = toInt(req.body.product_id) || null;
  const variantId = toInt(req.body.variant_id) || null;
  const qty = toInt(req.body.qty);
  const existing = get('SELECT * FROM warehouse_items WHERE warehouse_id=@w AND product_id IS @p AND variant_id IS @v', { w: wid, p: productId, v: variantId });
  if (existing) {
    insert('stock_movements', { warehouse_id: wid, product_id: productId, variant_id: variantId, change: qty - existing.qty, reason: req.body.reason || 'adjust', user_id: req.user.id, created_at: now() });
    run('UPDATE warehouse_items SET qty=@q, price=@pr, updated_at=@t WHERE id=@id', { q: Math.max(0, qty), pr: toInt(req.body.price), t: now(), id: existing.id });
  } else {
    insert('warehouse_items', { warehouse_id: wid, product_id: productId, variant_id: variantId, qty: Math.max(0, qty), price: toInt(req.body.price), updated_at: now() });
    insert('stock_movements', { warehouse_id: wid, product_id: productId, variant_id: variantId, change: qty, reason: req.body.reason || 'purchase', user_id: req.user.id, created_at: now() });
  }
  if (productId) { run('UPDATE products SET stock=(SELECT COALESCE(SUM(qty),0) FROM warehouse_items WHERE product_id=@p) WHERE id=@p', { p: productId }); catalog.syncProductAggregates(productId); }
  activity.logReq(req, 'stock_change', { subjectType: 'warehouse', subjectId: wid, description: `موجودی ${qty}` });
  auth.flash(req, 'success', 'موجودی بروزرسانی شد.');
  res.redirect('/admin/warehouses');
});
router.post('/warehouses/:id/delete', auth.requirePermission('warehouses.manage'), (req, res) => {
  run('DELETE FROM warehouse_items WHERE warehouse_id=@id', { id: toInt(req.params.id) });
  run('DELETE FROM warehouses WHERE id=@id', { id: toInt(req.params.id) });
  res.redirect('/admin/warehouses');
});

/* ================= سفارش‌ها ================= */

router.get('/orders', auth.requirePermission('orders.view'), (req, res) => {
  const result = orders.listOrders({ page: toInt(req.query.page, 1), perPage: 20, status: req.query.status, paymentStatus: req.query.payment, search: req.query.search, from: req.query.from, to: req.query.to, sellerId: req.query.seller ? toInt(req.query.seller) : null });
  res.locals.pageTitle = 'سفارش‌ها';
  res.render('admin/orders', { rows: result.rows, pg: paginate(result.total, result.page, result.perPage), statuses: orders.statuses(), stats: orders.stats() });
});

/* خروجی CSV سفارش‌ها (با همان فیلترهای فهرست) — باید پیش از /orders/:code ثبت شود */
router.get('/orders/export', auth.requirePermission('orders.invoice'), (req, res) => {
  const result = orders.listOrders({
    page: 1, perPage: 100, status: req.query.status, paymentStatus: req.query.payment,
    search: req.query.search, from: req.query.from, to: req.query.to,
    sellerId: req.query.seller ? toInt(req.query.seller) : null,
  });
  const head = ['code', 'created_at', 'customer', 'phone', 'items', 'subtotal', 'discount', 'shipping', 'total', 'payment_status', 'payment_method', 'status', 'tracking_code'];
  const csv = [head.join(',')].concat(result.rows.map((o) => [
    o.code, o.created_at, `"${String(o.user_name || o.receiver_name || '').replace(/"/g, '')}"`,
    o.user_phone || o.receiver_phone || o.guest_phone || '', o.items_count, o.subtotal,
    (o.items_discount || 0) + (o.coupon_discount || 0), o.shipping_cost, o.total,
    o.payment_status, o.payment_method || '', o.status, o.tracking_code || '',
  ].join(','))).join('\n');
  activity.logReq(req, 'orders_export', { description: `${result.rows.length} رکورد` });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="orders-${Date.now()}.csv"`);
  res.send('\uFEFF' + csv);
});

router.get('/orders/:code', auth.requirePermission('orders.view'), (req, res) => {
  const order = orders.find(req.params.code);
  if (!order) return res.redirect('/admin/orders');
  res.locals.pageTitle = `سفارش ${order.code}`;
  res.render('admin/order-detail', { order: orders.detail(order.id), invoice: orders.invoiceData(order.id), label: shipping.labelData(order), gateways: payment.listGateways(), statuses: orders.statuses() });
});

router.post('/orders/:code/status', auth.requirePermission('orders.manage'), (req, res) => {
  const order = orders.find(req.params.code);
  if (!order) return res.redirect('/admin/orders');
  orders.setStatus(order.id, req.body.status, { note: req.body.note, userId: req.user.id });
  auth.flash(req, 'success', 'وضعیت سفارش بروزرسانی شد.');
  res.redirect('/admin/orders/' + order.code);
});

router.post('/orders/:code/tracking', auth.requirePermission('orders.manage'), (req, res) => {
  const order = orders.find(req.params.code);
  if (!order) return res.redirect('/admin/orders');
  orders.setTracking(order.id, req.body.tracking_code, { userId: req.user.id, carrier: req.body.carrier });
  auth.flash(req, 'success', 'کد رهگیری ثبت و به مشتری اطلاع داده شد.');
  res.redirect('/admin/orders/' + order.code);
});

router.post('/orders/:code/mark-paid', auth.requirePermission('orders.manage'), (req, res) => {
  const order = orders.find(req.params.code);
  if (!order) return res.redirect('/admin/orders');
  orders.markPaid(order.id, { gateway: req.body.gateway || 'manual', reference: req.body.reference || 'MANUAL', userId: req.user.id, method: req.body.gateway || 'manual' });
  auth.flash(req, 'success', 'پرداخت سفارش به‌صورت دستی تایید شد.');
  res.redirect('/admin/orders/' + order.code);
});

router.post('/orders/:code/item-status', auth.requirePermission('orders.manage'), (req, res) => {
  const order = orders.find(req.params.code);
  if (!order) return res.redirect('/admin/orders');
  run('UPDATE order_items SET status=@s WHERE id=@id', { s: req.body.status, id: toInt(req.body.item_id) });
  orders.logStatus(order.id, req.body.status, `وضعیت آیتم #${req.body.item_id} تغییر کرد`, req.user.id);
  res.redirect('/admin/orders/' + order.code);
});

router.get('/orders/:code/invoice', auth.requirePermission('orders.invoice'), (req, res) => {
  const order = orders.find(req.params.code);
  if (!order) return res.redirect('/admin/orders');
  res.render('admin/invoice', { invoice: orders.invoiceData(order.id), layout: false });
});
router.get('/orders/:code/label', auth.requirePermission('orders.invoice'), (req, res) => {
  const order = orders.find(req.params.code);
  if (!order) return res.redirect('/admin/orders');
  res.render('admin/label', { order, label: shipping.labelData(order), layout: false });
});

/* ================= پیش‌فاکتور ================= */

router.get('/preinvoices', auth.requirePermission('preinvoices.manage'), (req, res) => {
  res.locals.pageTitle = 'پیش‌فاکتورها';
  res.render('admin/preinvoices', {
    rows: all(`SELECT pi.*, u.name, u.phone FROM preinvoices pi LEFT JOIN users u ON u.id=pi.user_id ORDER BY pi.id DESC LIMIT 200`),
    users: all(`SELECT id,name,phone FROM users WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 300`),
  });
});
router.post('/preinvoices', auth.requirePermission('preinvoices.manage'), (req, res) => {
  const items = [];
  const titles = [].concat(req.body.item_titles || []);
  for (let i = 0; i < titles.length; i++) {
    if (!String(titles[i] || '').trim()) continue;
    items.push({ title: String(titles[i]).trim(), qty: toInt([].concat(req.body.item_qtys || [])[i], 1), price: toInt([].concat(req.body.item_prices || [])[i]) });
  }
  if (!items.length) { auth.flash(req, 'danger', 'حداقل یک آیتم وارد کنید.'); return res.redirect('/admin/preinvoices'); }
  const r = orders.createPreinvoice({ userId: toInt(req.body.user_id), createdBy: req.user.id, items, discount: toInt(req.body.discount), vat: toInt(req.body.vat), note: req.body.note, expiresInDays: toInt(req.body.expires, 7) });
  activity.logReq(req, 'preinvoice_create', { subjectType: 'preinvoice', subjectId: r.id, description: r.code });
  auth.flash(req, 'success', `پیش‌فاکتور ${r.code} صادر شد.`);
  res.redirect('/admin/preinvoices');
});
router.post('/preinvoices/:code/cancel', auth.requirePermission('preinvoices.manage'), (req, res) => {
  run(`UPDATE preinvoices SET status='canceled' WHERE code=@c`, { c: req.params.code });
  res.redirect('/admin/preinvoices');
});

/* ================= کوپن‌ها ================= */

router.get('/coupons', auth.requirePermission('coupons.manage'), (req, res) => {
  res.locals.pageTitle = 'کدهای تخفیف';
  res.render('admin/coupons', {
    rows: all(`SELECT c.*, u.phone AS user_phone FROM coupons c LEFT JOIN users u ON u.id=c.user_id ORDER BY c.id DESC`),
    users: all(`SELECT id,name,phone FROM users WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 300`),
    products: all(`SELECT id,title FROM products WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 300`),
  });
});
router.post('/coupons', auth.requirePermission('coupons.manage'), (req, res) => {
  const b = req.body;
  const data = {
    code: String(b.code || '').trim().toUpperCase(), type: b.type || 'percent', value: toInt(b.value),
    max_discount: toInt(b.max_discount), min_cart: toInt(b.min_cart), usage_limit: toInt(b.usage_limit),
    per_user: toInt(b.per_user, 1), user_id: toInt(b.user_id) || null,
    product_ids: jstringify([].concat(b.product_ids || []).map(toInt).filter(Boolean)),
    seller_ids: jstringify([].concat(b.seller_ids || []).map(toInt).filter(Boolean)),
    starts_at: b.starts_at || null, expires_at: b.expires_at || null, status: b.status || 'active', created_by: req.user.id,
  };
  if (!data.code) { auth.flash(req, 'danger', 'کد تخفیف الزامی است.'); return res.redirect('/admin/coupons'); }
  if (b.id) update('coupons', toInt(b.id), data); else insert('coupons', { ...data, created_at: now() });
  activity.logReq(req, 'coupon_create', { subjectType: 'coupon', description: data.code });
  auth.flash(req, 'success', 'کد تخفیف ذخیره شد.');
  res.redirect('/admin/coupons');
});
router.post('/coupons/:id/delete', auth.requirePermission('coupons.manage'), (req, res) => { run('DELETE FROM coupons WHERE id=@id', { id: toInt(req.params.id) }); res.redirect('/admin/coupons'); });

/* ================= روش ارسال / مراکز حضوری ================= */

router.get('/shipping', auth.requirePermission('shipping.manage'), (req, res) => {
  res.locals.pageTitle = 'روش‌های ارسال';
  res.render('admin/shipping', { methods: shipping.allMethods({ includeInactive: true }), pickups: all('SELECT * FROM pickup_centers ORDER BY id ASC'), sellers: all('SELECT id,shop_name FROM sellers WHERE deleted_at IS NULL') });
});
router.post('/shipping', auth.requirePermission('shipping.manage'), (req, res) => {
  const b = req.body;
  const data = { title: b.title, description: b.description || null, base_price: toInt(b.base_price), free_above: toInt(b.free_above), extra_weight_price: toInt(b.extra_weight_price), extra_weight_from: toInt(b.extra_weight_from), eta_days: toInt(b.eta_days, 3), cod_allowed: b.cod_allowed ? 1 : 0, seller_id: toInt(b.seller_id) || null, sort: toInt(b.sort), status: b.status || 'active' };
  if (b.id) shipping.edit(toInt(b.id), data); else shipping.create(data);
  auth.flash(req, 'success', 'روش ارسال ذخیره شد.');
  res.redirect('/admin/shipping');
});
router.post('/shipping/:id/delete', auth.requirePermission('shipping.manage'), (req, res) => { shipping.destroy(toInt(req.params.id)); res.redirect('/admin/shipping'); });
router.post('/pickups', auth.requirePermission('pickups.manage'), (req, res) => {
  const b = req.body;
  const data = { title: b.title, address: b.address, phone: b.phone, lat: b.lat ? toFloat(b.lat) : null, lng: b.lng ? toFloat(b.lng) : null, work_hours: b.work_hours, status: b.status || 'active' };
  if (b.id) update('pickup_centers', toInt(b.id), data); else insert('pickup_centers', data);
  auth.flash(req, 'success', 'مرکز دریافت حضوری ذخیره شد.');
  res.redirect('/admin/shipping');
});
router.post('/pickups/:id/delete', auth.requirePermission('pickups.manage'), (req, res) => { run('DELETE FROM pickup_centers WHERE id=@id', { id: toInt(req.params.id) }); res.redirect('/admin/shipping'); });

/* ================= سبد رها شده ================= */

router.get('/abandoned-carts', auth.requirePermission('orders.view'), (req, res) => {
  res.locals.pageTitle = 'سبدهای رها شده';
  res.render('admin/abandoned', { rows: cart.abandonedCarts(100) });
});
router.post('/abandoned-carts/notify', auth.requirePermission('notifications.send'), (req, res) => {
  const rows = cart.abandonedCarts(500).filter((r) => r.user_id && !r.notified_at);
  let n = 0;
  for (const r of rows) {
    notify.push(r.user_id, { ...notify.T.abandonedCart(), link: '/cart' });
    run('UPDATE carts SET notified_at=@t WHERE id=@id', { t: now(), id: r.id });
    n++;
  }
  auth.flash(req, 'success', `${toPersianDigits(n)} اعلان سبد رها شده ارسال شد.`);
  res.redirect('/admin/abandoned-carts');
});

module.exports = router;
module.exports.productPayload = productPayload;
module.exports.kv = kv;
module.exports.attrs = attrs;
