'use strict';
const { all, get, insert, update, run, db, jparse, setting } = require('../db');
const { now, slugify, percentOff, numberFormat, toInt, randomCode, hydrate } = require('./utils');
const cache = require('./cache');

/**
 * موتور کاتالوگ و قیمت‌گذاری
 * - محصول با بینهایت متغیر
 * - تخفیف معمولی / زمان‌دار / پلکانی
 * - ویژگی‌های اضافی اختیاری با قیمت
 * - کمیسیون فروشنده
 * - مالیات بر ارزش افزوده
 */

const JSON_FIELDS = ['specs', 'highlights', 'attributes', 'options'];

function baseSelect() {
  return `SELECT p.*, c.name AS category_name, c.slug AS category_slug, b.name AS brand_name, b.slug AS brand_slug, b.logo AS brand_logo,
                 s.shop_name AS seller_name, s.shop_slug AS seller_slug, s.logo AS seller_logo, s.is_main AS seller_is_main, s.score AS seller_score
          FROM products p
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN brands b ON b.id = p.brand_id
          LEFT JOIN sellers s ON s.id = p.seller_id`;
}

function rowHydrate(row) {
  if (!row) return row;
  row.specs = jparse(row.specs, []);
  row.highlights = jparse(row.highlights, []);
  row.attributes = jparse(row.attributes, {});
  row.cover = coverOf(row);
  row.discount_percent = activeDiscountPercent(row);
  row.final_price = effectivePrice(row);
  row.in_stock = (row.stock || 0) > 0;
  row.rating = row.rating_count ? Number((row.rating_sum / row.rating_count).toFixed(1)) : 0;
  row.recommend_percent = row.rating_count ? Math.round((row.recommend_count / row.rating_count) * 100) : 0;
  return row;
}

function coverOf(p) {
  const img = get('SELECT media_path FROM product_images WHERE product_id=@id ORDER BY (kind=\'cover\') DESC, sort ASC LIMIT 1', { id: p.id });
  return img?.media_path || p.image || '/img/placeholder-product.svg';
}

function imagesOf(productId) {
  return all('SELECT * FROM product_images WHERE product_id=@id ORDER BY sort ASC, id ASC', { id: productId });
}

function variantsOf(productId) {
  return all(`SELECT * FROM product_variants WHERE product_id=@id AND status='active' ORDER BY is_default DESC, id ASC`, { id: productId });
}

function optionsOf(productId) {
  return all('SELECT * FROM product_options WHERE product_id=@id ORDER BY sort ASC, id ASC', { id: productId });
}

function tierDiscountsOf(productId) {
  return all('SELECT * FROM tier_discounts WHERE product_id=@id ORDER BY min_qty ASC', { id: productId });
}

/** تخفیف زمان‌دار فعال است؟ */
function discountActive(p) {
  if (!p.discount_end && !p.discount_start) return !!p.old_price && p.old_price > p.price;
  const t = Date.now();
  const s = p.discount_start ? new Date(p.discount_start.replace(' ', 'T') + 'Z').getTime() : 0;
  const e = p.discount_end ? new Date(p.discount_end.replace(' ', 'T') + 'Z').getTime() : Infinity;
  return t >= s && t <= e;
}

function activeDiscountPercent(p) {
  const price = p.price || 0, old = p.old_price || 0;
  if (old > price && discountActive(p)) return percentOff(price, old);
  return 0;
}

/** قیمت مؤثر (با در نظر گرفتن بازه زمانی تخفیف) */
function effectivePrice(p) {
  if (p.old_price > p.price && !discountActive(p)) return p.old_price; // تخفیف تمام شده
  return p.price || 0;
}

/** قیمت هر واحد بر اساس تخفیف پلکانی */
function unitPriceForQty(p, qty = 1, variant = null) {
  const base = variant ? variant.price : effectivePrice(p);
  const tiers = tierDiscountsOf(p.id).filter((t) => !t.variant_id || t.variant_id === variant?.id);
  let chosen = null;
  for (const t of tiers) if (qty >= t.min_qty) chosen = t;
  if (!chosen) return { price: base, old_price: variant ? variant.old_price : p.old_price, tier: null, percent: base < (variant?.old_price || p.old_price || 0) ? percentOff(base, variant?.old_price || p.old_price) : activeDiscountPercent(p) };
  const price = chosen.price ? chosen.price : Math.round(base * (1 - (chosen.percent || 0) / 100));
  return { price, old_price: variant?.old_price || p.old_price || base, tier: chosen, percent: percentOff(price, variant?.old_price || p.old_price || base) };
}

