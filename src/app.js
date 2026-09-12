'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const config = require('./config');
const { db, migrate, setting, loadSettings, get, all, run, insert } = require('./db');
const auth = require('./core/auth');
const barcode = require('./core/barcode');
const acl = require('./core/acl');
const cache = require('./core/cache');
const catalog = require('./core/catalog');
const utils = require('./core/utils');
const jalali = require('./core/jalali');
const seo = require('./core/seo');
const media = require('./core/media');
const cart = require('./modules/cart');
const notify = require('./core/notify');
const activity = require('./core/activity');

function createApp() {
  migrate();
  acl.ensureSystemRoles();

  const app = express();
  app.set('trust proxy', config.trustProxy ? 1 : false);
  app.set('view engine', 'ejs');
  app.set('views', config.viewsDir);
  app.disable('x-powered-by');

  app.use(express.urlencoded({ extended: true, limit: '4mb' }));
  app.use(express.json({ limit: '4mb' }));
  app.use(cookieParser());
  app.use(session({
    name: config.sessionName,
    secret: config.secret,
    resave: false,
    saveUninitialized: true,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000, secure: false },
  }));

  app.use('/static', express.static(config.publicDir, { maxAge: '7d', index: false }));
  app.use('/uploads', express.static(path.join(config.publicDir, 'uploads'), { maxAge: '30d', index: false }));
  app.use('/img', express.static(path.join(config.publicDir, 'img'), { maxAge: '7d', index: false }));
  app.use('/css', express.static(path.join(config.publicDir, 'css'), { maxAge: '1d' }));
  app.use('/js', express.static(path.join(config.publicDir, 'js'), { maxAge: '1d' }));
  app.use('/fonts', express.static(path.join(config.publicDir, 'fonts'), { maxAge: '30d' }));

  // متغیرهای سراسری قالب
  app.use((req, res, next) => {
    const s = loadSettings();
    res.locals.site = {
      name: s.site_name || 'بالی‌وو',
      slogan: s.site_slogan || 'فروشگاه اینترنتی چند فروشنده',
      logo: s.site_logo || '/img/logo.svg',
      logoDark: s.site_logo_dark || s.site_logo || '/img/logo.svg',
      favicon: s.site_favicon || '/img/favicon.svg',
      phone: s.site_phone || '',
      email: s.site_email || '',
      address: s.site_address || '',
      description: s.site_description || '',
      multivendor: String(s.multivendor_enabled ?? '1') !== '0',
      currency: s.currency || 'تومان',
      installed: String(s.installed ?? '1') === '1',
    };
    res.locals.h = { ...utils, ...jalali, numberFormat: utils.numberFormat };
    res.locals.barcode = (text, opts) => barcode.svg(text, opts);
    res.locals.jalali = jalali;
    res.locals.utils = utils;
    res.locals.seo = seo;
    res.locals.setting = (k, d = null) => (s[k] === undefined || s[k] === '' ? d : s[k]);
    res.locals.allSettings = s;
    res.locals.acl = acl;
    res.locals.activity = activity;
    res.locals.year = new Date().getFullYear();
    res.locals.path = req.path;
    res.locals.fullUrl = req.originalUrl;
    res.locals.method = req.method;
    res.locals.csrf = null;
    res.locals.menu = buildMenu('header');
    res.locals.footerMenu = buildMenu('footer');
    res.locals.topCategories = catalog.categoryTree(null).slice(0, 12);
    res.locals.storyCount = get(`SELECT COUNT(*) AS c FROM stories WHERE status='active' AND (expires_at IS NULL OR expires_at > datetime('now'))`)?.c || 0;
    next();
  });

  // پشتیبانی امن از res.redirect('back') — فقط ارجاع‌های هم‌ریشه پذیرفته می‌شوند
  app.use((req, res, next) => {
    const original = res.redirect.bind(res);
    res.redirect = function (statusOrUrl, url) {
      let status = 302;
      let target = statusOrUrl;
      if (typeof statusOrUrl === 'number') { status = statusOrUrl; target = url; }
      if (target === 'back') {
        const ref = req.get('Referrer') || '';
        let safe = '/';
        if (ref) {
          try {
            const u = new URL(ref, `${req.protocol}://${req.get('host')}`);
            if (u.origin === `${req.protocol}://${req.get('host')}`) safe = u.pathname + u.search;
          } catch { safe = '/'; }
        }
        target = safe;
      }
      return original(status, target);
    };
    next();
  });

  app.use(auth.loadUser);

  // رهگیری بازدید صفحات
  app.use((req, res, next) => {
    if (!req.path.startsWith('/admin') && !req.path.startsWith('/seller') && !req.path.startsWith('/user') && req.method === 'GET' && !req.path.includes('.')) {
      try { insert('page_views', { path: req.path, user_id: req.user?.id || null, ip: req.ip, ua: req.headers['user-agent'], referer: req.headers.referer, created_at: utils.now() }); } catch { /* ignore */ }
    }
    next();
  });

  // لینک همکاری در فروش (?ref=CODE)
  app.use((req, res, next) => {
    if (req.query.ref) {
      const aff = get('SELECT id FROM users WHERE affiliate_code=@c AND is_affiliate=1', { c: String(req.query.ref).toUpperCase() });
      if (aff) req.session.affiliateId = aff.id;
    }
    next();
  });

  // نصب‌کننده
  app.use('/install', require('./modules/routes/installer'));

  app.use('/', require('./modules/routes/storefront'));
  app.use('/', require('./modules/routes/authroutes'));
  app.use('/user', require('./modules/routes/userpanel'));
  app.use('/seller', require('./modules/routes/sellerpanel'));
  app.use('/admin', require('./modules/routes/adminpanel'));
  app.use('/api', require('./modules/routes/api'));
  app.use('/payment', require('./modules/routes/paymentroutes'));

  // نقشه سایت و robots
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /user\nDisallow: /seller\nDisallow: /cart\nDisallow: /checkout\nSitemap: ${seo.siteUrl('/sitemap.xml')}\n`);
  });
  app.get('/sitemap.xml', (req, res) => {
    const urls = [{ loc: '/', priority: '1.0' }, { loc: '/products', priority: '0.9' }, { loc: '/blog', priority: '0.8' }, { loc: '/faq', priority: '0.5' }, { loc: '/brands', priority: '0.6' }];
    for (const p of all(`SELECT slug, updated_at FROM products WHERE deleted_at IS NULL AND status='active' LIMIT 4000`)) urls.push({ loc: '/product/' + p.slug, priority: '0.8', lastmod: p.updated_at });
    for (const c of all(`SELECT slug FROM categories WHERE deleted_at IS NULL AND status='active'`)) urls.push({ loc: '/products?cat=' + c.slug, priority: '0.7' });
    for (const b of all(`SELECT slug FROM brands WHERE deleted_at IS NULL AND status='active'`)) urls.push({ loc: '/brand/' + b.slug, priority: '0.6' });
    for (const p of all(`SELECT slug, updated_at FROM posts WHERE deleted_at IS NULL AND status='published'`)) urls.push({ loc: '/blog/' + p.slug, priority: '0.6', lastmod: p.updated_at });
    for (const p of all(`SELECT slug FROM pages WHERE deleted_at IS NULL AND status='published'`)) urls.push({ loc: '/page/' + p.slug, priority: '0.4' });
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((u) => `  <url><loc>${seo.siteUrl(u.loc)}</loc>${u.lastmod ? `<lastmod>${String(u.lastmod).slice(0, 10)}</lastmod>` : ''}<changefreq>daily</changefreq><priority>${u.priority}</priority></url>`).join('\n') +
      `\n</urlset>`
    );
  });

  // خطاها
  app.use((req, res) => {
    res.status(404).render('errors/404', { meta: seo.meta({ title: 'صفحه یافت نشد', noindex: true }) });
  });
  app.use((err, req, res, next) => {
    console.error('[error]', err);
    if (res.headersSent) return next(err);
    res.status(500).render('errors/500', { meta: seo.meta({ title: 'خطای سرور', noindex: true }), error: config.env === 'development' ? err : null });
  });

  return app;
}

function buildMenu(location) {
  const menu = get('SELECT * FROM menus WHERE location=@l', { l: location });
  if (!menu) return [];
  const items = all(`SELECT * FROM menu_items WHERE menu_id=@m AND status='active' ORDER BY sort ASC, id ASC`, { m: menu.id });
  const tree = [];
  const byParent = {};
  for (const it of items) { (byParent[it.parent_id || 0] = byParent[it.parent_id || 0] || []).push(it); }
  const walk = (pid) => (byParent[pid] || []).map((it) => ({ ...it, children: walk(it.id) }));
  return walk(0);
}

module.exports = { createApp, buildMenu };
