'use strict';
const { all, get, insert, update, run, jparse, setting } = require('../db');
const { now, toInt, percentOff, numberFormat, randomCode } = require('../core/utils');
const catalog = require('../core/catalog');
const cache = require('../core/cache');

/**
 * سبد خرید — پشتیبانی از مهمان (session) و کاربر، متغیرها، ویژگی‌های اختیاری،
 * کد تخفیف، تخفیف پلکانی، امتیاز باشگاه مشتریان و کیف پول.
 */

function currentCart(req, { create = true } = {}) {
  const userId = req.user?.id || null;
  const sid = req.sessionID;
  let cart = userId
    ? get('SELECT * FROM carts WHERE user_id=@u ORDER BY id DESC LIMIT 1', { u: userId })
    : get('SELECT * FROM carts WHERE session_id=@s AND user_id IS NULL ORDER BY id DESC LIMIT 1', { s: sid });

  if (!cart && userId) cart = get('SELECT * FROM carts WHERE session_id=@s ORDER BY id DESC LIMIT 1', { s: sid });
  if (!cart && create) {
    const id = insert('carts', { user_id: userId, session_id: sid, created_at: now(), updated_at: now() });
    cart = get('SELECT * FROM carts WHERE id=@id', { id });
  }
  if (cart && userId && !cart.user_id) run('UPDATE carts SET user_id=@u WHERE id=@id', { u: userId, id: cart.id });
  return cart;
}

function items(cartId) {
  if (!cartId) return [];
  return all(`SELECT ci.*, p.title, p.slug, p.status AS product_status, p.deleted_at, p.min_order, p.max_order, p.is_inquiry,
                     p.seller_id AS product_seller_id, p.stock AS product_stock,
                     v.title AS variant_title, v.options AS variant_options, v.price AS variant_price, v.old_price AS variant_old_price, v.stock AS variant_stock, v.image AS variant_image,
                     c.name AS category_name
              FROM cart_items ci
              JOIN products p ON p.id = ci.product_id
              LEFT JOIN product_variants v ON v.id = ci.variant_id
              LEFT JOIN categories c ON c.id = p.category_id
              WHERE ci.cart_id=@c ORDER BY ci.id ASC`, { c: cartId }).map((row) => decorateItem(row));
}

function decorateItem(row) {
  const p = { id: row.product_id, price: row.variant_price ?? row.price, old_price: row.variant_old_price ?? row.old_price, stock: row.variant_stock ?? row.product_stock };
  const unit = catalog.unitPriceForQty({ id: row.product_id, price: p.price, old_price: p.old_price, discount_start: null, discount_end: null }, row.qty, row.variant_id ? { id: row.variant_id, price: p.price, old_price: p.old_price } : null);
  const opts = jparse(row.options, []);
  const optionsTotal = opts.reduce((a, o) => a + (o.price || 0), 0);
  const unitFinal = unit.price + optionsTotal;
  const oldUnit = (p.old_price && p.old_price > unit.price ? p.old_price : unit.price) + optionsTotal;
  row.image = row.variant_image || catalog.coverOf({ id: row.product_id });
  row.unit_price = unitFinal;
  row.unit_old_price = oldUnit;
  row.line_total = unitFinal * row.qty;
  row.line_old_total = oldUnit * row.qty;
  row.line_discount = Math.max(0, row.line_old_total - row.line_total);
  row.discount_percent = percentOff(unitFinal, oldUnit);
  row.tier = unit.tier;
  row.options_list = opts;
  row.options_total = optionsTotal;
  row.seller_id = row.seller_id ?? row.product_seller_id;
  row.available = (row.variant_stock ?? row.product_stock ?? 0) >= row.qty && row.product_status === 'active' && !row.deleted_at;
  return row;
}

/* ---------------- افزودن / ویرایش ---------------- */

