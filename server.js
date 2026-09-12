'use strict';
const config = require('./src/config');
const { createApp } = require('./src/app');

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  console.log('');
  console.log('  ┌───────────────────────────────────────────────┐');
  console.log('  │   Balewoo Shop — اسکریپت فروشگاهی بالی‌وو       │');
  console.log('  └───────────────────────────────────────────────┘');
  console.log(`  ▸ محیط:      ${config.env}`);
  console.log(`  ▸ آدرس:      http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  console.log(`  ▸ پایگاه‌داده: ${require('./src/db').DB_FILE}`);
  console.log(`  ▸ پیامک:     ${config.sms.driver}`);
  console.log(`  ▸ پرداخت:    ${config.payment.sandbox ? 'sandbox (شبیه‌ساز)' : 'واقعی'}`);
  console.log('');
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));

module.exports = server;