/** جمع قیمت ویژگی‌های اضافی انتخاب‌شده */
function optionsTotal(productId, selectedIds = []) {
  if (!selectedIds.length) return { total: 0, items: [] };
  const items = [];
  let total = 0;
  for (const id of selectedIds) {
    const o = get('SELECT * FROM product_options WHERE id=@id AND product_id=@p', { id: toInt(id), p: productId });
    if (o) { items.push({ id: o.id, title: o.title, price: o.price }); total += o.price || 0; }
  }
  return { total, items };
}

/* ---------------- کوئری لیست محصولات ---------------- */

function buildListQuery(params = {}) {
  const where = ["p.deleted_at IS NULL", "p.status='active'"];
  const values = {};
  let i = 0;
  const p = (v) => { const k = 'v' + i++; values[k] = v; return '@' + k; };

  if (params.categoryId) { where.push('p.category_id = ' + p(params.categoryId)); }
  if (params.categoryIds?.length) { where.push(`p.category_id IN (${params.categoryIds.map(p).join(',')})`); }
  if (params.brandId) { where.push('p.brand_id = ' + p(params.brandId)); }
  if (params.sellerId) { where.push('p.seller_id = ' + p(params.sellerId)); }
  if (params.search) {
    const k = p('%' + params.search + '%');
    where.push(`(p.title LIKE ${k} OR p.title_en LIKE ${k} OR p.keywords LIKE ${k} OR p.short_desc LIKE ${k} OR p.sku LIKE ${k})`);
  }
  if (params.minPrice) where.push('p.price >= ' + p(params.minPrice));
  if (params.maxPrice) where.push('p.price <= ' + p(params.maxPrice));
  if (params.inStock) where.push('p.stock > 0');
  if (params.hasDiscount) where.push('p.old_price > p.price');
  if (params.special) where.push('p.is_special = 1');
  if (params.featured) where.push('p.is_featured = 1');
  if (params.bestSeller) where.push('p.is_best_seller = 1');
  if (params.status) { where.length = 0; where.push('p.deleted_at IS NULL'); where.push('p.status = ' + p(params.status)); }
  if (params.includeTrashed) { where.push('p.deleted_at IS NOT NULL'); }
  if (params.trashedOnly) { where.push('p.deleted_at IS NOT NULL'); }
  if (params.ids?.length) where.push(`p.id IN (${params.ids.map(p).join(',')})`);

  // فیلتر ویژگی‌ها: {"12":["3","4"]}
  if (params.attributes) {
    for (const [gid, opts] of Object.entries(params.attributes)) {
      if (!opts?.length) continue;
      const k = p(`%"${gid}":%`);
      const ors = opts.map((o) => `p.attributes LIKE ${p(`%"${o}"%`)}`).join(' OR ');
      where.push(`(p.attributes LIKE ${k} AND (${ors}))`);
    }
  }

  const orderBy = {
    newest: 'p.id DESC',
    oldest: 'p.id ASC',
    cheapest: 'p.price ASC',
    dearest: 'p.price DESC',
    bestselling: 'p.sold DESC, p.id DESC',
    popular: 'p.views DESC, p.id DESC',
    rated: '(CASE WHEN p.rating_count>0 THEN p.rating_sum*1.0/p.rating_count ELSE 0 END) DESC',
    discounted: '(p.old_price - p.price) DESC',
  }[params.sort] || 'p.id DESC';

  return { where: where.join(' AND '), values, orderBy };
}

function listProducts(params = {}) {
  const perPage = Math.min(60, Math.max(4, toInt(params.perPage, 12)));
  const page = Math.max(1, toInt(params.page, 1));
  const { where, values, orderBy } = buildListQuery(params);

  const cacheKey = 'products:' + JSON.stringify({ ...params, page, perPage });
  return cache.remember(cacheKey, 30, () => {
    const total = get(`SELECT COUNT(*) AS c FROM products p WHERE ${where}`, values).c;
    const rows = all(`${baseSelect()} WHERE ${where} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`, { ...values, limit: perPage, offset: (page - 1) * perPage });
    return { rows: rows.map(rowHydrate), total, page, perPage };
  }, 'catalog');
}

function findProduct(idOrSlug, { withTrashed = false } = {}) {
  const key = String(idOrSlug);
  const sql = `${baseSelect()} WHERE (p.id=@k OR p.slug=@k) ${withTrashed ? '' : 'AND p.deleted_at IS NULL'} LIMIT 1`;
  const row = get(sql, { k: /^\d+$/.test(key) ? toInt(key) : key });
  return row ? rowHydrate(row) : null;
}

