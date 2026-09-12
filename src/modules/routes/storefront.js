'use strict';
const express = require('express');
const router = express.Router();
const { all, get, insert, run, jparse, jstringify, setting, db } = require('../../db');
const catalog = require('../../core/catalog');
const seo = require('../../core/seo');
const cache = require('../../core/cache');
const cart = require('../cart');
const notify = require('../../core/notify');
const activity = require('../../core/activity');
const shipping = require('../../services/shipping');
const payment = require('../../services/payment');
const orders = require('../orders');
const { now, toInt, numberFormat, slugify, percentOff, paginate, truncate, stripTags } = require('../../core/utils');
const { formatJalali, formatJalaliLong, toPersianDigits, timeAgo } = require('../../core/jalali');
const auth = require('../../core/auth');

/* ================= صفحه نخست (صفحه‌ساز) ================= */

router.get('/', (req, res) => {
  const template = get(`SELECT * FROM templates WHERE route='home' AND is_active=1 AND status='published' ORDER BY id DESC LIMIT 1`)
    || get(`SELECT * FROM templates WHERE route='home' ORDER BY is_active DESC, id DESC LIMIT 1`);
  const sections = template ? jparse(template.sections, []) : defaultHomeSections();

  const data = {};
  for (const s of sections) {
    data[s.id] = sectionData(s);
  }

  const stories = all(`SELECT st.*, s.shop_name AS seller_name, s.logo AS seller_logo
                       FROM stories st LEFT JOIN sellers s ON s.id=st.owner_id
                       WHERE st.status='active' AND (st.expires_at IS NULL OR st.expires_at > datetime('now'))
                       ORDER BY st.sort ASC, st.id DESC LIMIT 30`);

  const meta = seo.meta({
    title: setting('home_seo_title') || null,
    fullTitle: setting('home_seo_title') ? null : `${siteName()} — ${setting('site_slogan', 'فروشگاه اینترنتی')}`,
    desc: setting('home_seo_desc') || setting('site_description'),
    path: '/',
    schema: [seo.schemaOrganization(), seo.schemaWebsite()],
  });

  res.render('storefront/home', { meta, sections, data, stories, template });
});

function siteName() { return setting('site_name', 'بالی‌وو'); }

function defaultHomeSections() {
  return [
    { id: 'slider', type: 'slider', title: 'اسلایدر اصلی' },
    { id: 'stories', type: 'stories', title: 'استوری‌ها' },
    { id: 'services', type: 'services', title: 'خدمات ما' },
    { id: 'categories', type: 'categories', title: 'دسته‌بندی‌ها' },
    { id: 'special', type: 'product_list', title: 'فروش ویژه', source: 'special', limit: 8 },
    { id: 'banner1', type: 'banner', position: 'home', title: 'بنر میانی' },
    { id: 'bestsellers', type: 'product_list', title: 'پرفروش‌ترین‌ها', source: 'bestseller', limit: 8 },
    { id: 'newest', type: 'product_list', title: 'جدیدترین محصولات', source: 'newest', limit: 12 },
    { id: 'brands', type: 'brands', title: 'برندهای محبوب' },
    { id: 'blog', type: 'blog', title: 'از مجله بالی‌وو', limit: 3 },
  ];
}

