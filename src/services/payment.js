'use strict';
const config = require('../config');
const { setting, get, insert, update, run } = require('../db');
const { now, randomCode, orderCode, numberFormat, uuid } = require('../core/utils');
const { toPersianDigits } = require('../core/jalali');

/**
 * لایه یکپارچه درگاه‌های پرداخت
 * -------------------------------------------------------
 * هر درگاه یک «درایور» است با سه متد:
 *   create(payment)  -> { redirectUrl, authority }
 *   verify(payment, req) -> { ok, refId, amount, error }
 * در حالت sandbox (پیش‌فرض) هیچ درخواست واقعی به بانک زده نمی‌شود و
 * یک صفحه شبیه‌ساز داخلی نمایش داده می‌شود تا کل چرخه خرید قابل تست باشد.
 * برای استفاده واقعی کافی است کلیدهای هر درگاه در پنل مدیریت وارد شود و
 * حالت sandbox خاموش گردد.
 */

const GATEWAYS = [
  { key: 'zarinpal',    name: 'زرین‌پال',        type: 'online',   installment: false, logo: 'zarinpal',    fields: ['merchant_id'] },
  { key: 'zibal',       name: 'زیبال',           type: 'online',   installment: false, logo: 'zibal',       fields: ['merchant_id'] },
  { key: 'nextpay',     name: 'نکست‌پی',          type: 'online',   installment: false, logo: 'nextpay',     fields: ['api_key'] },
  { key: 'payping',     name: 'پی‌پینگ',          type: 'online',   installment: false, logo: 'payping',     fields: ['code'] },
  { key: 'aqayepardakht', name: 'آقای پرداخت',   type: 'online',   installment: false, logo: 'aqaye',       fields: ['pin'] },
  { key: 'parspal',     name: 'پارس‌پال',         type: 'online',   installment: false, logo: 'parspal',     fields: ['merchant_id'] },
  { key: 'sadad',       name: 'سداد (ملی)',      type: 'online',   installment: false, logo: 'sadad',       fields: ['merchant_id', 'terminal_id', 'key'] },
  { key: 'saman',       name: 'سامان',           type: 'online',   installment: false, logo: 'saman',       fields: ['merchant_id', 'terminal_id'] },
  { key: 'pasargad',    name: 'پاسارگاد',        type: 'online',   installment: false, logo: 'pasargad',    fields: ['merchant_id', 'terminal_id', 'certificate'] },
  { key: 'parsian',     name: 'پارسیان',         type: 'online',   installment: false, logo: 'parsian',     fields: ['pin'] },
  { key: 'sepehr',      name: 'سپهر (صادرات)',   type: 'online',   installment: false, logo: 'sepehr',      fields: ['terminal_id', 'key'] },
  { key: 'behpardakht', name: 'به‌پرداخت (ملت)',  type: 'online',   installment: false, logo: 'mellat',      fields: ['terminal_id', 'username', 'password'] },
  { key: 'toman',       name: 'تومن',            type: 'online',   installment: false, logo: 'toman',       fields: ['api_key'] },
  { key: 'vandad',      name: 'وندار',           type: 'online',   installment: false, logo: 'vandad',      fields: ['api_key'] },
  { key: 'shepa',       name: 'شپا',             type: 'online',   installment: false, logo: 'shepa',       fields: ['api_key'] },
  { key: 'azkivam',     name: 'ازکی‌وام',         type: 'installment', installment: true, logo: 'azki',      fields: ['merchant_id', 'api_key'], months: [3, 6, 9, 12] },
  { key: 'snappay',     name: 'اسنپ‌پی',          type: 'installment', installment: true, logo: 'snappay',   fields: ['client_id', 'client_secret'], months: [4] },
  { key: 'torobpay',    name: 'ترب‌پی',           type: 'installment', installment: true, logo: 'torobpay',  fields: ['merchant_id'], months: [4] },
  { key: 'digipay',     name: 'دیجی‌پی',          type: 'installment', installment: true, logo: 'digipay',   fields: ['client_id', 'client_secret'], months: [3, 6, 12] },
  { key: 'card2card',   name: 'کارت به کارت',    type: 'manual',   installment: false, logo: 'card2card',   fields: ['card_number', 'owner_name', 'bank_name'] },
  { key: 'wallet',      name: 'پرداخت از کیف پول', type: 'internal', installment: false, logo: 'wallet',     fields: [] },
  { key: 'cod',         name: 'پرداخت در محل',   type: 'cod',      installment: false, logo: 'cod',         fields: ['max_amount'] },
];

function gateway(key) { return GATEWAYS.find((g) => g.key === key); }

function enabledGateways() {
  const list = setting('gateways_enabled', 'zarinpal,zibal,nextpay,snappay,torobpay,card2card,wallet,cod').split(',').map((s) => s.trim());
  return GATEWAYS.filter((g) => list.includes(g.key));
}
function isSandbox() { return setting('payment_sandbox', config.payment.sandbox ? '1' : '0') !== '0'; }

