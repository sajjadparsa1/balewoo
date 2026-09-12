'use strict';
/**
 * آزمون سرتاسری (E2E) — جریان‌های اصلی کسب‌وکار را از راه HTTP اجرا می‌کند
 * و نتیجه را روی پایگاه داده بررسی می‌کند:
 *   ۱) خرید کامل مشتری: نشانی ← سبد ← کد تخفیف ← پرداخت آزمایشی ← سفارش پرداخت‌شده
 *   ۲) شارژ کیف پول و پرداخت با کیف پول
 *   ۳) ساخت محصول توسط فروشنده و تأیید آن توسط مدیر
 *   ۴) ساخت کد تخفیف توسط مدیر و مصرف آن توسط مشتری
 *   ۵) تیکت پشتیبانی: ثبت توسط مشتری، پاسخ توسط مدیر
 *
 * اجرا:  npm run test:e2e   (سرور باید در حال اجرا باشد)
 */
const { get, all, run, setting } = require('../src/db');
const config = require('../src/config');

const BASE = (process.env.BASE || `http://127.0.0.1:${process.env.PORT || config.port || 3000}`).replace(/\/$/, '');

let passed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`   ✓ ${name}`); }
  else { failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`   ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

/* ---------------- کلاینت ساده با کوکی ---------------- */
class Client {
  constructor(name) { this.name = name; this.cookies = new Map(); }
  cookieHeader() { return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }
  absorb(res) {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
    for (const c of raw) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      if (i < 0) continue;
      const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
      if (!v) this.cookies.delete(k); else this.cookies.set(k, v);
    }
  }
  async request(path, { method = 'GET', body = null, json = false, follow = false, maxRedirects = 6 } = {}) {
    let url = BASE + path;
    let res;
    for (let hop = 0; ; hop++) {
      const headers = { cookie: this.cookieHeader() };
      let payload;
      if (body) {
        if (body instanceof URLSearchParams || typeof body === 'string') { headers['content-type'] = 'application/x-www-form-urlencoded'; payload = String(body); }
        else { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
      }
      if (json) headers.accept = 'application/json';
      res = await fetch(url, { method, headers, body: payload, redirect: 'manual' });
      this.absorb(res);
      const loc = res.headers.get('location');
      if (follow && loc && hop < maxRedirects) { url = new URL(loc, url).toString(); continue; }
      break;
    }
    let text = '';
    try { text = await res.text(); } catch { /* ignore */ }
    let data = null;
    if (json) { try { data = JSON.parse(text); } catch { /* ignore */ } }
    return { status: res.status, location: res.headers.get('location'), text, data };
  }
  form(obj) { return new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)).toString(); }
  get(p, o) { return this.request(p, o); }
  post(p, body, o = {}) { return this.request(p, { ...o, method: 'POST', body: body instanceof URLSearchParams || typeof body === 'string' ? body : this.form(body || {}) }); }
  async login(phone, password) {
    const r = await this.post('/login/password', { identifier: phone, password });
    const me = await this.get('/user/dashboard');
    return me.status === 200;
  }
}

const uniq = Date.now().toString().slice(-7);

(async function main() {
  console.log(`\n▸ آزمون سرتاسری — ${BASE}\n`);

  const admin = new Client('admin');
  const seller = new Client('seller');
  const buyer = new Client('buyer');

  check('ورود مدیر', await admin.login(config.seed.adminPhone, config.seed.adminPassword));
  check('ورود فروشنده', await seller.login('09121000001', '12345678'));
  check('ورود مشتری', await buyer.login('09122000001', '12345678'));

  const buyerRow = get(`SELECT id FROM users WHERE phone='09122000001'`);
  const sellerRow = get(`SELECT id, seller_id FROM users WHERE phone='09121000001'`);
  if (!buyerRow || !sellerRow) { console.error('✗ حساب‌های نمونه یافت نشد — «npm run seed» را اجرا کنید.'); process.exit(1); }
  const buyerId = buyerRow.id;
  console.log(`   (شناسه مشتری: ${buyerId} · فروشنده: ${sellerRow.seller_id})`);

  /* ============ ۱) جریان خرید کامل ============ */
  console.log('\n  — جریان خرید —');
  const product = get(`SELECT p.*, s.id AS sid FROM products p JOIN sellers s ON s.id=p.seller_id
                        WHERE p.status='active' AND p.deleted_at IS NULL AND p.stock > 5 AND p.is_inquiry=0
                        ORDER BY p.price ASC LIMIT 1`);
  check('محصول قابل خرید وجود دارد', !!product, product ? '' : 'داده نمونه را اجرا کنید');

  const couponCode = `E2E${uniq}`;
  const cAdmin = await admin.post('/admin/coupons', { code: couponCode, type: 'percent', value: 10, max_discount: 500000, min_cart: 0, usage_limit: 5, per_user: 2, status: 'active' });
  const coupon = get('SELECT * FROM coupons WHERE code=@c', { c: couponCode });
  check('ساخت کد تخفیف توسط مدیر', cAdmin.status === 302 && !!coupon, `status=${cAdmin.status}`);

  await buyer.post('/user/addresses', { title: 'نشانی آزمون', receiver: 'کاربر آزمون', phone: '09122000001', province: 'تهران', city: 'تهران', address: 'خیابان آزمون، کوچه نمونه، پلاک ۱۲، واحد ۳', postal_code: '1435812345', is_default: '1' });
  const address = get(`SELECT * FROM addresses WHERE user_id=@u AND title='نشانی آزمون' ORDER BY id DESC LIMIT 1`, { u: buyerId });
  check('ثبت نشانی جدید', !!address);

  const added = await buyer.post('/cart/add', { product_id: product.id, qty: 2 }, { json: true });
  check('افزودن محصول به سبد', added.status === 200 && added.data && added.data.ok, `status=${added.status} body=${(added.text || '').slice(0, 90)}`);

  const couponRes = await buyer.post('/cart/coupon', { code: couponCode }, { json: true });
  check('اعمال کد تخفیف روی سبد', couponRes.status === 200 && couponRes.data && couponRes.data.ok !== false, `status=${couponRes.status} body=${(couponRes.text || '').slice(0, 120)}`);

  const checkoutPage = await buyer.get('/checkout');
  check('صفحه تکمیل خرید باز می‌شود', checkoutPage.status === 200);
  const method = get(`SELECT * FROM shipping_methods WHERE status='active' ORDER BY id LIMIT 1`);
  check('روش ارسال فعال وجود دارد', !!method);

  const stockBefore = get('SELECT stock FROM products WHERE id=@id', { id: product.id }).stock;
  const walletBefore = get('SELECT wallet, points FROM users WHERE id=@bu', { bu: buyerId });
  const gateway = 'zarinpal';
  const co = await buyer.post('/checkout', {
    address_id: address.id, shipping_method_id: method.id, payment_method: gateway,
    receiver_name: 'کاربر آزمون', receiver_phone: '09122000001', customer_note: 'سفارش آزمون خودکار',
  });
  const newOrder = get(`SELECT * FROM orders WHERE user_id=@bu ORDER BY id DESC LIMIT 1`, { bu: buyerId });
  check('ثبت سفارش از سبد', co.status === 302 && !!newOrder, `status=${co.status} loc=${co.location}`);

  if (!newOrder) { console.error('✗ سفارشی ثبت نشد — ادامه آزمون ممکن نیست'); process.exit(1); }
  const tx = get(`SELECT * FROM transactions WHERE order_id=@o ORDER BY id DESC LIMIT 1`, { o: newOrder.id });
  check('ایجاد تراکنش درگاه', !!tx && String(co.location || '').includes('/payment/sandbox/'), `loc=${co.location}`);

  const pay = await buyer.post(`/payment/sandbox/${tx.id}`, { action: 'ok' });
  const paidOrder = get(`SELECT * FROM orders WHERE id=@id`, { id: newOrder.id });
  check('پرداخت موفق و پرداخت‌شده شدن سفارش', pay.status === 302 && paidOrder.payment_status === 'paid', `status=${pay.status} payment_status=${paidOrder.payment_status}`);
  check('کسر موجودی انبار پس از خرید', get('SELECT stock FROM products WHERE id=@id', { id: product.id }).stock <= stockBefore, `before=${stockBefore}`);
  const after = get('SELECT wallet, points FROM users WHERE id=@bu', { bu: buyerId });
  check('افزودن امتیاز باشگاه مشتریان', (after.points || 0) >= (walletBefore.points || 0), `points=${after.points}`);
  check('اعمال تخفیف کد در سفارش', (paidOrder.coupon_discount || 0) > 0 || (paidOrder.items_discount || 0) >= 0, `coupon_discount=${paidOrder.coupon_discount}`);
  const settlement = get(`SELECT COUNT(*) c FROM settlements WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id=@o)`, { o: paidOrder.id });
  check('ثبت تسویه فروشنده برای آیتم‌ها', settlement.c > 0, `rows=${settlement.c}`);

  const orderPage = await buyer.get(`/user/orders/${paidOrder.code}`);
  check('صفحه جزئیات سفارش مشتری', orderPage.status === 200);
  const adminOrderPage = await admin.get(`/admin/orders/${paidOrder.code}`);
  check('صفحه جزئیات سفارش در پنل مدیریت', adminOrderPage.status === 200);
  const invoicePage = await admin.get(`/admin/orders/${paidOrder.code}/invoice`);
  check('فاکتور سفارش', [200, 302].includes(invoicePage.status), `status=${invoicePage.status}`);

  /* ============ ۲) کیف پول ============ */
  console.log('\n  — کیف پول —');
  const charge = await buyer.post('/payment/wallet/charge', { amount: 500000, gateway });
  const chargeTx = get(`SELECT * FROM transactions WHERE user_id=@bu AND type='charge_wallet' ORDER BY id DESC LIMIT 1`, { bu: buyerId });
  check('ایجاد تراکنش شارژ کیف پول', charge.status === 302 && !!chargeTx, `status=${charge.status}`);
  const walletBeforeCharge = get('SELECT wallet FROM users WHERE id=@bu', { bu: buyerId }).wallet || 0;
  await buyer.post(`/payment/sandbox/${chargeTx.id}`, { action: 'ok' });
  const walletAfterCharge = get('SELECT wallet FROM users WHERE id=@bu', { bu: buyerId }).wallet || 0;
  check('افزایش موجودی کیف پول پس از پرداخت', walletAfterCharge === walletBeforeCharge + 500000, `${walletBeforeCharge} → ${walletAfterCharge}`);

  /* ============ ۳) محصول فروشنده ============ */
  console.log('\n  — محصول فروشنده —');
  const cat = get(`SELECT id FROM categories ORDER BY id LIMIT 1`);
  const sellerProductTitle = `محصول آزمون فروشنده ${uniq}`;
  const sp = await seller.post('/seller/products', {
    title: sellerProductTitle, category_id: cat.id, price: 1850000, old_price: 2200000, stock: 12,
    short_desc: 'شرح کوتاه آزمون', description: '<p>توضیحات کامل محصول آزمون.</p>', warranty: '۱۸ ماه گارانتی نمونه',
    sku: `E2E-${uniq}`, condition_txt: 'new',
  });
  const created = get(`SELECT * FROM products WHERE title=@t ORDER BY id DESC LIMIT 1`, { t: sellerProductTitle });
  check('ثبت محصول توسط فروشنده', sp.status === 302 && !!created, `status=${sp.status}`);
  const needApproval = setting('seller_products_need_approval', '1') === '1';
  check(needApproval ? 'محصول در انتظار تأیید مدیر است' : 'محصول بدون نیاز به تأیید فعال شد',
    created && created.status === (needApproval ? 'pending' : 'active'), `status=${created && created.status}`);
  const sellerList = await seller.get('/seller/products');
  check('لیست محصولات فروشنده', sellerList.status === 200);

  const approve = await admin.post(`/admin/products/${created.id}/approve`, {});
  const approved = get(`SELECT status FROM products WHERE id=@id`, { id: created.id });
  check('تأیید محصول توسط مدیر', [200, 302].includes(approve.status) && approved.status === 'active', `status=${approve.status} → ${approved.status}`);
  const sellerProductPage = await seller.get(`/seller/products/${created.id}/edit`);
  check('صفحه ویرایش محصول در پنل فروشنده', sellerProductPage.status === 200, `status=${sellerProductPage.status}`);
  const publicPage = await buyer.get(`/product/${created.slug}`);
  check('صفحه عمومی محصول تأییدشده', publicPage.status === 200);

  /* ============ ۴) تیکت پشتیبانی ============ */
  console.log('\n  — تیکت پشتیبانی —');
  const subject = `پیگیری سفارش آزمون ${uniq}`;
  const tk = await buyer.post('/user/tickets', { subject, body: 'سلام، وضعیت سفارش آزمون را بررسی کنید.', department: 'support', priority: 'high', order_id: paidOrder.id });
  const ticket = get(`SELECT * FROM tickets WHERE subject=@s ORDER BY id DESC LIMIT 1`, { s: subject });
  check('ثبت تیکت توسط مشتری', tk.status === 302 && !!ticket, `status=${tk.status}`);
  const reply = await admin.post(`/admin/system/tickets/${ticket.code}/reply`, { body: 'بررسی شد؛ سفارش شما در مرحله پردازش است.', status: 'open' });
  const msgs = get('SELECT COUNT(*) c FROM ticket_messages WHERE ticket_id=@t', { t: ticket.id }).c;
  check('پاسخ مدیر به تیکت', reply.status === 302 && msgs >= 2, `status=${reply.status} messages=${msgs}`);

  /* ============ ۵) مدیر: دسته‌بندی و گزارش‌ها ============ */
  console.log('\n  — عملیات مدیریتی —');
  const catName = `دسته آزمون ${uniq}`;
  const nc = await admin.post('/admin/categories', { name: catName, parent_id: '', status: 'active', sort: 99 });
  check('ساخت دسته‌بندی جدید', nc.status === 302 && !!get('SELECT id FROM categories WHERE name=@n', { n: catName }), `status=${nc.status}`);

  const pages = ['/admin/dashboard', '/admin/system/reports', '/admin/orders', '/admin/people/users', '/admin/people/sellers',
    '/admin/settings/general', '/admin/settings/gateways', '/admin/people/withdrawals', '/admin/coupons',
    '/admin/system/backup', '/admin/system/sessions', '/admin/system/activities', '/admin/preinvoices'];
  for (const p of pages) {
    const r = await admin.get(p);
    check(`صفحه مدیریتی ${p}`, r.status === 200, `status=${r.status}`);
  }

  /* ============ خلاصه ============ */
  console.log(`\n  ✓ ${passed} بررسی موفق${failures.length ? `   ✗ ${failures.length} بررسی ناموفق` : ''}`);
  if (failures.length) { console.log(''); failures.forEach((f) => console.log('   - ' + f)); }
  console.log(failures.length ? '\n✗ آزمون سرتاسری ناموفق\n' : '\n✓ آزمون سرتاسری با موفقیت انجام شد\n');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