function sectionData(section) {
  switch (section.type) {
    case 'slider':
      return all(`SELECT * FROM banners WHERE position='home' AND status='active' AND (starts_at IS NULL OR starts_at<=datetime('now')) AND (ends_at IS NULL OR ends_at>=datetime('now')) ORDER BY sort ASC LIMIT 12`);
    case 'services':
      return jparse(setting('home_services', JSON.stringify([
        { icon: 'truck', title: 'ارسال سریع', text: 'تحویل اکسپرس در تهران و شهرستان‌ها' },
        { icon: 'shield', title: 'ضمانت اصالت کالا', text: 'تضمین اصل بودن تمامی محصولات' },
        { icon: 'rotate', title: '۷ روز بازگشت کالا', text: 'بازگشت بدون قید و شرط در هفته اول' },
        { icon: 'headset', title: 'پشتیبانی ۲۴/۷', text: 'پاسخگویی آنلاین در تمام ساعات' },
      ])), []);
    case 'categories':
      return catalog.categoryTree(null).slice(0, section.limit || 10).map((c) => ({
        ...c,
        image: c.image || `/img/category-icons/${slugify(c.name)}.svg`,
        count: get(`SELECT COUNT(*) AS c FROM products WHERE category_id=@id AND status='active' AND deleted_at IS NULL`, { id: c.id }).c,
      }));
    case 'product_list': {
      const params = { perPage: section.limit || 8, sort: 'newest' };
      if (section.source === 'special') { params.special = 1; params.sort = 'discounted'; }
      if (section.source === 'bestseller') params.sort = 'bestselling';
      if (section.source === 'popular') params.sort = 'popular';
      if (section.source === 'discounted') params.hasDiscount = 1;
      if (section.categoryId) params.categoryId = toInt(section.categoryId);
      if (section.brandId) params.brandId = toInt(section.brandId);
      if (section.source === 'manual' && section.productIds?.length) params.ids = section.productIds.map(toInt);
      return catalog.listProducts(params).rows;
    }
    case 'brands':
      return all(`SELECT * FROM brands WHERE status='active' AND deleted_at IS NULL ORDER BY sort ASC LIMIT @l`, { l: section.limit || 12 });
    case 'blog':
      return all(`SELECT p.*, pc.name AS cat_name, pc.slug AS cat_slug FROM posts p LEFT JOIN post_categories pc ON pc.id=p.category_id
                  WHERE p.status='published' AND p.deleted_at IS NULL ORDER BY p.id DESC LIMIT @l`, { l: section.limit || 3 });
    case 'banner':
      return all(`SELECT * FROM banners WHERE position=@p AND status='active' ORDER BY sort ASC LIMIT 6`, { p: section.position || 'home' });
    case 'stores':
      return all(`SELECT * FROM sellers WHERE status='active' AND deleted_at IS NULL ORDER BY products_count DESC LIMIT @l`, { l: section.limit || 6 });
    default:
      return [];
  }
}

/* ================= آرشیو محصولات ================= */

router.get('/products', (req, res) => {
  const params = { page: toInt(req.query.page, 1), perPage: toInt(req.query.per, 12), sort: req.query.sort || 'newest' };
  let category = null, brand = null;

  if (req.query.cat) {
    category = catalog.findCategory(req.query.cat);
    if (category) params.categoryIds = catalog.descendantIds(category.id);
  }
  if (req.query.brand) {
    brand = catalog.findBrand(req.query.brand);
    if (brand) params.brandId = brand.id;
  }
  if (req.query.search) { params.search = String(req.query.search); catalog.registerSearch(params.search); }
  if (req.query.min) params.minPrice = toInt(req.query.min);
  if (req.query.max) params.maxPrice = toInt(req.query.max);
  if (req.query.stock === '1') params.inStock = 1;
  if (req.query.off === '1') params.hasDiscount = 1;
  if (req.query.special === '1') params.special = 1;

  // فیلتر ویژگی‌ها: attr[12]=3,4
  const attributes = {};
  for (const [k, v] of Object.entries(req.query)) {
    const m = /^attr\[(\d+)\]$/.exec(k);
    if (m && v) attributes[m[1]] = String(v).split(',').filter(Boolean);
  }
  if (Object.keys(attributes).length) params.attributes = attributes;

  const result = catalog.listProducts(params);
  const filterGroups = all(`SELECT * FROM attribute_groups WHERE is_filter=1 AND (category_id=@c OR category_id IS NULL) ORDER BY sort ASC`, { c: category?.id || null })
    .map((g) => ({ ...g, options: jparse(g.options, []) }));

  const priceBounds = get(`SELECT MIN(price) AS min, MAX(price) AS max FROM products WHERE status='active' AND deleted_at IS NULL`) || { min: 0, max: 0 };
  const childCategories = category ? all(`SELECT * FROM categories WHERE parent_id=@p AND deleted_at IS NULL AND status='active' ORDER BY sort ASC`, { p: category.id }) : catalog.categoryTree(null);
  const brandsInResult = all(`SELECT DISTINCT b.* FROM brands b JOIN products p ON p.brand_id=b.id WHERE p.status='active' AND p.deleted_at IS NULL ORDER BY b.name LIMIT 30`);
  const pg = paginate(result.total, result.page, result.perPage);

  const title = category ? category.name : brand ? `برند ${brand.name}` : req.query.search ? `جستجوی «${req.query.search}»` : 'آرشیو محصولات';
  const meta = seo.meta({
    title, desc: category?.seo_desc || `خرید آنلاین ${title} با بهترین قیمت و ارسال سریع از ${siteName()}`,
    path: req.originalUrl,
    schema: seo.schemaBreadcrumb([{ name: 'صفحه نخست', url: '/' }, { name: title, url: req.path }]),
  });

  res.render('storefront/products', { meta, products: result.rows, pg, category, brand, filterGroups, priceBounds, childCategories, brandsInResult, attributes, title });
});