function add(req, { productId, variantId = null, qty = 1, optionIds = [], affiliateId = null }) {
  const cart = currentCart(req);
  const product = catalog.findProduct(productId);
  if (!product) return { ok: false, error: 'محصول یافت نشد' };
  if (product.status !== 'active') return { ok: false, error: 'این محصول در حال حاضر قابل خرید نیست' };
  if (product.is_inquiry) return { ok: false, error: 'این محصول استعلامی است؛ برای خرید با فروشگاه تماس بگیرید' };

  const variant = variantId ? get('SELECT * FROM product_variants WHERE id=@id AND product_id=@p', { id: toInt(variantId), p: product.id }) : null;
  if (variantId && !variant) return { ok: false, error: 'متغیر انتخاب‌شده معتبر نیست' };

  const stock = variant ? variant.stock : product.stock;
  qty = Math.max(product.min_order || 1, toInt(qty, 1));
  if (product.max_order) qty = Math.min(qty, product.max_order);
  if (stock < qty) return { ok: false, error: stock > 0 ? `حداکثر ${numberFormat(stock)} عدد موجود است` : 'این محصول ناموجود است' };

  const options = catalog.optionsTotal(product.id, optionIds);
  const price = variant ? variant.price : catalog.effectivePrice(product);
  const oldPrice = variant ? variant.old_price : product.old_price;

  // اگر همان ترکیب موجود بود، تعداد را اضافه کن
  const optKey = JSON.stringify(options.items.map((o) => o.id));
  const existing = all('SELECT * FROM cart_items WHERE cart_id=@c AND product_id=@p', { c: cart.id, p: product.id })
    .find((it) => (it.variant_id || null) === (variant?.id || null) && JSON.stringify(jparse(it.options, []).map((o) => o.id)) === optKey);

  if (existing) {
    const newQty = existing.qty + qty;
    if (newQty > stock) return { ok: false, error: 'تعداد درخواستی بیش از موجودی انبار است' };
    run('UPDATE cart_items SET qty=@q, price=@pr, updated_at=@t WHERE id=@id', { q: newQty, pr: price, t: now(), id: existing.id });
    touch(cart.id);
    return { ok: true, itemId: existing.id, qty: newQty, message: 'تعداد محصول در سبد افزایش یافت' };
  }

  const itemId = insert('cart_items', {
    cart_id: cart.id, product_id: product.id, variant_id: variant?.id || null,
    seller_id: variant?.seller_id ?? product.seller_id, qty, price, old_price: oldPrice,
    options: JSON.stringify(options.items), affiliate_id: affiliateId || req.session.affiliateId || null,
    created_at: now(), updated_at: now(),
  });
  touch(cart.id);
  require('../core/activity').logReq(req, 'cart_add', { subjectType: 'product', subjectId: product.id, description: `«${product.title}» به سبد اضافه شد` });
  return { ok: true, itemId, qty, message: 'به سبد خرید اضافه شد' };
}

function setQty(req, itemId, qty) {
  const cart = currentCart(req);
  const item = get('SELECT * FROM cart_items WHERE id=@id AND cart_id=@c', { id: toInt(itemId), c: cart.id });
  if (!item) return { ok: false, error: 'آیتم یافت نشد' };
  qty = Math.max(1, toInt(qty, 1));
  const p = catalog.findProduct(item.product_id);
  const stock = item.variant_id ? (get('SELECT stock FROM product_variants WHERE id=@id', { id: item.variant_id })?.stock ?? 0) : (p?.stock ?? 0);
  if (p?.max_order) qty = Math.min(qty, p.max_order);
  if (qty > stock) return { ok: false, error: `حداکثر ${numberFormat(stock)} عدد موجود است` };
  run('UPDATE cart_items SET qty=@q, updated_at=@t WHERE id=@id', { q: qty, t: now(), id: item.id });
  touch(cart.id);
  return { ok: true };
}

function removeItem(req, itemId) {
  const cart = currentCart(req);
  const n = run('DELETE FROM cart_items WHERE id=@id AND cart_id=@c', { id: toInt(itemId), c: cart.id }).changes;
  touch(cart.id);
  require('../core/activity').logReq(req, 'cart_remove', { description: 'حذف آیتم از سبد' });
  return { ok: n > 0 };
}

function clear(req) {
  const cart = currentCart(req, { create: false });
  if (!cart) return;
  run('DELETE FROM cart_items WHERE cart_id=@c', { c: cart.id });
  run('UPDATE carts SET coupon_code=NULL, coupon_value=0, wallet_used=0, points_used=0, updated_at=@t WHERE id=@id', { t: now(), id: cart.id });
  cache.flushGroup('cart');
}

