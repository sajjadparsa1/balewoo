'use strict';
/**
 * ساخت تصاویر پایه (SVG) — لوگو، فاوآیکون، تصویر پیش‌فرض اشتراک‌گذاری،
 * جای‌نگهدار محصول و آیکون دسته‌بندی‌های نمونه.
 * اجرا: npm run assets
 */
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const { slugify } = require('../src/core/utils');

const IMG = path.join(config.publicDir, 'img');
const CAT_DIR = path.join(IMG, 'category-icons');
const ICONS = path.join(__dirname, '..', 'src', 'views', 'partials', 'icons.ejs');

const BRAND = '#4f46e5';
const ACCENT = '#0ea5e9';

/** دسته‌بندی‌های سطح اول نمونه — باید با src/db/seed.js هم‌خوان باشد */
const CATEGORIES = [
  ['موبایل و تبلت', 'smartphone'],
  ['کالای دیجیتال', 'monitor'],
  ['خانه و آشپزخانه', 'home'],
  ['مد و پوشاک', 'shirt'],
  ['آرایشی و بهداشتی', 'sparkles'],
  ['خودرو و موتورسیکلت', 'car'],
  ['ابزارآلات', 'wrench'],
  ['سوپرمارکت', 'shopping-basket'],
  ['ورزش و سفر', 'activity'],
  ['کتاب و لوازم تحریر', 'book'],
];

/** محتوای داخلی یک نماد را از فایل آیکون‌ها بیرون می‌کشد */
function symbolInner(name) {
  const src = fs.readFileSync(ICONS, 'utf8');
  const re = new RegExp(`<symbol id="i-${name}"[^>]*>([\\s\\S]*?)</symbol>`);
  const m = src.match(re);
  return m ? m[1] : '<circle cx="12" cy="12" r="8"/>';
}

function write(rel, content) {
  const file = path.join(IMG, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  return rel;
}

/** نشان تجاری: یک «سبد/جعبه» ساده با حرف ب */
function mark(color1, color2) {
  return `<g>
<defs><linearGradient id="mk" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${color1}"/><stop offset="100%" stop-color="${color2}"/></linearGradient></defs>
<rect x="1" y="1" width="30" height="30" rx="9" fill="url(#mk)"/>
<path d="M9 12.5h14l-1.6 9.2a2 2 0 0 1-2 1.7h-6.8a2 2 0 0 1-2-1.7L9 12.5z" fill="none" stroke="#fff" stroke-width="1.9" stroke-linejoin="round"/>
<path d="M12.2 12.5 16 5.6l3.8 6.9" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
</g>`;
}

function logoSvg(dark) {
  const text = dark ? '#ffffff' : '#1f2937';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="56" viewBox="0 0 220 56">
<g transform="translate(180,12)">${mark(BRAND, ACCENT)}</g>
<g font-family="Vazirmatn, Tahoma, sans-serif" direction="rtl" text-anchor="end">
<text x="168" y="30" font-size="22" font-weight="700" fill="${text}">بالی‌وو</text>
<text x="168" y="46" font-size="11" fill="${dark ? '#c7d2fe' : '#6b7280'}">فروشگاه اینترنتی</text>
</g>
</svg>`;
}

function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32">${mark(BRAND, ACCENT)}</svg>`;
}

function ogSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${BRAND}"/><stop offset="100%" stop-color="#7c3aed"/></linearGradient>
<radialGradient id="gl" cx="78%" cy="24%" r="52%"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="1200" height="630" fill="url(#bg)"/>
<rect width="1200" height="630" fill="url(#gl)"/>
<circle cx="120" cy="560" r="190" fill="#ffffff" opacity="0.06"/>
<circle cx="1090" cy="90" r="150" fill="#ffffff" opacity="0.07"/>
<g transform="translate(84,84) scale(3.2)">${mark('#ffffff', '#c7d2fe')}</g>
<g font-family="Vazirmatn, Tahoma, sans-serif" direction="rtl">
<text x="1116" y="300" text-anchor="end" font-size="72" font-weight="700" fill="#ffffff">بالی‌وو شاپ</text>
<text x="1116" y="368" text-anchor="end" font-size="34" fill="#e0e7ff">فروشگاه اینترنتی چند فروشنده</text>
<text x="1116" y="440" text-anchor="end" font-size="26" fill="#c7d2fe">خرید امن · ارسال سریع · باشگاه مشتریان · همکاری در فروش</text>
</g>
</svg>`;
}

function productPlaceholderSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
<defs><linearGradient id="p" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f8fafc"/><stop offset="100%" stop-color="#eef2ff"/></linearGradient></defs>
<rect width="640" height="640" fill="url(#p)"/>
<g fill="none" stroke="#a5b4fc" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" transform="translate(232,214)">
<path d="M14 52h148l-16 108a18 18 0 0 1-18 15H48a18 18 0 0 1-18-15L14 52z"/>
<path d="M58 52 88 8l30 44"/>
<path d="M118 52 148 8"/>
</g>
<g font-family="Vazirmatn, Tahoma, sans-serif" text-anchor="middle" direction="rtl">
<text x="320" y="470" font-size="30" font-weight="700" fill="#6366f1">تصویر محصول</text>
<text x="320" y="512" font-size="20" fill="#94a3b8">به‌زودی بارگذاری می‌شود</text>
</g>
</svg>`;
}

function categoryIconSvg(name, icon, i) {
  const palettes = [['#eef2ff', BRAND], ['#ecfeff', '#0891b2'], ['#f0fdf4', '#16a34a'], ['#fffbeb', '#d97706'],
    ['#fdf2f8', '#db2777'], ['#f5f3ff', '#7c3aed'], ['#fff7ed', '#ea580c'], ['#f0f9ff', '#0284c7'],
    ['#fef2f2', '#dc2626'], ['#f8fafc', '#475569']];
  const [bg, fg] = palettes[i % palettes.length];
  const safe = String(name).replace(/[<>&]/g, '').slice(0, 22);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
<defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${bg}"/><stop offset="100%" stop-color="#ffffff"/></linearGradient></defs>
<rect width="320" height="320" rx="28" fill="url(#c)"/>
<circle cx="160" cy="132" r="74" fill="${fg}" opacity="0.10"/>
<g transform="translate(112,84) scale(4)" fill="none" stroke="${fg}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${symbolInner(icon)}</g>
<g font-family="Vazirmatn, Tahoma, sans-serif" text-anchor="middle" direction="rtl">
<text x="160" y="252" font-size="23" font-weight="700" fill="${fg}">${safe}</text>
</g>
</svg>`;
}

function run() {
  const written = [];
  written.push(write('logo.svg', logoSvg(false)));
  written.push(write('logo-dark.svg', logoSvg(true)));
  written.push(write('favicon.svg', faviconSvg()));
  written.push(write('og-default.svg', ogSvg()));
  written.push(write('placeholder-product.svg', productPlaceholderSvg()));
  CATEGORIES.forEach(([name, icon], i) => {
    written.push(write(path.join('category-icons', `${slugify(name)}.svg`), categoryIconSvg(name, icon, i)));
  });
  console.log(`✓ ${written.length} تصویر SVG ساخته شد در ${path.relative(process.cwd(), IMG)}`);
  written.forEach((f) => console.log('  -', f));
}

if (require.main === module) run();
module.exports = { run };