/* ================= صفحه محصول ================= */

router.get('/product/:slug', (req, res) => {
  const p = catalog.productDetail(req.params.slug);
  if (!p) return res.status(404).render('errors/404', { meta: seo.meta({ title: 'محصول یافت نشد', noindex: true }) });

  catalog.trackView(req, p.id);
  if (req.query.ref) { /* لینک افیلیت قبلاً در app.js ذخیره شد */ }

  const variants = p.variants;
  const defaultVariant = variants.find((v) => v.is_default) || variants[0] || null;
  const gallery = p.images.filter((i) => i.kind !== 'buyer');
  const buyerImages = p.buyer_images;
  const tiers = p.tiers;
  const installment = payment.installmentPlan(p.final_price || p.price, 4);
  const installmentGateways = payment.GATEWAYS.filter((g) => g.installment && payment.enabledGateways().some((e) => e.key === g.key));

  const meta = seo.meta({
    title: p.seo_title || p.title,
    desc: p.seo_desc || truncate(stripTags(p.short_desc || p.description || p.title), 160),
    path: '/product/' + p.slug,
    image: p.cover,
    ogType: 'product',
    keywords: p.keywords || [p.category_name, p.brand_name].filter(Boolean).join('، '),
    schema: [
      seo.schemaProduct(p, { variants, images: gallery.map((g) => g.media_path).slice(0, 5), reviews: p.reviews.slice(0, 3).map((r) => ({ author: r.author, body: truncate(r.body, 200), rating: r.rating, created_at: r.created_at })) }),
      seo.schemaBreadcrumb([
        { name: 'صفحه نخست', url: '/' },
        { name: 'محصولات', url: '/products' },
        ...p.breadcrumb.map((c) => ({ name: c.name, url: '/products?cat=' + c.slug })),
        { name: p.title, url: '/product/' + p.slug },
      ]),
    ],
  });

  res.render('storefront/product', {
    meta, p, variants, defaultVariant, gallery, buyerImages, tiers, installment, installmentGateways,
    isFavorite: req.user ? !!get('SELECT id FROM favorites WHERE user_id=@u AND product_id=@p', { u: req.user.id, p: p.id }) : false,
    inCompare: (req.user ? get('SELECT id FROM compare_items WHERE user_id=@u AND product_id=@p', { u: req.user.id, p: p.id }) : get('SELECT id FROM compare_items WHERE session_id=@s AND product_id=@p', { s: req.sessionID, p: p.id })) ? true : false,
    alerts: req.user ? all('SELECT * FROM product_alerts WHERE user_id=@u AND product_id=@p', { u: req.user.id, p: p.id }) : [],
    affiliateUser: req.user?.is_affiliate ? req.user : null,
  });
});

/* ================= برند / فروشگاه فروشنده ================= */

router.get('/brands', (req, res) => {
  const brands = catalog.brandList();
  res.render('storefront/brands', { meta: seo.meta({ title: 'برندها', path: '/brands' }), brands });
});

router.get('/brand/:slug', (req, res) => {
  const brand = catalog.findBrand(req.params.slug);
  if (!brand) return res.status(404).render('errors/404', { meta: seo.meta({ title: 'برند یافت نشد', noindex: true }) });
  const products = catalog.listProducts({ brandId: brand.id, perPage: 24, sort: req.query.sort || 'newest', page: toInt(req.query.page, 1) });
  const posts = all(`SELECT * FROM posts WHERE status='published' AND deleted_at IS NULL AND body LIKE @b ORDER BY id DESC LIMIT 3`, { b: `%${brand.name}%` });
  res.render('storefront/brand', {
    meta: seo.meta({ title: brand.seo_title || `خرید محصولات برند ${brand.name}`, desc: brand.seo_desc || brand.description, path: '/brand/' + brand.slug, image: brand.logo }),
    brand, products: products.rows, pg: paginate(products.total, products.page, products.perPage), posts,
  });
});

