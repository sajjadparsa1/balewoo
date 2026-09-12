'use strict';
/**
 * آزمون دود (Smoke test) — تمام مسیرهای GET را با نشست‌های مختلف پیمایش می‌کند
 * و خطاهای ۵۰۰ / خطاهای قالب EJS را گزارش می‌دهد.
 *
 * اجرا:  npm test            (سرور باید روی پورت ۳۰۰۰ در حال اجرا باشد)
 *       BASE=http://... npm test
 */
const fs = require('fs');
const path = require('path');
const { get, all } = require('../src/db');
const config = require('../src/config');

const BASE = (process.env.BASE || `http://127.0.0.1:${process.env.PORT || config.port || 3000}`).replace(/\/$/, '');
const ROOT = path.join(__dirname, '..');

/* ---------- فهرست فایل‌های مسیر و پیشوند سوار شدن ---------- */
const ROUTE_FILES = [
  ['src/modules/routes/storefront.js', ''],
  ['src/modules/routes/authroutes.js', ''],
  ['src/modules/routes/paymentroutes.js', '/payment'],
  ['src/modules/routes/api.js', '/api'],
  ['src/modules/routes/installer.js', '/install'],
  ['src/modules/routes/userpanel.js', '/user'],
  ['src/modules/routes/sellerpanel.js', '/seller'],
  ['src/modules/routes/adminpanel.js', '/admin'],
  ['src/modules/routes/admin/people.js', '/admin/people'],
  ['src/modules/routes/admin/settings.js', '/admin/settings'],
  ['src/modules/routes/admin/content.js', '/admin/content'],
  ['src/modules/routes/admin/system.js', '/admin/system'],
];

