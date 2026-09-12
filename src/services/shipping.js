'use strict';
const { all, get, insert, update, remove, setting } = require('../db');
const { now } = require('../core/utils');

/** روش‌های حمل و نقل: قیمت پایه + هزینه وزن اضافی + ارسال رایگان از مبلغ مشخص */

function allMethods({ sellerId = null, includeInactive = false } = {}) {
  const sql = `SELECT * FROM shipping_methods WHERE (seller_id IS NULL OR seller_id=@s) ${includeInactive ? '' : "AND status='active'"} ORDER BY sort ASC, id ASC`;
  return all(sql, { s: sellerId });
}
function find(id) { return get('SELECT * FROM shipping_methods WHERE id=@id', { id }); }

/**
 * محاسبه هزینه ارسال
 * @param {object} method رکورد روش ارسال
 * @param {{weight:number, subtotal:number, cod:boolean}} ctx
 */
function cost(method, { weight = 0, subtotal = 0, cod = false } = {}) {
  if (!method) return 0;
  if (method.free_above > 0 && subtotal >= method.free_above) return 0;
  let c = method.base_price || 0;
  const from = method.extra_weight_from || 0;
  if (from && weight > from && method.extra_weight_price) {
    const extraKg = Math.ceil((weight - from) / 1000);
    c += extraKg * method.extra_weight_price;
  }
  if (cod && method.cod_allowed) c += parseInt(setting('cod_fee', '0'), 10) || 0;
  return Math.max(0, Math.round(c));
}

function eta(method) {
  if (!method) return '';
  const d = method.eta_days || 0;
  return d ? `${d} روز کاری` : 'تحویل فوری';
}

function create(data) { return insert('shipping_methods', { ...data, created_at: undefined }); }
function edit(id, data) { return update('shipping_methods', id, data); }
function destroy(id) { return remove('shipping_methods', id); }

/* ---------------- مراکز دریافت حضوری ---------------- */

function allPickups() { return all(`SELECT * FROM pickup_centers WHERE status='active' ORDER BY id ASC`); }
function findPickup(id) { return get('SELECT * FROM pickup_centers WHERE id=@id', { id }); }

/* ---------------- برچسب ارسال ---------------- */

/** داده‌های لازم برای چاپ برچسب پستی */
function labelData(order) {
  const shop = {
    name: setting('site_name', 'بالی‌وو'),
    phone: setting('site_phone', ''),
    address: setting('site_address', ''),
    postal: setting('site_postal_code', ''),
    logo: setting('site_logo', '/img/logo.svg'),
  };
  const addr = order.address_snapshot ? JSON.parse(order.address_snapshot || '{}') : {};
  return {
    shop,
    order_code: order.code,
    tracking_code: order.tracking_code,
    shipping_title: order.shipping_title,
    receiver: { name: order.receiver_name, phone: order.receiver_phone, postal_code: order.postal_code, address: addr.address || '', city: addr.city || '', province: addr.province || '' },
    items_count: order.items_count || 0,
    weight: order.weight || 0,
    created_at: order.created_at,
    barcode: order.code,
  };
}

module.exports = { allMethods, find, cost, eta, create, edit, destroy, allPickups, findPickup, labelData };