/* ---------------- تراکنش پرداخت ---------------- */

/**
 * ایجاد رکورد پرداخت و دریافت آدرس هدایت
 * @param {{amount:number, orderId?:number, userId?:number, description?:string, mobile?:string, email?:string, callback:string}} p
 */
function createPayment({ amount, gatewayKey = 'zarinpal', orderId = null, userId = null, description = '', mobile = '', email = '', callback = '/payment/verify', meta = {} }) {
  const ref = 'BLW' + Date.now().toString().slice(-9) + Math.floor(Math.random() * 900 + 100);
  const id = insert('transactions', {
    user_id: userId, owner_type: 'user', owner_id: userId, type: meta.type || 'order',
    amount, balance: 0, gateway: gatewayKey, reference: ref, authority: null,
    order_id: orderId, status: 'pending', description, meta: JSON.stringify(meta), created_at: now(),
  });
  const authority = uuid();
  update('transactions', id, { authority });

  if (isSandbox()) {
    return { id, reference: ref, authority, sandbox: true, redirectUrl: `/payment/sandbox/${id}` };
  }
  const driver = realDrivers[gatewayKey];
  if (!driver) return { id, reference: ref, authority, sandbox: true, redirectUrl: `/payment/sandbox/${id}` };
  return driver.create({ id, amount, authority, mobile, email, description, callback });
}

/* ---------------- درایورهای واقعی ---------------- */