/** جزئیات کامل برای صفحه محصول */
function productDetail(idOrSlug) {
  const p = findProduct(idOrSlug);
  if (!p) return null;
  p.images = imagesOf(p.id);
  p.variants = variantsOf(p.id).map((v) => ({ ...v, options: jparse(v.options, {}) }));
  p.extra_options = optionsOf(p.id);
  p.tiers = tierDiscountsOf(p.id);
  p.price_history = all('SELECT * FROM price_history WHERE product_id=@id ORDER BY id DESC LIMIT 60', { id: p.id }).reverse();
  p.seller = p.seller_id ? get('SELECT * FROM sellers WHERE id=@id', { id: p.seller_id }) : mainSeller();
  p.reviews = all(`SELECT r.*, u.name AS author, u.avatar FROM reviews r LEFT JOIN users u ON u.id=r.user_id WHERE r.product_id=@id AND r.status='approved' ORDER BY r.id DESC LIMIT 10`, { id: p.id }).map((r) => ({ ...r, pros: jparse(r.pros, []), cons: jparse(r.cons, []) }));
  p.questions = all(`SELECT q.*, u.name AS author FROM questions q LEFT JOIN users u ON u.id=q.user_id WHERE q.product_id=@id AND q.status='approved' ORDER BY q.id DESC LIMIT 10`, { id: p.id })
    .map((q) => ({ ...q, answers: all('SELECT a.*, u.name AS author FROM answers a LEFT JOIN users u ON u.id=a.user_id WHERE a.question_id=@q ORDER BY a.id ASC', { q: q.id }) }));
  p.related = listProducts({ categoryId: p.category_id, perPage: 8, sort: 'popular' }).rows.filter((r) => r.id !== p.id).slice(0, 6);
  p.attribute_groups = attributeGroupsFor(p.category_id, p.attributes);
  p.breadcrumb = categoryPath(p.category_id);
  p.buyer_images = all(`SELECT pi.*, u.name FROM product_images pi LEFT JOIN users u ON u.id=pi.user_id WHERE pi.product_id=@id AND pi.kind='buyer' ORDER BY pi.id DESC`, { id: p.id });
  p.seller_products = p.seller_id ? listProducts({ sellerId: p.seller_id, perPage: 5, sort: 'popular' }).rows.filter((r) => r.id !== p.id) : [];
  return p;
}

function attributeGroupsFor(categoryId, attributes = {}) {
  const groups = all('SELECT * FROM attribute_groups WHERE (category_id=@c OR category_id IS NULL) ORDER BY sort ASC', { c: categoryId });
  return groups.map((g) => {
    const opts = jparse(g.options, []);
    const selected = (attributes[g.id] || []).map(String);
    return { ...g, options: opts, selected, selected_titles: opts.filter((o) => selected.includes(String(o.id))).map((o) => o.title) };
  }).filter((g) => g.selected_titles.length || g.is_spec);
}

function mainSeller() { return get('SELECT * FROM sellers WHERE is_main=1 LIMIT 1'); }

/* ---------------- دسته‌بندی ---------------- */

function categoryTree(parentId = null) {
  const rows = all(`SELECT * FROM categories WHERE parent_id ${parentId ? '= @p' : 'IS NULL'} AND deleted_at IS NULL AND status='active' ORDER BY sort ASC, id ASC`, { p: parentId });
  return rows.map((c) => ({ ...c, children: categoryTree(c.id) }));
}
function findCategory(idOrSlug) { return get('SELECT * FROM categories WHERE (id=@k OR slug=@k) AND deleted_at IS NULL', { k: /^\d+$/.test(String(idOrSlug)) ? toInt(idOrSlug) : idOrSlug }); }
function categoryPath(categoryId) {
  const path = [];
  let cur = categoryId ? get('SELECT * FROM categories WHERE id=@id', { id: categoryId }) : null;
  while (cur) { path.unshift({ id: cur.id, name: cur.name, slug: cur.slug }); cur = cur.parent_id ? get('SELECT * FROM categories WHERE id=@id', { id: cur.parent_id }) : null; }
  return path;
}
function descendantIds(categoryId) {
  const ids = [categoryId];
  const walk = (pid) => {
    const kids = all('SELECT id FROM categories WHERE parent_id=@p AND deleted_at IS NULL', { p: pid });
    for (const k of kids) { ids.push(k.id); walk(k.id); }
  };
  walk(categoryId);
  return ids;
}