router.get('/store/:slug', (req, res) => {
  const seller = get(`SELECT * FROM sellers WHERE shop_slug=@s AND status='active' AND deleted_at IS NULL`, { s: req.params.slug });
  if (!seller) return res.status(404).render('errors/404', { meta: seo.meta({ title: 'فروشگاه یافت نشد', noindex: true }) });
  run('UPDATE sellers SET views = views + 1 WHERE id=@id', { id: seller.id });
  const products = catalog.listProducts({ sellerId: seller.id, perPage: 24, sort: req.query.sort || 'newest', page: toInt(req.query.page, 1) });
  const reviews = all(`SELECT r.*, u.name AS author, p.title AS product_title, p.slug AS product_slug
                       FROM reviews r JOIN products p ON p.id=r.product_id LEFT JOIN users u ON u.id=r.user_id
                       WHERE p.seller_id=@s AND r.status='approved' ORDER BY r.id DESC LIMIT 6`, { s: seller.id });
  res.render('storefront/store', {
    meta: seo.meta({ title: `فروشگاه ${seller.shop_name}`, desc: truncate(stripTags(seller.description || ''), 160), path: '/store/' + seller.shop_slug, image: seller.logo }),
    seller, products: products.rows, pg: paginate(products.total, products.page, products.perPage), reviews,
  });
});

/* ================= مجله ================= */

router.get('/blog', (req, res) => {
  const page = toInt(req.query.page, 1), perPage = 9;
  const where = ["p.status='published'", 'p.deleted_at IS NULL'];
  const values = {};
  if (req.query.cat) { const c = get('SELECT * FROM post_categories WHERE slug=@s', { s: req.query.cat }); if (c) { where.push('p.category_id=@c'); values.c = c.id; } values.catName = c?.name; }
  if (req.query.tag) { where.push('p.tags LIKE @t'); values.t = `%"${req.query.tag}"%`; values.tagName = req.query.tag; }
  if (req.query.search) { where.push('(p.title LIKE @q OR p.excerpt LIKE @q OR p.body LIKE @q)'); values.q = `%${req.query.search}%`; }
  const total = get(`SELECT COUNT(*) AS c FROM posts p WHERE ${where.join(' AND ')}`, values).c;
  const rows = all(`SELECT p.*, pc.name AS cat_name, pc.slug AS cat_slug, u.name AS author_name
                    FROM posts p LEFT JOIN post_categories pc ON pc.id=p.category_id LEFT JOIN users u ON u.id=p.author_id
                    WHERE ${where.join(' AND ')} ORDER BY p.id DESC LIMIT @l OFFSET @o`, { ...values, l: perPage, o: (page - 1) * perPage });
  const categories = all(`SELECT * FROM post_categories WHERE status='active' ORDER BY sort ASC`);
  const popular = all(`SELECT * FROM posts WHERE status='published' AND deleted_at IS NULL ORDER BY views DESC LIMIT 5`);
  const tags = all(`SELECT name, slug FROM tags ORDER BY id DESC LIMIT 20`);
  res.render('storefront/blog', {
    meta: seo.meta({ title: values.catName || values.tagName ? `مجله — ${values.catName || values.tagName}` : 'مجله', path: req.originalUrl }),
    posts: rows, pg: paginate(total, page, perPage), categories, popular, tags,
  });
});

router.get('/blog/:slug', (req, res) => {
  const post = get(`SELECT p.*, pc.name AS cat_name, pc.slug AS cat_slug, u.name AS author_name, s.shop_name AS seller_name
                    FROM posts p LEFT JOIN post_categories pc ON pc.id=p.category_id LEFT JOIN users u ON u.id=p.author_id LEFT JOIN sellers s ON s.id=p.seller_id
                    WHERE p.slug=@s AND p.deleted_at IS NULL`, { s: req.params.slug });
  if (!post) return res.status(404).render('errors/404', { meta: seo.meta({ title: 'مقاله یافت نشد', noindex: true }) });
  run('UPDATE posts SET views = views + 1 WHERE id=@id', { id: post.id });
  post.tags = jparse(post.tags, []);
  const mentioned = all(`SELECT pr.* FROM products pr JOIN post_products pp ON pp.product_id=pr.id WHERE pp.post_id=@id ORDER BY pp.sort ASC`, { id: post.id })
    .map(catalog.rowHydrate);
  const related = all(`SELECT * FROM posts WHERE category_id=@c AND id<>@id AND status='published' AND deleted_at IS NULL ORDER BY id DESC LIMIT 3`, { c: post.category_id, id: post.id });
  const comments = all(`SELECT c.*, u.name AS author FROM comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.post_id=@id AND c.status='approved' ORDER BY c.id ASC`, { id: post.id });
  res.render('storefront/post', {
    meta: seo.meta({ title: post.seo_title || post.title, desc: post.seo_desc || truncate(stripTags(post.excerpt || post.body), 160), path: '/blog/' + post.slug, image: post.cover, ogType: 'article', schema: seo.schemaArticle(post, post.author_name) }),
    post, mentioned, related, comments,
  });
});