function touch(cartId) { run('UPDATE carts SET updated_at=@t, is_abandoned=0 WHERE id=@id', { t: now(), id: cartId }); cache.flushGroup('cart'); }

/* ---------------- کد تخفیف ---------------- */

function applyCoupon(req, code) {
  const cart = currentCart(req);
  const c = String(code || '').trim().toUpperCase();
  if (!c) return { ok: false, error: 'کد تخفیف را وارد کنید' };
  const coupon = get('SELECT * FROM coupons WHERE UPPER(code)=@c', { c });
  if (!coupon) return { ok: false, error: 'کد تخفیف معتبر نیست' };
  if (coupon.status !== 'active') return { ok: false, error: 'این کد غیرفعال شده است' };
  const t = Date.now();
  if (coupon.starts_at && t < new Date(coupon.starts_at.replace(' ', 'T') + 'Z').getTime()) return { ok: false, error: 'این کد هنوز فعال نشده است' };
  if (coupon.expires_at && t > new Date(coupon.expires_at.replace(' ', 'T') + 'Z').getTime()) return { ok: false, error: 'این کد منقضی شده است' };
  if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) return { ok: false, error: 'سهمیه این کد تمام شده است' };
  if (coupon.user_id && coupon.user_id !== req.user?.id) return { ok: false, error: 'این کد مخصوص کاربر دیگری است' };

  const totals = compute(req);
  if (coupon.min_cart && totals.subtotal < coupon.min_cart) return { ok: false, error: `حداقل مبلغ سبد برای این کد ${numberFormat(coupon.min_cart)} تومان است` };

  const productIds = jparse(coupon.product_ids, []);
  const sellerIds = jparse(coupon.seller_ids, []);
  const eligible = totals.items.filter((i) => (!productIds.length || productIds.includes(i.product_id)) && (!sellerIds.length || sellerIds.includes(i.seller_id)));
  if (!eligible.length) return { ok: false, error: 'این کد برای محصولات سبد شما کاربرد ندارد' };

  const base = eligible.reduce((a, i) => a + i.line_total, 0);
  let discount = coupon.type === 'percent' ? Math.round((base * coupon.value) / 100) : Math.min(coupon.value, base);
  if (coupon.max_discount) discount = Math.min(discount, coupon.max_discount);

  run('UPDATE carts SET coupon_code=@c, coupon_value=@v, updated_at=@t WHERE id=@id', { c: coupon.code, v: discount, t: now(), id: cart.id });
  cache.flushGroup('cart');
  return { ok: true, discount, message: `کد تخفیف اعمال شد — ${numberFormat(discount)} تومان تخفیف` };
}

function removeCoupon(req) {
  const cart = currentCart(req, { create: false });
  if (!cart) return;
  run('UPDATE carts SET coupon_code=NULL, coupon_value=0 WHERE id=@id', { id: cart.id });
  cache.flushGroup('cart');
}

/* ---------------- کیف پول و امتیاز ---------------- */

function useWallet(req, amount) {
  const cart = currentCart(req);
  if (!req.user) return { ok: false, error: 'برای استفاده از کیف پول وارد حساب شوید' };
  const totals = compute(req, { skipWallet: true });
  const max = Math.min(req.user.wallet || 0, totals.total);
  const val = Math.max(0, Math.min(toInt(amount), max));
  run('UPDATE carts SET wallet_used=@w, updated_at=@t WHERE id=@id', { w: val, t: now(), id: cart.id });
  cache.flushGroup('cart');
  return { ok: true, used: val, max };
}

function usePoints(req, points) {
  const cart = currentCart(req);
  if (!req.user) return { ok: false, error: 'برای استفاده از امتیاز وارد حساب شوید' };
  const rate = parseFloat(setting('club_point_value', '100')); // هر امتیاز = ۱۰۰ تومان
  const maxPoints = Math.min(req.user.points || 0, Math.floor((req.user.points || 0) * (parseFloat(setting('club_max_use_percent', '20')) / 100)));
  const val = Math.max(0, Math.min(toInt(points), maxPoints));
  run('UPDATE carts SET points_used=@p, points_discount=@d, updated_at=@t WHERE id=@id', { p: val, d: val * rate, t: now(), id: cart.id });
  cache.flushGroup('cart');
  return { ok: true, used: val, discount: val * rate, max: maxPoints };
}

