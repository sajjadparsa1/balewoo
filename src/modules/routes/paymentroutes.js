'use strict';
const express = require('express');
const router = express.Router();
const { get, run, insert, update, setting } = require('../../db');
const payment = require('../../services/payment');
const orders = require('../orders');
const auth = require('../../core/auth');
const seo = require('../../core/seo');
const { now, numberFormat, toInt } = require('../../core/utils');
const { toPersianDigits } = require('../../core/jalali');

/** صفحه شبیه‌ساز درگاه (حالت sandbox) */
router.get('/sandbox/:id', (req, res) => {
  const tx = get('SELECT * FROM transactions WHERE id=@id', { id: toInt(req.params.id) });
  if (!tx) return res.status(404).render('errors/404', { meta: seo.meta({ title: 'تراکنش یافت نشد', noindex: true }) });
  const gw = payment.gateway(tx.gateway);
  res.render('payment/sandbox', {
    meta: seo.meta({ title: 'درگاه پرداخت', noindex: true }),
    tx, gw, order: tx.order_id ? orders.detail(tx.order_id) : null,
  });
});

router.post('/sandbox/:id', async (req, res) => {
  const tx = get('SELECT * FROM transactions WHERE id=@id', { id: toInt(req.params.id) });
  if (!tx) return res.redirect('/');
  const result = await payment.verifyPayment(tx.id, { result: req.body.action === 'fail' ? 'fail' : 'ok' });
  if (tx.order_id) {
    if (result.ok) {
      orders.markPaid(tx.order_id, { gateway: tx.gateway, reference: tx.reference, userId: tx.user_id, method: tx.gateway });
      const order = orders.find(tx.order_id);
      return res.redirect(`/checkout/result/${order.code}?status=success`);
    }
    run(`UPDATE orders SET payment_status='unpaid' WHERE id=@id`, { id: tx.order_id });
    const order = orders.find(tx.order_id);
    return res.redirect(`/checkout/result/${order.code}?status=failed`);
  }
  // شارژ کیف پول
  if (result.ok && tx.type === 'charge_wallet') {
    run('UPDATE users SET wallet = wallet + @a WHERE id=@u', { a: tx.amount, u: tx.user_id });
    const bal = get('SELECT wallet FROM users WHERE id=@id', { id: tx.user_id });
    run('UPDATE transactions SET balance=@b WHERE id=@id', { b: bal.wallet, id: tx.id });
    require('../../core/notify').push(tx.user_id, require('../../core/notify').T.walletDeposit(numberFormat(tx.amount)));
    return res.redirect('/user/wallet?charged=1');
  }
  if (result.ok && tx.type === 'preinvoice') {
    const pi = get('SELECT * FROM preinvoices WHERE id=@id', { id: toInt((JSON.parse(tx.meta || '{}').preinvoice_id) || 0) });
    if (pi) run(`UPDATE preinvoices SET status='paid', paid_at=@t WHERE id=@id`, { t: now(), id: pi.id });
    return res.redirect('/user/preinvoices?paid=1');
  }
  res.redirect('/user/wallet?failed=1');
});

/** بازگشت از درگاه واقعی */
router.get('/verify', async (req, res) => {
  const tx = get('SELECT * FROM transactions WHERE id=@id', { id: toInt(req.query.id) });
  if (!tx) return res.redirect('/');
  if (req.query.Status && req.query.Status !== 'OK' && tx.gateway !== 'zibal') {
    const order = tx.order_id ? orders.find(tx.order_id) : null;
    return res.redirect(`/checkout/result/${order?.code || ''}?status=canceled`);
  }
  const result = await payment.verifyPayment(tx.id, req.query);
  if (tx.order_id) {
    const order = orders.find(tx.order_id);
    if (result.ok) {
      orders.markPaid(tx.order_id, { gateway: tx.gateway, reference: result.refId || tx.reference, userId: tx.user_id, method: tx.gateway });
      return res.redirect(`/checkout/result/${order.code}?status=success&ref=${result.refId || ''}`);
    }
    return res.redirect(`/checkout/result/${order.code}?status=failed`);
  }
  res.redirect(result.ok ? '/user/wallet?charged=1' : '/user/wallet?failed=1');
});

/** صفحه نتیجه پرداخت */
router.get('/checkout/result/:code', (req, res) => {
  const order = orders.find(req.params.code);
  if (!order) return res.redirect('/');
  res.render('payment/result', {
    meta: seo.meta({ title: 'نتیجه پرداخت', noindex: true }),
    order, status: req.query.status || (order.payment_status === 'paid' ? 'success' : 'pending'), ref: req.query.ref || order.gateway_ref,
  });
});

/** شارژ کیف پول */
router.post('/wallet/charge', auth.requireLogin, (req, res) => {
  const amount = Math.max(1000, toInt(req.body.amount));
  const gatewayKey = req.body.gateway || payment.enabledGateways()[0]?.key || 'zarinpal';
  const tx = payment.createPayment({
    amount, gatewayKey, userId: req.user.id, description: `شارژ کیف پول — ${numberFormat(amount)} تومان`,
    mobile: req.user.phone, meta: { type: 'charge_wallet' },
  });
  res.redirect(tx.redirectUrl);
});

/** پرداخت پیش‌فاکتور */
router.post('/preinvoice/pay/:code', auth.requireLogin, (req, res) => {
  const pi = get('SELECT * FROM preinvoices WHERE code=@c AND user_id=@u', { c: req.params.code, u: req.user.id });
  if (!pi) { auth.flash(req, 'danger', 'پیش‌فاکتور یافت نشد.'); return res.redirect('/user/preinvoices'); }
  if (req.body.method === 'wallet') {
    const r = orders.payPreinvoice(pi.code, { gateway: 'wallet' });
    auth.flash(req, r.ok ? 'success' : 'danger', r.ok ? 'پیش‌فاکتور از کیف پول پرداخت شد.' : r.error);
    return res.redirect('/user/preinvoices');
  }
  const tx = payment.createPayment({
    amount: pi.total, gatewayKey: req.body.gateway || 'zarinpal', userId: req.user.id,
    description: `پرداخت پیش‌فاکتور ${pi.code}`, mobile: req.user.phone, meta: { type: 'preinvoice', preinvoice_id: pi.id },
  });
  res.redirect(tx.redirectUrl);
});

module.exports = router;