router.post('/blog/:slug/comment', auth.requireLogin, (req, res) => {
  const post = get('SELECT id FROM posts WHERE slug=@s', { s: req.params.slug });
  if (!post) return res.redirect('/blog');
  insert('comments', { post_id: post.id, user_id: req.user.id, parent_id: toInt(req.body.parent_id) || null, body: String(req.body.body || '').slice(0, 2000), status: setting('comment_moderation', '1') === '1' ? 'pending' : 'approved', created_at: now() });
  auth.flash(req, 'success', 'دیدگاه شما ثبت شد و پس از تایید نمایش داده می‌شود.');
  res.redirect('/blog/' + req.params.slug + '#comments');
});

/* ================= صفحات / FAQ / فرم‌ساز ================= */

router.get('/page/:slug', (req, res) => {
  const page = get(`SELECT * FROM pages WHERE slug=@s AND deleted_at IS NULL`, { s: req.params.slug });
  if (!page) return res.status(404).render('errors/404', { meta: seo.meta({ title: 'صفحه یافت نشد', noindex: true }) });
  run('UPDATE pages SET views = views + 1 WHERE id=@id', { id: page.id });
  res.render('storefront/page', { meta: seo.meta({ title: page.seo_title || page.title, desc: page.seo_desc || truncate(stripTags(page.body), 160), path: '/page/' + page.slug }), page });
});

router.get('/faq', (req, res) => {
  const groups = {};
  for (const f of all(`SELECT * FROM faqs WHERE status='active' ORDER BY sort ASC, id ASC`)) {
    (groups[f.category || 'عمومی'] = groups[f.category || 'عمومی'] || []).push(f);
  }
  const flat = Object.values(groups).flat();
  res.render('storefront/faq', { meta: seo.meta({ title: 'پرسش‌های متداول', path: '/faq', schema: flat.length ? seo.schemaFaq(flat) : null }), groups });
});

router.get('/form/:slug', (req, res) => {
  const form = get(`SELECT * FROM forms WHERE slug=@s AND status='active'`, { s: req.params.slug });
  if (!form) return res.status(404).render('errors/404', { meta: seo.meta({ title: 'فرم یافت نشد', noindex: true }) });
  res.render('storefront/form', { meta: seo.meta({ title: form.title, path: '/form/' + form.slug }), form, fields: jparse(form.fields, []) });
});

router.post('/form/:slug', (req, res) => {
  const form = get(`SELECT * FROM forms WHERE slug=@s AND status='active'`, { s: req.params.slug });
  if (!form) return res.status(404).send('not found');
  const fields = jparse(form.fields, []);
  const data = {};
  for (const f of fields) data[f.name] = req.body[f.name] ?? '';
  insert('form_submissions', { form_id: form.id, user_id: req.user?.id || null, data: jstringify(data), ip: req.ip, created_at: now() });
  run('UPDATE forms SET id=id WHERE id=@id', { id: form.id });
  auth.flash(req, 'success', form.success_msg || 'پاسخ شما با موفقیت ثبت شد. سپاس!');
  res.redirect('/form/' + form.slug);
});

/* ================= جستجو ================= */

router.get('/search', (req, res) => res.redirect('/products?search=' + encodeURIComponent(req.query.q || '')));

/* ================= مقایسه ================= */

router.get('/compare', (req, res) => {
  const ids = req.user
    ? all('SELECT product_id FROM compare_items WHERE user_id=@u ORDER BY id ASC', { u: req.user.id }).map((r) => r.product_id)
    : all('SELECT product_id FROM compare_items WHERE session_id=@s AND user_id IS NULL ORDER BY id ASC', { s: req.sessionID }).map((r) => r.product_id);
  const products = ids.length ? all(`${catalog.baseSelect()} WHERE p.id IN (${ids.map((_, i) => '@i' + i).join(',')})`, Object.fromEntries(ids.map((id, i) => ['i' + i, id]))).map(catalog.rowHydrate) : [];
  const groups = all('SELECT * FROM attribute_groups WHERE is_spec=1 ORDER BY sort ASC');
  res.render('storefront/compare', { meta: seo.meta({ title: 'مقایسه محصولات', noindex: true }), products, groups });
});

