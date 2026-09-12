'use strict';
const config = require('../config');
const { insert, all, setting } = require('../db');
const { now } = require('../core/utils');
const { toPersianDigits } = require('../core/jalali');

/**
 * سرویس پیامک — درایور پلاگین‌پذیر
 * پشتیبانی: کاوه‌نگار، قاصدک، ملی‌پیامک، sms.ir، ippanel، مدیانا + حالت mock
 * در حالت mock پیامک ارسال نمی‌شود و فقط لاگ می‌شود (کد در پنل مدیر قابل مشاهده است).
 */

const drivers = {
  mock: {
    name: 'حالت آزمایشی (Mock)',
    fields: [],
    async send({ phone, body }) {
      return { ok: true, provider: 'mock', ref: 'MOCK-' + Date.now(), note: 'در حالت آزمایشی پیامکی ارسال نمی‌شود' };
    },
  },

  kavenegar: {
    name: 'کاوه‌نگار',
    fields: [['api_key', 'کلید API'], ['sender', 'شماره ارسال‌کننده'], ['template_otp', 'قالب کد ورود']],
    async send({ phone, body, template, params = {} }) {
      const key = setting('sms_kavenegar_key', config.sms.apiKey);
      const receptor = phone.replace(/^0/, '');
      let url;
      if (template) {
        url = `https://api.kavenegar.com/v1/${key}/verify/lookup.json?receptor=${receptor}&token=${params.token || ''}&template=${template}`;
      } else {
        const sender = setting('sms_kavenegar_sender', config.sms.sender);
        url = `https://api.kavenegar.com/v1/${key}/sms/send.json?sender=${sender}&receptor=${receptor}&message=${encodeURIComponent(body)}`;
      }
      return doFetch('kavenegar', url, { phone, body });
    },
  },

  ghasedak: {
    name: 'قاصدک',
    fields: [['api_key', 'کلید API'], ['line_number', 'شماره خط']],
    async send({ phone, body, params = {} }) {
      const key = setting('sms_ghasedak_key', config.sms.apiKey);
      const line = setting('sms_ghasedak_line', '3000505');
      const res = await fetch('https://api.ghasedak.me/v2/sms/send/simple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key },
        body: JSON.stringify({ receptor: phone, message: params.token ? body : body, linenumber: line }),
      });
      const data = await res.json().catch(() => ({}));
      return finish('ghasedak', { ok: !!data?.result?.success || data?.statusCode === 200, ref: data?.result?.messageId, raw: data }, { phone, body });
    },
  },

  melipayamak: {
    name: 'ملی پیامک',
    fields: [['username', 'نام کاربری'], ['password', 'گذرواژه'], ['from', 'شماره ارسال‌کننده']],
    async send({ phone, body }) {
      const payload = {
        username: setting('sms_melipayamak_user'), password: setting('sms_melipayamak_pass'),
        from: setting('sms_melipayamak_from', config.sms.sender), to: phone, text: body, isFlash: false,
      };
      const res = await fetch('https://restapi.payamak.com/v1/send/simple', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      return finish('melipayamak', { ok: data?.IsSuccess === true || data?.Status === 'success', ref: data?.Data?.recid || data?.StrRetStatus, raw: data }, { phone, body });
    },
  },

  smsir: {
    name: 'ایده‌پردازان (sms.ir)',
    fields: [['api_key', 'کلید API'], ['line_number', 'شماره خط']],
    async send({ phone, body }) {
      const key = setting('sms_smsir_key', config.sms.apiKey);
      const res = await fetch('https://api.sms.ir/v1/send/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ mobile: phone, templateId: setting('sms_smsir_template', 100000), parameters: [{ name: 'CODE', value: body }] }),
      });
      const data = await res.json().catch(() => ({}));
      return finish('smsir', { ok: data?.status === 1, ref: data?.data, raw: data }, { phone, body });
    },
  },

  ippanel: {
    name: 'ippanel',
    fields: [['api_key', 'کلید API']],
    async send({ phone, body }) {
      const key = setting('sms_ippanel_key', config.sms.apiKey);
      const res = await fetch('https://api.ippanel.com/v2/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key },
        body: JSON.stringify({ code: setting('sms_ippanel_pattern', ''), sender: setting('sms_ippanel_sender', config.sms.sender), recipient: phone, variable: { 'verification-code': body } }),
      });
      const data = await res.json().catch(() => ({}));
      return finish('ippanel', { ok: data?.status === 'success', ref: data?.data?.message_id, raw: data }, { phone, body });
    },
  },

  mediana: {
    name: 'مدیانا',
    fields: [['api_key', 'کلید API'], ['sender', 'شماره ارسال‌کننده']],
    async send({ phone, body }) {
      const key = setting('sms_mediana_key', config.sms.apiKey);
      const res = await fetch('https://api2.ippanel.com/api/v1/sms/send/webservice/single', {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key },
        body: JSON.stringify({ recipient: [phone], sender: setting('sms_mediana_sender', config.sms.sender), message: body }),
      });
      const data = await res.json().catch(() => ({}));
      return finish('mediana', { ok: data?.status === 'success', ref: data?.data?.message_id, raw: data }, { phone, body });
    },
  },
};

async function doFetch(provider, url, ctx) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    let data = {}; try { data = JSON.parse(text); } catch { data = { text }; }
    const ok = res.ok && (data.return?.status === 200 || data.status === 'success' || data.return_status === 'OK' || res.ok);
    return finish(provider, { ok, ref: data.return?.message_id || data.entries?.messageid || data.data, raw: data }, ctx);
  } catch (e) {
    return finish(provider, { ok: false, error: e.message }, ctx);
  }
}

function finish(provider, result, ctx) {
  logSms({ provider, phone: ctx.phone, body: ctx.body, status: result.ok ? 'sent' : 'failed', response: JSON.stringify(result.raw || result.error || result) });
  return result;
}

function logSms({ provider, phone, body, template = null, status = 'sent', response = '' }) {
  try {
    insert('sms_logs', { provider, phone, body, template, status, response, created_at: now() });
  } catch { /* ignore */ }
}

/* ---------------- رابط عمومی ---------------- */

async function send({ phone, body, template = null, params = {} }) {
  const driverName = setting('sms_driver', config.sms.driver) || 'mock';
  const driver = drivers[driverName] || drivers.mock;
  const enabled = setting('sms_enabled', '1') !== '0';
  if (!enabled) return { ok: false, skipped: true, reason: 'sms disabled' };
  try {
    return await driver.send({ phone, body, template, params });
  } catch (e) {
    logSms({ provider: driverName, phone, body, status: 'failed', response: e.message });
    return { ok: false, error: e.message };
  }
}

/** ارسال کد یکبار مصرف */
async function sendOtp(phone, code) {
  const tpl = setting('sms_otp_template', '');
  const body = tpl ? tpl.replace(/\{code\}/g, code).replace(/\{site\}/g, setting('site_name', 'بالی‌وو'))
    : `${setting('site_name', 'بالی‌وو')}\nکد ورود: ${toPersianDigits(code)}\nاین کد ${toPersianDigits(setting('otp_ttl', 2))} دقیقه معتبر است.`;
  return send({ phone, body, template: tpl || null, params: { token: code } });
}

function listDrivers() {
  return Object.entries(drivers).map(([key, d]) => ({ key, name: d.name, fields: d.fields }));
}
function logs(limit = 100) { return all('SELECT * FROM sms_logs ORDER BY id DESC LIMIT @l', { l: limit }); }

module.exports = { send, sendOtp, listDrivers, logs, drivers };