/* ---------------- برند ---------------- */

function brandList() { return all(`SELECT * FROM brands WHERE deleted_at IS NULL AND status='active' ORDER BY sort ASC, name ASC`); }
function findBrand(idOrSlug) { return get('SELECT * FROM brands WHERE (id=@k OR slug=@k) AND deleted_at IS NULL', { k: /^\d+$/.test(String(idOrSlug)) ? toInt(idOrSlug) : idOrSlug }); }

/* ---------------- CRUD محصولات ---------------- */

function createProduct(data, { userId = null } = {}) {
  const slug = uniqueSlug('products', data.slug || slugify(data.title), 'title', data.title);
  const id = insert('products', {
    ...data,
    slug,
    product_code: data.product_code || 'p-' + Math.floor(1000000 + Math.random() * 8999999),
    created_at: now(), updated_at: now(), published_at: data.status === 'active' ? now() : null,
    created_by: userId,
  });
  recordPriceHistory(id, null, data.price, data.old_price);
  cache.flushGroup('catalog');
  return id;
}

function updateProduct(id, data) {
  const before = get('SELECT price, old_price FROM products WHERE id=@id', { id });
  if (data.slug) data.slug = uniqueSlug('products', slugify(data.slug), 'id', id, true);
  update('products', id, { ...data, updated_at: now() });
  const after = get('SELECT price, old_price FROM products WHERE id=@id', { id });
  if (after && before && (after.price !== before.price || after.old_price !== before.old_price)) {
    recordPriceHistory(id, null, after.price, after.old_price);
    notifyPriceChange(id, after);
  }
  syncProductAggregates(id);
  cache.flushGroup('catalog');
  return id;
}

function recordPriceHistory(productId, variantId, price, oldPrice) {
  insert('price_history', { product_id: productId, variant_id: variantId, price: price || 0, old_price: oldPrice || 0, created_at: now() });
}

function notifyPriceChange(productId, after) {
  try {
    const notify = require('./notify');
    const p = get('SELECT title FROM products WHERE id=@id', { id: productId });
    if (!p) return;
    const onSale = all(`SELECT user_id FROM product_alerts WHERE product_id=@id AND kind='on_sale' AND status='active'`, { id: productId });
    for (const r of onSale) {
      notify.push(r.user_id, { ...notify.T.onSale(p.title), link: '/product/' + productId });
      run(`UPDATE product_alerts SET status='fired' WHERE product_id=@id AND kind='on_sale' AND user_id=@u`, { id: productId, u: r.user_id });
    }
  } catch { /* ignore */ }
}

/** همگام‌سازی کمینه قیمت/موجودی محصول از روی متغیرها */
function syncProductAggregates(productId) {
  const v = get('SELECT MIN(price) AS minPrice, SUM(stock) AS totalStock, COUNT(*) AS c FROM product_variants WHERE product_id=@id', { id: productId });
  if (v && v.c > 0) {
    run('UPDATE products SET price=@p, stock=@s WHERE id=@id AND price <> @p OR (id=@id AND stock <> @s)', { p: v.minPrice, s: v.totalStock || 0, id: productId });
    run('UPDATE products SET stock=@s WHERE id=@id', { s: v.totalStock || 0, id: productId });
  }
  const cat = get('SELECT category_id FROM products WHERE id=@id', { id: productId });
  if (cat?.category_id) run('UPDATE categories SET products_count=(SELECT COUNT(*) FROM products WHERE category_id=@c AND deleted_at IS NULL AND status=\'active\') WHERE id=@c', { c: cat.category_id });
  const br = get('SELECT brand_id FROM products WHERE id=@id', { id: productId });
  if (br?.brand_id) run('UPDATE brands SET products_count=(SELECT COUNT(*) FROM products WHERE brand_id=@b AND deleted_at IS NULL AND status=\'active\') WHERE id=@b', { b: br.brand_id });
}

function softDelete(table, id) { cache.flushGroup('catalog'); return run(`UPDATE ${table} SET deleted_at=@t WHERE id=@id`, { t: now(), id }).changes; }
function restore(table, id) { cache.flushGroup('catalog'); return run(`UPDATE ${table} SET deleted_at=NULL WHERE id=@id`, { id }).changes; }
function hardDelete(table, id) { cache.flushGroup('catalog'); return run(`DELETE FROM ${table} WHERE id=@id`, { id }).changes; }