router.post('/compare/add', (req, res) => {
  const pid = toInt(req.body.product_id);
  if (!pid) return res.json({ ok: false });
  if (req.user) {
    const count = get('SELECT COUNT(*) AS c FROM compare_items WHERE user_id=@u', { u: req.user.id }).c;
    if (count >= 4) return res.json({ ok: false, error: 'حداکثر ۴ محصول را می‌توانید مقایسه کنید' });
    run('INSERT OR IGNORE INTO compare_items(user_id,product_id,created_at) VALUES(@u,@p,@t)', { u: req.user.id, p: pid, t: now() });
  } else {
    const count = get('SELECT COUNT(*) AS c FROM compare_items WHERE session_id=@s', { s: req.sessionID }).c;
    if (count >= 4) return res.json({ ok: false, error: 'حداکثر ۴ محصول را می‌توانید مقایسه کنید' });
    run('INSERT OR IGNORE INTO compare_items(session_id,product_id,created_at) VALUES(@s,@p,@t)', { s: req.sessionID, p: pid, t: now() });
  }
  res.json({ ok: true, message: 'به لیست مقایسه اضافه شد' });
});

router.post('/compare/remove', (req, res) => {
  const pid = toInt(req.body.product_id);
  if (req.user) run('DELETE FROM compare_items WHERE user_id=@u AND product_id=@p', { u: req.user.id, p: pid });
  else run('DELETE FROM compare_items WHERE session_id=@s AND product_id=@p', { s: req.sessionID, p: pid });
  res.json({ ok: true });
});

/* ================= سبد خرید ================= */

router.get('/cart', (req, res) => {
  const totals = cart.compute(req);
  res.render('storefront/cart', { meta: seo.meta({ title: 'سبد خرید', noindex: true }), totals, methods: shipping.allMethods(), recommended: catalog.listProducts({ perPage: 4, sort: 'popular' }).rows });
});

router.post('/cart/add', (req, res) => {
  const result = cart.add(req, {
    productId: toInt(req.body.product_id), variantId: req.body.variant_id ? toInt(req.body.variant_id) : null,
    qty: toInt(req.body.qty, 1), optionIds: [].concat(req.body.option_ids || []).map(toInt).filter(Boolean),
  });
  if (req.xhr || req.headers.accept?.includes('json')) return res.json(result);
  auth.flash(req, result.ok ? 'success' : 'danger', result.message || result.error);
  res.redirect(result.ok ? '/cart' : req.get('referer') || '/');
});

router.post('/cart/update', (req, res) => {
  const result = cart.setQty(req, req.body.item_id, req.body.qty);
  if (req.xhr || req.headers.accept?.includes('json')) return res.json({ ...result, totals: cart.compute(req) });
  auth.flash(req, result.ok ? 'success' : 'danger', result.error || 'سبد بروزرسانی شد');
  res.redirect('/cart');
});

router.post('/cart/remove', (req, res) => {
  cart.removeItem(req, req.body.item_id);
  if (req.xhr || req.headers.accept?.includes('json')) return res.json({ ok: true, totals: cart.compute(req) });
  auth.flash(req, 'success', 'آیتم از سبد حذف شد');
  res.redirect('/cart');
});

router.post('/cart/coupon', (req, res) => {
  const result = cart.applyCoupon(req, req.body.code);
  if (req.xhr || req.headers.accept?.includes('json')) return res.json({ ...result, totals: cart.compute(req) });
  auth.flash(req, result.ok ? 'success' : 'danger', result.message || result.error);
  res.redirect('/cart');
});

router.post('/cart/coupon/remove', (req, res) => {
  cart.removeCoupon(req);
  auth.flash(req, 'success', 'کد تخفیف حذف شد');
  res.redirect('/cart');
});

/* استفاده از امتیاز باشگاه مشتریان در سبد */
router.post('/cart/points', auth.requireLogin, (req, res) => {
  const r = cart.usePoints(req, toInt(req.body.points));
  if (req.xhr || req.headers.accept?.includes('json')) return res.json({ ...r, totals: cart.compute(req) });
  if (!r.ok) auth.flash(req, 'danger', r.error);
  else if (!r.used) auth.flash(req, 'warning', 'حداکثر امتیاز قابل استفاده برای این سبد صفر است.');
  else auth.flash(req, 'success', `${toPersianDigits(r.used)} امتیاز اعمال شد — ${numberFormat(r.discount)} تومان تخفیف`);
  res.redirect('/cart');
});