/* ---------------- محاسبه سبد ---------------- */

function compute(req, { skipWallet = false } = {}) {
  const cart = currentCart(req);
  const list = cart ? items(cart.id) : [];

  let subtotal = 0, oldSubtotal = 0, itemsDiscount = 0, optionsTotal = 0, weight = 0, commissionTotal = 0;
  const bySeller = {};

  for (const it of list) {
    if (!it.available) continue;
    subtotal += it.line_total;
    oldSubtotal += it.line_old_total;
    itemsDiscount += it.line_discount;
    optionsTotal += it.options_total * it.qty;
    weight += (it.weight || 0) * it.qty;
    const sid = it.seller_id || 0;
    bySeller[sid] = bySeller[sid] || { seller_id: sid, items: [], subtotal: 0 };
    bySeller[sid].items.push(it);
    bySeller[sid].subtotal += it.line_total;

    // کمیسیون فروشنده
    if (sid) {
      const s = get('SELECT commission FROM sellers WHERE id=@id', { id: sid });
      if (s?.commission) commissionTotal += Math.round((it.line_total * s.commission) / 100);
    }
  }

  const couponDiscount = cart?.coupon_value || 0;
  const pointsDiscount = cart?.points_discount || 0;
  const walletUsed = skipWallet ? 0 : (cart?.wallet_used || 0);

  const afterDiscount = Math.max(0, subtotal - couponDiscount - pointsDiscount);

  // هزینه ارسال
  const shippingMethod = cart?.shipping_method_id ? require('../services/shipping').find(cart.shipping_method_id) : null;
  const shippingCost = shippingMethod ? require('../services/shipping').cost(shippingMethod, { weight, subtotal: afterDiscount }) : 0;

  const vatBase = parseFloat(setting('vat_on_shipping', '0')) === 1 ? afterDiscount + shippingCost : afterDiscount;
  const vat = catalog.applyVat(vatBase);

  const total = Math.max(0, afterDiscount + shippingCost + vat - walletUsed);
  const pointsEarned = Math.floor((subtotal / (parseFloat(setting('club_point_per_toman', '1000')) || 1000)));

  return {
    cart, items: list, availableItems: list.filter((i) => i.available),
    count: list.filter((i) => i.available).reduce((a, i) => a + i.qty, 0),
    subtotal, oldSubtotal, itemsDiscount, optionsTotal, couponDiscount, pointsDiscount, walletUsed,
    shippingCost, shippingMethod, vat, vatRate: catalog.vatRate(), total, weight,
    commissionTotal, bySeller: Object.values(bySeller), pointsEarned,
    hasUnavailable: list.some((i) => !i.available),
    freeShippingGap: shippingMethod?.free_above ? Math.max(0, shippingMethod.free_above - afterDiscount) : 0,
  };
}

/* ---------------- سبد رها شده ---------------- */

function markAbandoned(hours = 3) {
  const rows = all(`SELECT * FROM carts WHERE is_abandoned=0 AND updated_at < datetime('now', @h)
                    AND id IN (SELECT cart_id FROM cart_items)`, { h: `-${hours} hours` });
  for (const c of rows) run('UPDATE carts SET is_abandoned=1 WHERE id=@id', { id: c.id });
  return rows.length;
}

function abandonedCarts(limit = 50) {
  return all(`SELECT c.*, u.name, u.phone,
              (SELECT COUNT(*) FROM cart_items ci WHERE ci.cart_id=c.id) AS items_count,
              (SELECT COALESCE(SUM(ci.qty*ci.price),0) FROM cart_items ci WHERE ci.cart_id=c.id) AS amount
              FROM carts c LEFT JOIN users u ON u.id=c.user_id
              WHERE c.is_abandoned=1 ORDER BY c.updated_at DESC LIMIT @l`, { l: limit });
}

module.exports = { currentCart, items, add, setQty, removeItem, clear, applyCoupon, removeCoupon, useWallet, usePoints, compute, markAbandoned, abandonedCarts, touch };