/* ---------- استخراج مسیرهای GET ---------- */
function collectRoutes() {
  const routes = [];
  for (const [file, prefix] of ROUTE_FILES) {
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, 'utf8');
    const re = /router\.get\(\s*[`'"]([^`'"]+)[`'"]/g;
    let m;
    while ((m = re.exec(src))) {
      let p = m[1];
      if (p === '/') p = '';
      routes.push({ file, method: 'GET', path: (prefix + p) || '/' });
    }
  }
  // حذف تکراری‌ها
  const seen = new Set();
  return routes.filter((r) => {
    const k = r.path;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ---------- نمونه‌های واقعی برای پر کردن پارامترهای مسیر ---------- */
const one = (sql, params) => { try { const r = get(sql, params); return r ? Object.values(r)[0] : null; } catch { return null; } };

function samples() {
  const custPhone = '09122000001';
  const sellerPhone = '09121000001';
  const s = {};
  // عمومی
  s.productSlug = one(`SELECT slug FROM products WHERE status='active' AND deleted_at IS NULL ORDER BY views DESC LIMIT 1`);
  s.categorySlug = one(`SELECT slug FROM categories WHERE status='active' AND parent_id IS NULL ORDER BY sort LIMIT 1`);
  s.postSlug = one(`SELECT slug FROM posts WHERE status='published' ORDER BY id DESC LIMIT 1`);
  s.pageSlug = one(`SELECT slug FROM pages WHERE status='published' ORDER BY id LIMIT 1`);
  s.brandSlug = one(`SELECT slug FROM brands ORDER BY id LIMIT 1`);
  s.formSlug = one(`SELECT slug FROM forms WHERE status='active' ORDER BY id LIMIT 1`);
  s.sellerSlug = one(`SELECT shop_slug FROM sellers WHERE status='active' ORDER BY is_main DESC, id LIMIT 1`);
  s.storyId = one(`SELECT id FROM stories WHERE status='active' ORDER BY id DESC LIMIT 1`);
  s.orderCode = one(`SELECT code FROM orders ORDER BY id DESC LIMIT 1`);
  s.productId = one(`SELECT id FROM products ORDER BY id DESC LIMIT 1`);
  s.categoryId = one(`SELECT id FROM categories ORDER BY id DESC LIMIT 1`);
  s.mediaName = one(`SELECT name FROM media ORDER BY id DESC LIMIT 1`);
  s.token = 'smoke-test-token';

  // مشتری نمونه
  const custId = one(`SELECT id FROM users WHERE phone=@p`, { p: custPhone });
  s.custOrderCode = one(`SELECT code FROM orders WHERE user_id=@u ORDER BY id DESC LIMIT 1`, { u: custId }) || s.orderCode;
  s.custTicketCode = one(`SELECT code FROM tickets WHERE owner_type='user' AND owner_id=@u ORDER BY id DESC LIMIT 1`, { u: custId });
  s.custPreinvoiceCode = one(`SELECT code FROM preinvoices WHERE user_id=@u ORDER BY id DESC LIMIT 1`, { u: custId });
  s.custOrderItem = one(`SELECT id FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id=@u) ORDER BY id DESC LIMIT 1`, { u: custId });

  // فروشنده نمونه
  const sellerUserId = one(`SELECT id FROM users WHERE phone=@p`, { p: sellerPhone });
  const sellerId = one(`SELECT id FROM sellers WHERE user_id=@u LIMIT 1`, { u: sellerUserId })
    || one(`SELECT id FROM sellers WHERE is_main=1 LIMIT 1`);
  s.sellerProductId = one(`SELECT id FROM products WHERE seller_id=@s ORDER BY id DESC LIMIT 1`, { s: sellerId });
  s.sellerOrderCode = one(`SELECT o.code FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE oi.seller_id=@s ORDER BY o.id DESC LIMIT 1`, { s: sellerId });
  s.sellerTicketCode = one(`SELECT code FROM tickets WHERE owner_type='seller' AND owner_id=@s ORDER BY id DESC LIMIT 1`, { s: sellerId });
  s.sellerWithdrawId = one(`SELECT id FROM withdrawals WHERE owner_type='seller' AND owner_id=@s ORDER BY id DESC LIMIT 1`, { s: sellerId });

  // مدیر
  s.userId = one(`SELECT id FROM users WHERE role='customer' ORDER BY id DESC LIMIT 1`);
  s.sellerId = sellerId;
  s.ticketCode = one(`SELECT code FROM tickets ORDER BY id DESC LIMIT 1`);
  s.sessionId = one(`SELECT id FROM user_sessions ORDER BY id DESC LIMIT 1`);
  s.postId = one(`SELECT id FROM posts ORDER BY id DESC LIMIT 1`);
  s.pageId = one(`SELECT id FROM pages ORDER BY id DESC LIMIT 1`);
  s.bannerId = one(`SELECT id FROM banners ORDER BY id DESC LIMIT 1`);
  s.menuId = one(`SELECT id FROM menus ORDER BY id DESC LIMIT 1`);
  s.formId = one(`SELECT id FROM forms ORDER BY id DESC LIMIT 1`);
  s.submissionId = one(`SELECT id FROM form_submissions ORDER BY id DESC LIMIT 1`);
  s.faqId = one(`SELECT id FROM faqs ORDER BY id DESC LIMIT 1`);
  s.transactionId = one(`SELECT id FROM transactions ORDER BY id DESC LIMIT 1`);
  s.notificationId = one(`SELECT id FROM notifications ORDER BY id DESC LIMIT 1`);
  s.templateId = one(`SELECT id FROM templates ORDER BY id DESC LIMIT 1`);
  s.withdrawId = one(`SELECT id FROM withdrawals ORDER BY id DESC LIMIT 1`);
  s.settlementId = one(`SELECT id FROM settlements ORDER BY id DESC LIMIT 1`);
  s.couponId = one(`SELECT id FROM coupons ORDER BY id DESC LIMIT 1`);
  s.shippingId = one(`SELECT id FROM shipping_methods ORDER BY id DESC LIMIT 1`);
  s.warehouseId = one(`SELECT id FROM warehouses ORDER BY id DESC LIMIT 1`);
  s.reviewId = one(`SELECT id FROM reviews ORDER BY id DESC LIMIT 1`);
  s.questionId = one(`SELECT id FROM questions ORDER BY id DESC LIMIT 1`);
  s.preinvoiceCode = one(`SELECT code FROM preinvoices ORDER BY id DESC LIMIT 1`);
  s.roleId = one(`SELECT id FROM roles ORDER BY id DESC LIMIT 1`);
  s.id = s.productId || 1;
  s.slug = s.productSlug || 'sample';
  s.code = s.orderCode || 'BW-1000';
  return s;
}

/**
 * جای‌گذاری پارامترها بر اساس «پیشوند مسیر» (نه فقط بخش قبلی) تا نمونه
 * مربوط به همان موجودیت و همان نقش انتخاب شود.
 */
function fillPath(p, s) {
  const parts = p.split('/').filter((x) => x !== '');
  const head = parts[0] || '';
  const area = parts.length > 1 ? parts[1] : '';
  let unresolved = null;

  const pick = (name, idx) => {
    // ۱) نمونه اختصاصی نقش — بر اساس پیشوند مسیر (طولانی‌ترین تطبیق)
    const AREA_SAMPLES = {
      '/user/orders': s.custOrderCode,
      '/user/tickets': s.custTicketCode,
      '/user/preinvoices': s.custPreinvoiceCode,
      '/user/order-items': s.custOrderItem,
      '/seller/products': s.sellerProductId,
      '/seller/orders': s.sellerOrderCode,
      '/seller/tickets': s.sellerTicketCode,
      '/seller/withdrawals': s.sellerWithdrawId,
      '/admin/system/tickets': s.ticketCode,
      '/admin/system/backup/download': s.mediaName,
      '/admin/system/sessions': s.sessionId,
      '/admin/people/users': s.userId,
      '/admin/people/sellers': s.sellerId,
      '/admin/content/posts': s.postId,
      '/admin/content/pages': s.pageId,
      '/admin/content/forms': s.formId,
      '/admin/content/templates': s.templateId,
      '/admin/content/faqs': s.faqId,
      '/admin/content/banners': s.bannerId,
      '/admin/content/menus': s.menuId,
      '/admin/finance/withdrawals': s.withdrawId,
      '/admin/finance/settlements': s.settlementId,
      '/admin/finance/transactions': s.transactionId,
      '/admin/coupons': s.couponId,
      '/admin/products': s.productId,
      '/admin/categories': s.categoryId,
      '/admin/inventory/warehouses': s.warehouseId,
    };
    const concrete = '/' + parts.slice(0, idx).join('/');
    const prefixKeys = Object.keys(AREA_SAMPLES).filter((k) => concrete === k || concrete.startsWith(k + '/')).sort((a, b) => b.length - a.length);
    if (prefixKeys.length && AREA_SAMPLES[prefixKeys[0]] != null) return AREA_SAMPLES[prefixKeys[0]];
    // ۲) بر اساس نام پارامتر
    const byName = {
      slug: { brand: s.brandSlug, brands: s.brandSlug, blog: s.postSlug, post: s.postSlug, posts: s.postSlug,
        page: s.pageSlug, pages: s.pageSlug, form: s.formSlug, forms: s.formSlug, store: s.sellerSlug,
        seller: s.sellerSlug, sellers: s.sellerSlug, category: s.categorySlug, categories: s.categorySlug,
        product: s.productSlug, products: s.productSlug }[parts[idx - 1]] || s[name],
      code: s.orderCode,
      ticket: s.ticketCode,
      token: s.token,
      name: s.mediaName,
    }[name];
    if (byName != null) return byName;
    // ۳) بر اساس بخش قبلی مسیر
    const prev = parts[idx - 1] || '';
    const byPrev = {
      products: s.productId, product: s.productId, orders: s.orderCode, order: s.orderCode,
      users: s.userId, user: s.userId, sellers: s.sellerId, seller: s.sellerId,
      categories: s.categoryId, category: s.categoryId, posts: s.postId, post: s.postId,
      pages: s.pageId, page: s.pageId, tickets: s.ticketId, ticket: s.ticketId,
      coupons: s.couponId, sessions: s.sessionId, banners: s.bannerId, menus: s.menuId,
      forms: s.formId, sections: s.sectionId, templates: s.templateId, roles: s.roleId,
      withdrawals: s.withdrawId, settlements: s.settlementId, reviews: s.reviewId,
      questions: s.questionId, preinvoices: s.preinvoiceCode, submissions: s.submissionId,
      notifications: s.notificationId, faqs: s.faqId, transactions: s.transactionId,
      stories: s.storyId, media: s.mediaName, warehouses: s.warehouseId,
      shipping: s.shippingId, methods: s.shippingId,
    }[prev];
    if (byPrev != null) return byPrev;
    return s[name] ?? (name === 'id' ? s.id : null);
  };

  const out = parts.map((seg, i) => {
    if (!seg.startsWith(':')) return seg;
    const name = seg.slice(1).replace(/\?$/, '');
    const v = pick(name, i);
    if (v === undefined || v === null || v === '') { unresolved = name; return seg; }
    return encodeURIComponent(String(v));
  });
  return { path: '/' + out.join('/'), unresolved };
}

/* ---------- نشست‌ها ---------- */
class Jar {
  constructor() { this.cookies = new Map(); }
  absorb(res) {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
    for (const c of raw) {
      const [pair] = c.split(';');
      const idx = pair.indexOf('=');
      if (idx < 0) continue;
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      if (v === '' || /Expires=Thu, 01 Jan 1970/i.test(c)) this.cookies.delete(k); else this.cookies.set(k, v);
    }
  }
  header() { return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }
}

async function login(phone, password) {
  const jar = new Jar();
  const res = await fetch(`${BASE}/login/password`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: jar.header() },
    body: new URLSearchParams({ identifier: phone, password, remember: '0' }).toString(),
  });
  jar.absorb(res);
  // بررسی ورود موفق با یک درخواست پروفایل
  const check = await fetch(`${BASE}/user/dashboard`, { redirect: 'manual', headers: { cookie: jar.header() } });
  jar.absorb(check);
  return { jar, ok: check.status !== 302 && check.status !== 401, status: check.status };
}

async function req(jar, url) {
  const res = await fetch(BASE + url, { redirect: 'manual', headers: { cookie: jar ? jar.header() : '' } });
  if (jar) jar.absorb(res);
  let body = '';
  try { body = await res.text(); } catch { /* ignore */ }
  return { status: res.status, body, location: res.headers.get('location') };
}

const ERROR_MARKERS = ['Unexpected token', 'is not defined', 'Cannot read propert', 'is not a function',
  'SqliteError', 'ReferenceError', 'TypeError:', 'خطای غیرمنتظره', 'stack:', 'at Object.<anonymous>'];

/** نشتی مقادیر خام در HTML رندرشده — نشانه جای‌خالی داده در قالب */
const LEAK_PATTERNS = [
  [/>\s*undefined\s*</g, 'undefined'],
  [/value="undefined"/g, 'value=undefined'],
  [/>\s*NaN\s*</g, 'NaN'],
  [/\[object Object\]/g, '[object Object]'],
  [/href="undefined|src="undefined/g, 'پیوند undefined'],
];

function looksBroken(r) {
  if (r.status >= 500) return `HTTP ${r.status}`;
  if (r.status === 200) {
    for (const m of ERROR_MARKERS) if (r.body.includes(m)) return `نشانه خطا در خروجی: ${m}`;
    if (!process.env.NO_LEAK_CHECK) {
      for (const [re, label] of LEAK_PATTERNS) {
        re.lastIndex = 0;
        if (re.test(r.body)) return `نشتی داده در HTML: ${label}`;
      }
    }
  }
  return null;
}

/* ---------- اجرای آزمون ---------- */
(async function main() {
  console.log(`\n▸ آزمون دود — ${BASE}\n`);
  const s = samples();
  if (!s.productId) {
    console.error('✗ پایگاه داده خالی است. ابتدا «npm run seed» را اجرا کنید.');
    process.exit(1);
  }

  const admin = await login(config.seed.adminPhone, config.seed.adminPassword);
  const seller = await login('09121000001', '12345678');
  const customer = await login('09122000001', '12345678');
  console.log(`  نشست مدیر: ${admin.ok ? '✓' : '✗ (' + admin.status + ')'}   فروشنده: ${seller.ok ? '✓' : '✗ (' + seller.status + ')'}   مشتری: ${customer.ok ? '✓' : '✗ (' + customer.status + ')'}`);

  const routes = collectRoutes();
  const results = { ok: 0, redirect: 0, notfound: 0, skipped: 0, failed: [] };
  const failures = [];

  for (const r of routes) {
    if (r.path.startsWith('/install')) { results.skipped++; continue; } // پس از نصب قفل است
    if (/\*/.test(r.path)) { results.skipped++; continue; }
    const filled = fillPath(r.path, s);
    if (filled.unresolved) { results.skipped++; if (process.env.VERBOSE) console.log(`   [skip] ${r.path} — پارامتر بدون نمونه: ${filled.unresolved}`); continue; }
    const jar = filled.path.startsWith('/admin') ? admin.jar
      : filled.path.startsWith('/seller') ? seller.jar
        : filled.path.startsWith('/user') ? customer.jar
          : filled.path.startsWith('/api') ? admin.jar : null;
    let res;
    try { res = await req(jar, filled.path); } catch (e) { failures.push([filled.path, 'خطای اتصال: ' + e.message]); continue; }
    const broken = looksBroken(res);
    if (process.env.VERBOSE && res.status !== 200) console.log(`   [${res.status}] ${filled.path}${res.location ? ' → ' + res.location : ''}`);
    if (broken) failures.push([filled.path, broken]);
    else if (res.status === 200) results.ok++;
    else if (res.status >= 300 && res.status < 400) results.redirect++;
    else if (res.status === 404 || res.status === 403 || res.status === 401) results.notfound++;
    else results.ok++;
  }

  /* ---------- مسیرهای اصلی فروشگاه (مهم‌ترین صفحات) ---------- */
  const critical = ['/', '/products', `/product/${s.productSlug}`, `/category/${s.categorySlug}`, '/blog', '/cart',
    '/faq', '/form/contact-us', '/login', '/register', '/user/dashboard', '/seller/dashboard', '/admin/dashboard'];
  const critFail = [];
  for (const p of critical) {
    const jar = p.startsWith('/admin') ? admin.jar : p.startsWith('/seller') ? seller.jar : p.startsWith('/user') ? customer.jar : null;
    try {
      const res = await req(jar, p);
      const broken = looksBroken(res);
      if (broken) critFail.push([p, broken]);
    } catch (e) { critFail.push([p, 'خطای اتصال: ' + e.message]); }
  }

  console.log(`\n  مسیرهای پیمایش‌شده: ${routes.length - results.skipped}   ✓ ۲۰۰: ${results.ok}   ↪ تغییرمسیر: ${results.redirect}   ⊘ ۴۰۱/۴۰۳/۴۰۴: ${results.notfound}   ⤼ ردشده: ${results.skipped}`);
  if (failures.length) {
    console.log(`\n✗ ${failures.length} خطا در پیمایش مسیرها:`);
    failures.slice(0, 60).forEach(([p, why]) => console.log(`   - ${p}  →  ${why}`));
  }
  if (critFail.length) {
    console.log(`\n✗ صفحات حیاتی دارای خطا:`);
    critFail.forEach(([p, why]) => console.log(`   - ${p}  →  ${why}`));
  }
  const total = failures.length + critFail.length;
  console.log(total ? `\n✗ آزمون ناموفق — ${total} مورد\n` : '\n✓ همه مسیرها بدون خطای سرور پاسخ دادند.\n');
  process.exit(total ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