/* استفاده از موجودی کیف پول در سبد */
router.post('/cart/wallet', auth.requireLogin, (req, res) => {
  const amount = req.body.use_wallet === 'on' ? toInt(req.body.amount, 0) || 999999999999 : 0;
  const r = cart.useWallet(req, amount);
  if (req.xhr || req.headers.accept?.includes('json')) return res.json({ ...r, totals: cart.compute(req) });
  auth.flash(req, r.ok ? 'success' : 'danger', r.ok ? (r.used ? `${numberFormat(r.used)} تومان از کیف پول کسر شد` : 'استفاده از کیف پول لغو شد') : r.error);
  res.redirect(req.get('referer') || '/cart');
});

/* عضویت در خبرنامه */
router.post('/newsletter', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
    auth.flash(req, 'danger', 'نشانی ایمیل معتبر نیست.');
    return res.redirect(req.get('referer') || '/');
  }
  const existing = get('SELECT id FROM newsletter_subscribers WHERE email=@e', { e: email });
  if (existing) {
    run(`UPDATE newsletter_subscribers SET status='active', updated_at=@t WHERE id=@id`, { t: now(), id: existing.id });
    auth.flash(req, 'info', 'این ایمیل پیش‌تر در خبرنامه ثبت شده است.');
  } else {
    insert('newsletter_subscribers', {
      email, name: req.body.name || null, user_id: req.user?.id || null,
      status: 'active', ip: req.ip, created_at: now(), updated_at: now(),
    });
    auth.flash(req, 'success', 'عضویت شما در خبرنامه با موفقیت ثبت شد.');
  }
  res.redirect(req.get('referer') || '/');
});

/* ================= فرایند خرید ================= */

router.get('/checkout', (req, res) => {
  const totals = cart.compute(req);
  if (!totals.availableItems.length) { auth.flash(req, 'warning', 'سبد خرید شما خالی است'); return res.redirect('/cart'); }
  if (!req.user) return res.redirect('/login?prev=' + encodeURIComponent('/checkout'));

  const addresses = all('SELECT * FROM addresses WHERE user_id=@u ORDER BY is_default DESC, id DESC', { u: req.user.id });
  const methods = shipping.allMethods();
  const pickups = shipping.allPickups();
  const gateways = payment.enabledGateways().filter((g) => g.type !== 'internal' || (req.user.wallet || 0) > 0);
  res.render('storefront/checkout', { meta: seo.meta({ title: 'تکمیل سفارش', noindex: true }), totals, addresses, methods, pickups, gateways, provinces: provincesList() });
});

router.post('/checkout/address', auth.requireLogin, (req, res) => {
  const id = toInt(req.body.address_id);
  const a = get('SELECT * FROM addresses WHERE id=@id AND user_id=@u', { id, u: req.user.id });
  if (a) { run('UPDATE carts SET address_id=@a WHERE id=@c', { a: id, c: cart.currentCart(req).id }); }
  res.json({ ok: !!a });
});