const realDrivers = {
  zarinpal: {
    async create(p) {
      const merchantId = setting('gw_zarinpal_merchant_id');
      const res = await fetch('https://api.zarinpal.com/pg/v4/payment/request.json', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: merchantId, amount: p.amount, callback_url: absolute(p.callback) + `?id=${p.id}`, description: p.description || 'خرید از فروشگاه', metadata: { mobile: p.mobile, email: p.email } }),
      });
      const data = await res.json();
      const d = data?.data;
      if (d?.code === 100) { update('transactions', p.id, { authority: d.authority }); return { ...p, authority: d.authority, sandbox: false, redirectUrl: `https://www.zarinpal.com/pg/StartPay/${d.authority}` }; }
      return { ...p, error: d?.message || 'خطای درگاه', sandbox: true, redirectUrl: `/payment/sandbox/${p.id}` };
    },
    async verify(p, query) {
      const merchantId = setting('gw_zarinpal_merchant_id');
      const res = await fetch('https://api.zarinpal.com/pg/v4/payment/verify.json', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: merchantId, amount: p.amount, authority: query.Authority }),
      });
      const data = await res.json();
      const d = data?.data;
      return { ok: d?.code === 100, refId: d?.ref_id, amount: d?.amount, error: d?.message };
    },
  },
  zibal: {
    async create(p) {
      const merchant = setting('gw_zibal_merchant_id');
      const res = await fetch('https://gateway.zibal.ir/v1/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant, amount: p.amount, callbackUrl: absolute(p.callback) + `?id=${p.id}`, mobile: p.mobile, description: p.description }),
      });
      const d = await res.json();
      if (d.result === 100) { update('transactions', p.id, { authority: d.trackId }); return { ...p, authority: d.trackId, sandbox: false, redirectUrl: `https://gateway.zibal.ir/start/${d.trackId}` }; }
      return { ...p, error: d.message, sandbox: true, redirectUrl: `/payment/sandbox/${p.id}` };
    },
    async verify(p, query) {
      const merchant = setting('gw_zibal_merchant_id');
      const res = await fetch('https://gateway.zibal.ir/v1/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, trackId: query.trackId }) });
      const d = await res.json();
      return { ok: d.result === 100 && d.success === 1, refId: d.refNumber, amount: d.amount, error: d.message };
    },
  },
  nextpay: {
    async create(p) {
      const apiKey = setting('gw_nextpay_api_key');
      const body = new URLSearchParams({ api_key: apiKey, amount: p.amount, order_id: p.id, callback_uri: absolute(p.callback) + `?id=${p.id}`, customer_phone: p.mobile });
      const res = await fetch('https://nextpay.org/nx/gateway/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      const d = await res.json();
      if (d.code === -1) { update('transactions', p.id, { authority: d.trans_id }); return { ...p, authority: d.trans_id, sandbox: false, redirectUrl: `https://nextpay.org/nx/gateway/payment/${d.trans_id}` }; }
      return { ...p, error: d.message, sandbox: true, redirectUrl: `/payment/sandbox/${p.id}` };
    },
    async verify(p, query) {
      const apiKey = setting('gw_nextpay_api_key');
      const body = new URLSearchParams({ api_key: apiKey, trans_id: query.trans_id, amount: p.amount });
      const res = await fetch('https://nextpay.org/nx/gateway/verify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      const d = await res.json();
      return { ok: d.code === 0, refId: d.Shaparak_Ref_Id, amount: p.amount, error: d.message };
    },
  },
  payping: {
    async create(p) {
      const code = setting('gw_payping_code');
      const body = new URLSearchParams({ amount: p.amount, callbackUrl: absolute(p.callback) + `?id=${p.id}`, clientRefId: String(p.id), description: p.description, mobileNumber: p.mobile });
      const res = await fetch('https://api.payping.ir/v3/pay', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${code}` }, body });
      const text = await res.text();
      if (res.ok && text) return { ...p, authority: text, sandbox: false, redirectUrl: `https://api.payping.ir/v3/pay/gotoipg/${text}` };
      return { ...p, error: text, sandbox: true, redirectUrl: `/payment/sandbox/${p.id}` };
    },
    async verify(p, query) {
      const code = setting('gw_payping_code');
      const res = await fetch('https://api.payping.ir/v3/pay/verify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${code}` }, body: JSON.stringify({ refId: query.refid, amount: p.amount }) });
      return { ok: res.ok, refId: query.refid, amount: p.amount };
    },
  },
};

function absolute(pathOrUrl) {
  if (/^https?:/i.test(pathOrUrl)) return pathOrUrl;
  return (setting('site_url') || config.baseUrl || '') + pathOrUrl;
}

/* ---------------- تایید پرداخت ---------------- */

async function verifyPayment(paymentId, query = {}) {
  const p = get('SELECT * FROM transactions WHERE id=@id', { id: paymentId });
  if (!p) return { ok: false, error: 'تراکنش یافت نشد' };
  if (p.status === 'success') return { ok: true, already: true, payment: p };

  if (isSandbox()) {
    const action = String(query.result || 'ok');
    if (action === 'fail') { update('transactions', p.id, { status: 'failed' }); return { ok: false, error: 'پرداخت توسط کاربر لغو شد', payment: p }; }
    update('transactions', p.id, { status: 'success', reference: 'SBX-' + randomCode('', 10) });
    return { ok: true, payment: get('SELECT * FROM transactions WHERE id=@id', { id: p.id }) };
  }
  const driver = realDrivers[p.gateway];
  if (!driver) return { ok: false, error: 'درایور درگاه یافت نشد' };
  const result = await driver.verify(p, query);
  update('transactions', p.id, { status: result.ok ? 'success' : 'failed', reference: result.refId ? String(result.refId) : p.reference });
  return { ok: !!result.ok, refId: result.refId, error: result.error, payment: get('SELECT * FROM transactions WHERE id=@id', { id: p.id }) };
}

/* ---------------- پرداخت‌های غیرآنلاین ---------------- */

/** پرداخت از کیف پول */
function payWithWallet(userId, amount, orderId = null) {
  const user = get('SELECT * FROM users WHERE id=@id', { id: userId });
  if (!user) return { ok: false, error: 'کاربر یافت نشد' };
  if (user.wallet < amount) return { ok: false, error: 'موجودی کیف پول کافی نیست' };
  run('UPDATE users SET wallet = wallet - @a WHERE id=@id', { a: amount, id: userId });
  const fresh = get('SELECT wallet FROM users WHERE id=@id', { id: userId });
  insert('transactions', { user_id: userId, owner_type: 'user', owner_id: userId, type: 'order', amount: -amount, balance: fresh.wallet, gateway: 'wallet', reference: 'WLT-' + randomCode('', 8), order_id: orderId, status: 'success', description: 'پرداخت از کیف پول', created_at: now() });
  return { ok: true, balance: fresh.wallet };
}

/** کارت به کارت — کاربر رسید را ثبت می‌کند و مدیر تایید می‌کند */
function submitCardReceipt(orderId, userId, { card_prefix = '', card_last4 = '', paid_at = '', note = '', receipt_image = '' }) {
  return insert('transactions', {
    user_id: userId, owner_type: 'user', owner_id: userId, type: 'order', amount: 0, gateway: 'card2card',
    reference: 'C2C-' + randomCode('', 8), order_id: orderId, status: 'pending',
    description: 'ثبت رسید کارت به کارت', meta: JSON.stringify({ card_prefix, card_last4, paid_at, note, receipt_image }), created_at: now(),
  });
}

/** محاسبه اقساط */
function installmentPlan(amount, months = 4, feePercent = 0) {
  const total = Math.round(amount * (1 + feePercent / 100));
  const per = Math.round(total / months);
  return { months, total, per, feePercent, label: `${toPersianDigits(months)} قسط ${feePercent ? '' : 'بدون کارمزد'}، ماهانه ${toPersianDigits(numberFormat(per))} تومان` };
}

function listGateways() { return GATEWAYS; }
function gatewaySettingsForm() { return GATEWAYS.map((g) => ({ key: g.key, name: g.name, fields: g.fields, enabled: enabledGateways().some((e) => e.key === g.key) })); }

module.exports = {
  GATEWAYS, gateway, enabledGateways, isSandbox, createPayment, verifyPayment,
  payWithWallet, submitCardReceipt, installmentPlan, listGateways, gatewaySettingsForm, realDrivers,
};
