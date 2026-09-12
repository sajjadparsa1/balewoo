'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const ROOT = path.join(__dirname, '..');

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  baseUrl: (process.env.APP_URL || '').replace(/\/$/, ''),
  secret: process.env.APP_KEY || 'balewoo-dev-secret-change-me',
  sessionName: 'balewoo.sid',
  dataDir: process.env.DATA_DIR || path.join(ROOT, 'data'),
  uploadDir: process.env.UPLOAD_DIR || path.join(ROOT, 'src', 'public', 'uploads'),
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB || '12', 10),
  viewsDir: path.join(ROOT, 'src', 'views'),
  publicDir: path.join(ROOT, 'src', 'public'),
  trustProxy: process.env.TRUST_PROXY !== 'false',
  sms: {
    driver: process.env.SMS_DRIVER || 'mock',   // mock | kavenegar | ghasedak | melipayamak | smsir | ippanel | mediana
    apiKey: process.env.SMS_API_KEY || '',
    sender: process.env.SMS_SENDER || 'BALEWOO',
  },
  payment: {
    driver: process.env.PAY_DRIVER || 'sandbox', // sandbox = همه درگاه‌ها شبیه‌سازی
    sandbox: process.env.PAY_SANDBOX !== 'false',
  },
  map: {
    provider: process.env.MAP_PROVIDER || 'neshan',
    apiKey: process.env.NESHAN_API_KEY || '',
    defaultCenter: { lat: 35.7448, lng: 51.3753 }, // تهران
  },
  otp: {
    length: 5,
    ttlSeconds: 120,
    maxAttempts: 5,
    devFixedCode: process.env.OTP_FIXED || '', // در حالت توسعه می‌توان کد ثابت گذاشت
  },
  seed: {
    adminPhone: process.env.SEED_ADMIN_PHONE || '09999999999',
    adminPassword: process.env.SEED_ADMIN_PASS || '12345678',
    sellerPhone: process.env.SEED_SELLER_PHONE || '09121111111',
    customerPhone: process.env.SEED_CUSTOMER_PHONE || '09122222222',
  },
};

module.exports = config;