router.post('/checkout', auth.requireLogin, (req, res) => {
  const method = toInt(req.body.shipping_method_id);
  const result = orders.create(req, {
    addressId: toInt(req.body.address_id),
    shippingMethodId: method,
    paymentMethod: req.body.payment_method,
    pickupId: req.body.pickup_id ? toInt(req.body.pickup_id) : null,
    receiverName: req.body.receiver_name,
    receiverPhone: req.body.receiver_phone,
    note: req.body.customer_note,
  });
  if (!result.ok) { auth.flash(req, 'danger', result.error); return res.redirect('/checkout'); }

  const order = result.order;
  activity.logReq(req, 'checkout', { subjectType: 'order', subjectId: order.id, description: `تکمیل خرید ${order.code}` });

  const pm = req.body.payment_method;
  if (pm === 'wallet') {
    const r = payment.payWithWallet(req.user.id, order.total, order.id);
    if (r.ok) { orders.markPaid(order.id, { gateway: 'wallet', reference: 'WALLET', userId: req.user.id, method: 'wallet' }); return res.redirect('/user/orders/' + order.code + '?paid=1'); }
    auth.flash(req, 'danger', r.error); return res.redirect('/checkout');
  }
  if (pm === 'cod') {
    run(`UPDATE orders SET status='processing', payment_method='cod' WHERE id=@id`, { id: order.id });
    orders.logStatus(order.id, 'processing', 'پرداخت در محل — سفارش برای ارسال آماده شد', req.user.id);
    return res.redirect('/user/orders/' + order.code + '?cod=1');
  }
  if (pm === 'card2card') {
    run(`UPDATE orders SET payment_method='card2card' WHERE id=@id`, { id: order.id });
    return res.redirect('/user/orders/' + order.code + '?card=1');
  }
  // درگاه آنلاین
  const pay = payment.createPayment({
    amount: order.total, gatewayKey: pm, orderId: order.id, userId: req.user.id,
    description: `سفارش ${order.code} — ${siteName()}`, mobile: req.user.phone, email: req.user.email,
    meta: { type: 'order', order_code: order.code },
  });
  run(`UPDATE orders SET payment_method=@g, authority=@a WHERE id=@id`, { g: pm, a: pay.authority, id: order.id });
  res.redirect(pay.redirectUrl);
});

/* ================= علاقمندی / اعلان ================= */

router.post('/favorites/toggle', (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false, redirect: '/login' });
  const pid = toInt(req.body.product_id);
  const existing = get('SELECT id FROM favorites WHERE user_id=@u AND product_id=@p', { u: req.user.id, p: pid });
  if (existing) { run('DELETE FROM favorites WHERE id=@id', { id: existing.id }); return res.json({ ok: true, favorited: false }); }
  insert('favorites', { user_id: req.user.id, product_id: pid, created_at: now() });
  run('UPDATE products SET likes = likes + 1 WHERE id=@id', { id: pid });
  res.json({ ok: true, favorited: true });
});

router.post('/alerts', auth.requireLogin, (req, res) => {
  const pid = toInt(req.body.product_id);
  const kind = req.body.kind === 'on_sale' ? 'on_sale' : 'in_stock';
  run(`INSERT INTO product_alerts(user_id,product_id,kind,status,created_at) VALUES(@u,@p,@k,'active',@t)
       ON CONFLICT(user_id,product_id,kind) DO UPDATE SET status='active'`, { u: req.user.id, p: pid, k: kind, t: now() });
  res.json({ ok: true, message: 'اعلان برای شما فعال شد' });
});

/* ================= استوری ================= */

router.get('/stories/:id', (req, res) => {
  const story = get('SELECT * FROM stories WHERE id=@id', { id: toInt(req.params.id) });
  if (!story) return res.status(404).json({ error: 'not found' });
  run('UPDATE stories SET views = views + 1 WHERE id=@id', { id: story.id });
  insert('story_views', { story_id: story.id, user_id: req.user?.id || null, ip: req.ip, created_at: now() });
  res.json({ ok: true, story: { ...story, product_ids: jparse(story.product_ids, []) } });
});

router.post('/stories/:id/like', (req, res) => {
  run('UPDATE stories SET likes = likes + 1 WHERE id=@id', { id: toInt(req.params.id) });
  res.json({ ok: true });
});

/* ================= ابزارها ================= */

function provincesList() {
  let rows = all('SELECT * FROM provinces ORDER BY name');
  if (!rows.length) {
    const list = ['تهران', 'البرز', 'اصفهان', 'فارس', 'خراسان رضوی', 'آذربایجان شرقی', 'مازندران', 'گیلان', 'کرمان', 'خوزستان', 'قم', 'مرکزی', 'قزوین', 'زنجان', 'کردستان', 'همدان', 'لرستان', 'کرمانشاه', 'گلستان', 'اردبیل', 'یزد', 'هرمزگان', 'بوشهر', 'سیستان و بلوچستان', 'ایلام', 'چهارمحال و بختیاری', 'کهگیلویه و بویراحمد', 'سمنان', 'خراسان شمالی', 'خراسان جنوبی', 'آذربایجان غربی'];
    db.transaction(() => { for (const n of list) insert('provinces', { name: n, slug: slugify(n) }); })();
    rows = all('SELECT * FROM provinces ORDER BY name');
  }
  return rows;
}

router.get('/api/provinces', (req, res) => res.json(provincesList()));

module.exports = router;
module.exports.sectionData = sectionData;
module.exports.defaultHomeSections = defaultHomeSections;