function uniqueSlug(table, baseSlug, ignoreField = 'id', ignoreValue = null, isEdit = false) {
  let slug = slugify(baseSlug);
  let candidate = slug;
  let n = 1;
  while (true) {
    const row = isEdit
      ? get(`SELECT id FROM ${table} WHERE slug=@s AND ${ignoreField} <> @i`, { s: candidate, i: ignoreValue })
      : get(`SELECT id FROM ${table} WHERE slug=@s`, { s: candidate });
    if (!row) return candidate;
    candidate = `${slug}-${++n}`;
  }
}

/* ---------------- آمار و جستجو ---------------- */

function registerSearch(term) {
  const t = String(term || '').trim();
  if (!t) return;
  run(`INSERT INTO search_terms(term,count,last_at) VALUES(@t,1,@n) ON CONFLICT(term) DO UPDATE SET count=count+1, last_at=@n`, { t, n: now() });
}
function topSearches(limit = 8) { return all('SELECT * FROM search_terms ORDER BY count DESC, last_at DESC LIMIT @l', { l: limit }); }

function incView(productId, ip) {
  run('UPDATE products SET views = views + 1 WHERE id=@id', { id: productId });
}

function trackView(req, productId) {
  const userId = req.user?.id || null;
  const sid = req.sessionID;
  run('DELETE FROM recently_viewed WHERE product_id=@p AND (user_id IS @u OR (user_id IS NULL AND session_id=@s))', { p: productId, u: userId, s: sid });
  insert('recently_viewed', { user_id: userId, session_id: sid, product_id: productId, viewed_at: now() });
  incView(productId, req.ip);
  insert('page_views', { path: '/product/' + productId, user_id: userId, ip: req.ip, ua: req.headers['user-agent'], referer: req.headers.referer, created_at: now() });
}

function recentlyViewed(req, limit = 8) {
  const userId = req.user?.id || null;
  const sid = req.sessionID;
  const rows = userId
    ? all(`${baseSelect()} WHERE p.id IN (SELECT product_id FROM recently_viewed WHERE user_id=@u ORDER BY viewed_at DESC LIMIT @l) AND p.deleted_at IS NULL`, { u: userId, l: limit })
    : all(`${baseSelect()} WHERE p.id IN (SELECT product_id FROM recently_viewed WHERE session_id=@s AND user_id IS NULL ORDER BY viewed_at DESC LIMIT @l) AND p.deleted_at IS NULL`, { s: sid, l: limit });
  return rows.map(rowHydrate);
}

/* ---------------- مالیات / کمیسیون ---------------- */

function vatRate() { return parseFloat(setting('vat_percent', '0')) || 0; }
function applyVat(amount) { const r = vatRate(); return r ? Math.round((amount * r) / 100) : 0; }

/** نرخ ارز مبنا برای بروزرسانی یکجای قیمت‌ها */
function repriceByCurrency(newRate) {
  const rows = all('SELECT id, price, old_price, base_currency_rate FROM products WHERE deleted_at IS NULL');
  let n = 0;
  for (const r of rows) {
    const factor = (newRate / (r.base_currency_rate || 1));
    const price = Math.round(r.price * factor / 1000) * 1000; // گرد به هزار تومان
    const oldPrice = r.old_price ? Math.round(r.old_price * factor / 1000) * 1000 : 0;
    run('UPDATE products SET price=@p, old_price=@o, base_currency_rate=@r, updated_at=@t WHERE id=@id', { p: price, o: oldPrice, r: newRate, t: now(), id: r.id });
    recordPriceHistory(r.id, null, price, oldPrice);
    n++;
  }
  run('UPDATE product_variants SET price = ROUND(price * @f / 1000) * 1000, old_price = ROUND(old_price * @f / 1000) * 1000', { f: newRate / 1 });
  cache.flushGroup('catalog');
  return n;
}

module.exports = {
  baseSelect, rowHydrate, coverOf, imagesOf, variantsOf, optionsOf, tierDiscountsOf,
  discountActive, activeDiscountPercent, effectivePrice, unitPriceForQty, optionsTotal,
  buildListQuery, listProducts, findProduct, productDetail, attributeGroupsFor, mainSeller,
  categoryTree, findCategory, categoryPath, descendantIds, brandList, findBrand,
  createProduct, updateProduct, syncProductAggregates, softDelete, restore, hardDelete, uniqueSlug,
  registerSearch, topSearches, trackView, recentlyViewed, vatRate, applyVat, repriceByCurrency, recordPriceHistory,
};
