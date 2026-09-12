'use strict';
const fs = require('fs');
const path = require('path');
const { db, all, get, insert, update, run, setSetting, setting, jstringify, migrate } = require('./index');
const { now, slugify, randomCode, randomDigits, normalizePhone, numberFormat, daysFromNow } = require('../core/utils');
const auth = require('../core/auth');
const config = require('../config');
const catalog = require('../core/catalog');

/**
 * داده‌های نمونه — همه محتوا، نام‌ها و تصاویر به‌صورت مستقل تولید می‌شوند.
 * تصاویر: SVG تولیدشده در public/img/seed
 */

const SEED_IMG_DIR = path.join(config.publicDir, 'img', 'seed');

/* ---------------- تولید تصویر SVG ---------------- */

const PALETTES = [
  ['#eef2ff', '#4f46e5'], ['#ecfeff', '#0891b2'], ['#fef2f2', '#dc2626'], ['#f0fdf4', '#16a34a'],
  ['#fffbeb', '#d97706'], ['#fdf2f8', '#db2777'], ['#f5f3ff', '#7c3aed'], ['#f0f9ff', '#0284c7'],
  ['#fff7ed', '#ea580c'], ['#f8fafc', '#475569'],
];

function svgImage(label, sub = '', i = 0, w = 640, h = 640) {
  const [bg, fg] = PALETTES[i % PALETTES.length];
  const safe = String(label).replace(/[<>&]/g, '').slice(0, 26);
  const safeSub = String(sub).replace(/[<>&]/g, '').slice(0, 30);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${bg}"/><stop offset="100%" stop-color="#ffffff"/></linearGradient>
<radialGradient id="glow" cx="50%" cy="42%" r="42%"><stop offset="0%" stop-color="${fg}" stop-opacity="0.22"/><stop offset="100%" stop-color="${fg}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="100%" height="100%" fill="url(#bg)"/>
<circle cx="${w / 2}" cy="${h * 0.42}" r="${w * 0.3}" fill="url(#glow)"/>
<g stroke="${fg}" stroke-opacity="0.14" stroke-width="1">
<path d="M0 ${h * 0.78} H${w}"/><path d="M0 ${h * 0.82} H${w}"/>
</g>
<g font-family="Tahoma, 'Segoe UI', sans-serif" text-anchor="middle" direction="rtl">
<text x="50%" y="46%" font-size="${Math.round(w / 20)}" font-weight="700" fill="${fg}">${safe}</text>
<text x="50%" y="56%" font-size="${Math.round(w / 38)}" fill="${fg}" opacity="0.6">${safeSub}</text>
</g>
<g opacity="0.5">
<rect x="${w * 0.06}" y="${h * 0.88}" width="${w * 0.18}" height="6" rx="3" fill="${fg}" opacity="0.25"/>
</g>
</svg>`;
}

function writeSeedImage(name, label, sub, i, w = 640, h = 640) {
  fs.mkdirSync(SEED_IMG_DIR, { recursive: true });
  const url = `/img/seed/${name}`;
  fs.writeFileSync(path.join(SEED_IMG_DIR, name), svgImage(label, sub, i, w, h), 'utf8');
  return url;
}

/* ---------------- داده‌های پایه ---------------- */

const CATEGORIES = [
  {
    name: 'موبایل و تبلت', icon: 'smartphone', children: [
      { name: 'گوشی موبایل', children: [{ name: 'گوشی سامسونگ' }, { name: 'گوشی اپل' }, { name: 'گوشی شیائومی' }, { name: 'گوشی اقتصادی' }] },
      { name: 'تبلت' },
      { name: 'لوازم جانبی موبایل', children: [{ name: 'قاب و کاور' }, { name: 'شارژر و کابل' }, { name: 'پاوربانک' }, { name: 'گلس محافظ' }] },
      { name: 'ساعت هوشمند' },
      { name: 'هدفون و هندزفری' },
    ],
  },
  {
    name: 'کالای دیجیتال', icon: 'monitor', children: [
      { name: 'لپ تاپ', children: [{ name: 'لپ تاپ اداری' }, { name: 'لپ تاپ گیمینگ' }, { name: 'لپ تاپ دانشجویی' }] },
      { name: 'قطعات کامپیوتر', children: [{ name: 'پردازنده' }, { name: 'کارت گرافیک' }, { name: 'حافظه داخلی' }, { name: 'مادربورد' }] },
      { name: 'لوازم جانبی کامپیوتر', children: [{ name: 'ماوس' }, { name: 'کیبورد' }, { name: 'مانیتور' }, { name: 'وبکم' }] },
      { name: 'دوربین', children: [{ name: 'دوربین عکاسی' }, { name: 'دوربین ورزشی' }, { name: 'لنز' }] },
    ],
  },
  {
    name: 'خانه و آشپزخانه', icon: 'home', children: [
      { name: 'لوازم آشپزخانه', children: [{ name: 'ظروف پخت و پز' }, { name: 'ابزار آشپزخانه' }, { name: 'ماشین ظرفشویی' }] },
      { name: 'دکوراسیون', children: [{ name: 'آباژور و چراغ' }, { name: 'فرش و موکت' }, { name: 'تابلو و ساعت دیواری' }] },
      { name: 'خواب و حمام', children: [{ name: 'سرویس خواب' }, { name: 'حوله' }, { name: 'ملحفه و روتختی' }] },
    ],
  },
  {
    name: 'مد و پوشاک', icon: 'shirt', children: [
      { name: 'پوشاک مردانه', children: [{ name: 'پیراهن مردانه' }, { name: 'شلوار مردانه' }, { name: 'کت و شلوار' }] },
      { name: 'پوشاک زنانه', children: [{ name: 'شومیز' }, { name: 'مانتو' }, { name: 'دامن' }] },
      { name: 'کفش و کیف', children: [{ name: 'کفش مردانه' }, { name: 'کفش زنانه' }, { name: 'کیف دستی' }] },
      { name: 'اکسسوری', children: [{ name: 'ساعت مچی' }, { name: 'عینک آفتابی' }, { name: 'کمربند' }] },
    ],
  },
  {
    name: 'آرایشی و بهداشتی', icon: 'sparkles', children: [
      { name: 'آرایش صورت', children: [{ name: 'رژ لب' }, { name: 'کرم پودر' }, { name: 'ریمل' }] },
      { name: 'مراقبت پوست', children: [{ name: 'ضد آفتاب' }, { name: 'آبرسان' }, { name: 'ماسک صورت' }] },
      { name: 'بهداشت فردی', children: [{ name: 'شامپو' }, { name: 'مسواک و خمیردندان' }] },
    ],
  },
  {
    name: 'خودرو و موتورسیکلت', icon: 'car', children: [
      { name: 'لوازم یدکی', children: [{ name: 'کمپرسور و کولر' }, { name: 'سیستم ترمز' }, { name: 'فیلترها' }] },
      { name: 'لوازم جانبی خودرو', children: [{ name: 'ضبط و پخش' }, { name: 'روکش صندلی' }, { name: 'کفپوش' }] },
      { name: 'روغن و ضد یخ' },
    ],
  },
  {
    name: 'ابزارآلات', icon: 'wrench', children: [
      { name: 'ابزار برقی', children: [{ name: 'دریل' }, { name: 'فرز و سنگ' }, { name: 'موتور برق' }] },
      { name: 'ابزار دستی', children: [{ name: 'آچار و پیچ‌گوشتی' }, { name: 'جعبه ابزار' }] },
      { name: 'ایمنی و کار' },
    ],
  },
  {
    name: 'سوپرمارکت', icon: 'shopping-basket', children: [
      { name: 'خوردنی', children: [{ name: 'میوه و سبزیجات' }, { name: 'لبنیات' }, { name: 'تنقلات' }] },
      { name: 'نوشیدنی', children: [{ name: 'چای و دمنوش' }, { name: 'آبمیوه' }] },
      { name: 'شوینده و بهداشتی' },
    ],
  },
  {
    name: 'ورزش و سفر', icon: 'activity', children: [
      { name: 'لوازم ورزشی', children: [{ name: 'دوچرخه' }, { name: 'وزنه و دمبل' }, { name: 'تجهیزات کوهنوردی' }] },
      { name: 'چمدان و ساک' },
    ],
  },
  {
    name: 'کتاب و لوازم تحریر', icon: 'book', children: [
      { name: 'کتاب', children: [{ name: 'رمان' }, { name: 'کسب و کار' }, { name: 'کودک و نوجوان' }] },
      { name: 'لوازم تحریر' },
    ],
  },
];

const BRANDS = [
  ['سامسونگ', 'Samsung'], ['اپل', 'Apple'], ['شیائومی', 'Xiaomi'], ['سونی', 'Sony'], ['ال‌جی', 'LG'],
  ['رونیکس', 'Ronix'], ['بوش', 'Bosch'], ['فیلیپس', 'Philips'], ['نایکی', 'Nike'], ['آدیداس', 'Adidas'],
  ['لورآل', "L'Oreal"], ['نیوا', 'Nivea'], ['ایسوس', 'ASUS'], ['لنوو', 'Lenovo'], ['هواوی', 'Huawei'],
  ['کنزالکس', 'Kanzalex'], ['پارس خزر', 'Pars Khazar'], ['بیمه ایران', '—'],
];

const ATTRIBUTES = [
  { name: 'رنگ', type: 'color', is_variant: 1, is_filter: 1, is_spec: 1, options: [['مشکی', '#111827'], ['سفید', '#f9fafb'], ['آبی', '#2563eb'], ['قرمز', '#dc2626'], ['سبز', '#16a34a'], ['فیروزه‌ای', '#06b6d4'], ['طلایی', '#d4af37'], ['نقره‌ای', '#9ca3af'], ['صورتی', '#ec4899']] },
  { name: 'حافظه داخلی', type: 'select', is_variant: 1, is_filter: 1, is_spec: 1, options: [['۶۴ گیگابایت'], ['۱۲۸ گیگابایت'], ['۲۵۶ گیگابایت'], ['۵۱۲ گیگابایت'], ['۱ ترابایت']] },
  { name: 'رم', type: 'select', is_variant: 1, is_filter: 1, is_spec: 1, options: [['۴ گیگابایت'], ['۶ گیگابایت'], ['۸ گیگابایت'], ['۱۲ گیگابایت'], ['۱۶ گیگابایت']] },
  { name: 'سایز', type: 'select', is_variant: 1, is_filter: 1, is_spec: 1, options: [['S'], ['M'], ['L'], ['XL'], ['XXL'], ['۳۸'], ['۳۹'], ['۴۰'], ['۴۱'], ['۴۲'], ['۴۳'], ['۴۴']] },
  { name: 'گارانتی', type: 'select', is_variant: 1, is_filter: 0, is_spec: 0, options: [['۱۸ ماه شرکتی'], ['۲۴ ماه سام سرویس'], ['گارانتی اصالت و سلامت فیزیکی'], ['بدون گارانتی']] },
  { name: 'برند', type: 'select', is_filter: 1, is_spec: 1, options: [] },
  { name: 'وضعیت کالا', type: 'select', is_filter: 1, is_spec: 1, options: [['آکبند'], ['در حد نو'], ['کارکرده']] },
  { name: 'کشور سازنده', type: 'select', is_filter: 1, is_spec: 1, options: [['چین'], ['ویتنام'], ['کره جنوبی'], ['آلمان'], ['ترکیه'], ['ایران']] },
  { name: 'گارانتی بازگشت', type: 'bool', is_filter: 1, is_spec: 1, options: [['دارد'], ['ندارد']] },
];

/* ---------------- محصولات ---------------- */

const PRODUCTS = [
  { title: 'گوشی موبایل سامسونگ مدل Galaxy A56 دو سیم کارت ظرفیت ۲۵۶ گیگابایت', cat: 'گوشی سامسونگ', brand: 'سامسونگ', price: 24500000, old: 27900000, stock: 34, sold: 128, special: 1, colors: ['مشکی', 'آبی', 'سبز'], memory: ['۱۲۸ گیگابایت', '۲۵۶ گیگابایت'], specs: [['ابعاد', '۱۶۲.۲ × ۷۷.۵ × ۷.۴ میلی‌متر'], ['وزن', '۱۹۸ گرم'], ['صفحه‌نمایش', '۶.۷ اینچ Super AMOLED'], ['دوربین اصلی', '۵۰ + ۱۲ + ۵ مگاپیکسل'], ['باتری', '۵۰۰۰ میلی‌آمپر ساعت'], ['سیستم‌عامل', 'Android 15']] },
  { title: 'گوشی موبایل اپل مدل iPhone 15 پرو مکس ظرفیت ۲۵۶ گیگابایت', cat: 'گوشی اپل', brand: 'اپل', price: 98500000, old: 0, stock: 8, sold: 42, colors: ['طلایی', 'مشکی', 'نقره‌ای'], memory: ['۲۵۶ گیگابایت', '۵۱۲ گیگابایت'], specs: [['ابعاد', '۱۵۹.۹ × ۷۶.۷ × ۸.۳ میلی‌متر'], ['وزن', '۲۲۱ گرم'], ['صفحه‌نمایش', '۶.۷ اینچ Super Retina XDR'], ['پردازنده', 'Apple A17 Pro'], ['دوربین اصلی', '۴۸ + ۱۲ + ۱۲ مگاپیکسل'], ['باتری', '۴۴۴۱ میلی‌آمپر ساعت']] },
  { title: 'گوشی موبایل شیائومی مدل Redmi Note 13 Pro ظرفیت ۲۵۶ گیگابایت', cat: 'گوشی شیائومی', brand: 'شیائومی', price: 14200000, old: 15800000, stock: 62, sold: 310, special: 1, colors: ['مشکی', 'بنفش', 'آبی'], memory: ['۱۲۸ گیگابایت', '۲۵۶ گیگابایت'], specs: [['صفحه‌نمایش', '۶.۶۷ اینچ AMOLED ۱۲۰ هرتز'], ['دوربین اصلی', '۲۰۰ مگاپیکسل'], ['باتری', '۵۱۰۰ میلی‌آمپر ساعت'], ['شارژ سریع', '۶۷ وات']] },
  { title: 'ساعت هوشمند سامسونگ مدل Galaxy Watch6 Classic ۴۷ میلی‌متر', cat: 'ساعت هوشمند', brand: 'سامسونگ', price: 12850000, old: 14200000, stock: 21, sold: 87, colors: ['مشکی', 'نقره‌ای'], specs: [['ابعاد صفحه', '۴۷ میلی‌متر'], ['جنس بدنه', 'استیل ضدزنگ'], ['مقاومت در برابر آب', '۵ اتمسفر'], ['باتری', '۴۲۵ میلی‌آمپر ساعت'], ['سنسورها', 'ضربان قلب، اکسیژن خون، فشار خون']] },
  { title: 'ساعت هوشمند اپل مدل Watch Series 9 آلومینیومی ۴۵ میلی‌متر', cat: 'ساعت هوشمند', brand: 'اپل', price: 26900000, old: 0, stock: 12, sold: 33, colors: ['قرمز', 'مشکی', 'صورتی'], specs: [['ابعاد صفحه', '۴۵ میلی‌متر'], ['پردازنده', 'Apple S9'], ['صفحه‌نمایش', 'Retina LTPO OLED'], ['مقاومت در برابر آب', '۵۰ متر']] },
  { title: 'لپ تاپ ۱۵.۶ اینچی ایسوس مدل VivoBook 15 X1504', cat: 'لپ تاپ اداری', brand: 'ایسوس', price: 38900000, old: 41500000, stock: 15, sold: 54, colors: ['نقره‌ای', 'مشکی'], specs: [['پردازنده', 'Intel Core i5-1335U'], ['رم', '۱۶ گیگابایت DDR4'], ['حافظه', '۵۱۲ گیگابایت SSD'], ['صفحه‌نمایش', '۱۵.۶ اینچ Full HD'], ['وزن', '۱.۷ کیلوگرم']] },
  { title: 'لپ تاپ گیمینگ ۱۶ اینچی لنوو مدل Legion 5 با گرافیک RTX 4060', cat: 'لپ تاپ گیمینگ', brand: 'لنوو', price: 82500000, old: 0, stock: 6, sold: 18, colors: ['مشکی'], specs: [['پردازنده', 'AMD Ryzen 7 7840HS'], ['کارت گرافیک', 'RTX 4060 ۸ گیگابایت'], ['رم', '۱۶ گیگابایت DDR5'], ['صفحه‌نمایش', '۱۶ اینچ ۱۶۵ هرتز']] },
  { title: 'هدفون بی‌سیم سونی مدل WH-CH720N با حذف نویز فعال', cat: 'هدفون و هندزفری', brand: 'سونی', price: 7250000, old: 8400000, stock: 48, sold: 210, special: 1, colors: ['مشکی', 'آبی', 'سفید'], specs: [['نوع', 'بسته (Over-Ear)'], ['حذف نویز', 'فعال (ANC)'], ['مدت پخش', 'تا ۳۵ ساعت'], ['وزن', '۱۹۲ گرم'], ['اتصال', 'بلوتوث ۵.۲']] },
  { title: 'پاوربانک ۲۰۰۰۰ میلی‌آمپر شیائومی با شارژ سریع ۲۲.۵ وات', cat: 'پاوربانک', brand: 'شیائومی', price: 1450000, old: 1750000, stock: 130, sold: 540, colors: ['مشکی', 'سفید'], specs: [['ظرفیت', '۲۰۰۰۰ میلی‌آمپر ساعت'], ['توان خروجی', '۲۲.۵ وات'], ['تعداد پورت', '۳ خروجی'], ['وزن', '۴۳۰ گرم']] },
  { title: 'مانیتور ۲۷ اینچ ال‌جی مدل 27UP650 4K مناسب طراحی', cat: 'مانیتور', brand: 'ال‌جی', price: 24900000, old: 0, stock: 9, sold: 21, specs: [['اندازه', '۲۷ اینچ'], ['رزولوشن', '3840×2160'], ['نرخ نوسازی', '۶۰ هرتز'], ['پورت', 'HDMI ×2، DisplayPort'], ['پوشش رنگ', '95% DCI-P3']] },
  { title: 'کیبورد مکانیکال گیمینگ ریزر با نورپردازی RGB', cat: 'کیبورد', brand: 'سونی', price: 5890000, old: 6500000, stock: 26, sold: 76, colors: ['مشکی'], specs: [['سوئیچ', 'مکانیکال قرمز'], ['نورپردازی', 'RGB هر کلید'], ['اتصال', 'USB-C جداشدنی']] },
  { title: 'دوربین عکاسی بدون آینه سونی آلفا A7 IV با لنز ۲۸-۷۰', cat: 'دوربین عکاسی', brand: 'سونی', price: 145000000, old: 0, stock: 3, sold: 7, specs: [['سنسور', 'فول‌فریم ۳۳ مگاپیکسل'], ['فیلمبرداری', '4K 60fps'], ['لرزشگیر', '۵ محوره']] },
  { title: 'دریل شارژی رونیکس مدل ۸۵۱۲ با دو باتری و جعبه', cat: 'دریل', brand: 'رونیکس', price: 4350000, old: 4900000, stock: 42, sold: 165, special: 1, specs: [['ولتاژ', '۱۲ ولت'], ['حداکثر گشتاور', '۲۸ نیوتن‌متر'], ['سرعت', '۰-۱۴۰۰ دور در دقیقه'], ['وزن', '۱.۱ کیلوگرم']] },
  { title: 'موتور برق رونیکس مدل ۴۷۹۰ توان ۶.۵ کیلووات', cat: 'موتور برق', brand: 'رونیکس', price: 68500000, old: 72000000, stock: 5, sold: 12, specs: [['توان', '۶.۵ کیلووات'], ['سوخت', 'بنزینی'], ['سیستم استارت', 'الکتریکی']] },
  { title: 'کمپرسور هوا فندکی کنزالکس مدل ۵۴۱۷ مناسب خودرو', cat: 'کمپرسور و کولر', brand: 'کنزالکس', price: 3250000, old: 0, stock: 55, sold: 143, specs: [['فشار حداکثر', '۱۵۰ PSI'], ['ورودی', '۱۲ ولت فندکی'], ['طول شلنگ', '۱ متر']] },
  { title: 'جاروبرقی بوش سری ۸ با کیسه و توان ۲۲۰۰ وات', cat: 'ابزار برقی', brand: 'بوش', price: 18500000, old: 20900000, stock: 18, sold: 62, colors: ['مشکی', 'قرمز'], specs: [['توان', '۲۲۰۰ وات'], ['ظرفیت کیسه', '۵ لیتر'], ['سطح صدا', '۷۲ دسی‌بل']] },
  { title: 'سرویس قابلمه ۱۰ پارچه گرانیتی پارس خزر', cat: 'ظروف پخت و پز', brand: 'پارس خزر', price: 6450000, old: 7200000, stock: 33, sold: 118, colors: ['قرمز', 'مشکی', 'نقره‌ای'], specs: [['تعداد پارچه', '۱۰'], ['جنس', 'آلومینیوم با پوشش گرانیتی'], ['قابل استفاده روی', 'اجاق گاز و القایی']] },
  { title: 'چراغ خواب رومیزی مدرن با نور قابل تنظیم', cat: 'آباژور و چراغ', brand: 'فیلیپس', price: 1890000, old: 0, stock: 70, sold: 205, colors: ['سفید', 'مشکی', 'طلایی'], specs: [['توان', '۹ وات LED'], ['دمای رنگ', '۲۷۰۰ تا ۶۵۰۰ کلوین'], ['تنظیم نور', 'سه حالت']] },
  { title: 'شومیز آستین بلند زنانه السانا مدل ریماس', cat: 'شومیز', brand: 'نایکی', price: 1250000, old: 1650000, stock: 88, sold: 320, special: 1, colors: ['صورتی', 'سفید', 'مشکی', 'سبز'], sizes: ['S', 'M', 'L', 'XL'], specs: [['جنس', 'کرپ درجه یک'], ['آستین', 'بلند'], ['یقه', 'برگردان']] },
  { title: 'کفش ورزشی مردانه نایکی مدل Revolution مناسب دویدن', cat: 'کفش مردانه', brand: 'نایکی', price: 4250000, old: 0, stock: 46, sold: 154, colors: ['مشکی', 'آبی', 'قرمز'], sizes: ['۴۱', '۴۲', '۴۳', '۴۴'], specs: [['زیره', 'فوم سبک'], ['رویه', 'مش تنفس‌پذیر'], ['کاربری', 'دویدن و روزمره']] },
  { title: 'کت و شلوار مردانه دامنی سه دکمه اسلیم فیت', cat: 'کت و شلوار', brand: 'آدیداس', price: 8900000, old: 10500000, stock: 14, sold: 38, colors: ['مشکی', 'سرمه‌ای'], sizes: ['M', 'L', 'XL'], specs: [['جنس', 'فاستونی پشم'], ['برش', 'اسلیم فیت'], ['تعداد دکمه', '۳']] },
  { title: 'رژ لب جامد این‌لی مدل نایت انجل شماره ۶۱۰', cat: 'رژ لب', brand: 'لورآل', price: 425000, old: 520000, stock: 210, sold: 640, colors: ['قرمز', 'صورتی'], specs: [['ماندگاری', '۸ ساعت'], ['بافت', 'مات مخملی'], ['حجم', '۳.۵ گرم']] },
  { title: 'کرم ضد آفتاب نیوا SPF50 مناسب پوست حساس', cat: 'ضد آفتاب', brand: 'نیوا', price: 685000, old: 0, stock: 150, sold: 402, specs: [['SPF', '۵۰+'], ['حجم', '۵۰ میلی‌لیتر'], ['بافت', 'سبک و بدون چربی']] },
  { title: 'ست مراقبت پوست لورآل شامل آبرسان و سرم ویتامین C', cat: 'آبرسان', brand: 'لورآل', price: 2450000, old: 2950000, stock: 60, sold: 178, special: 1, specs: [['اقلام', 'آبرسان ۵۰ml + سرم ۳۰ml'], ['مناسب', 'انواع پوست']] },
  { title: 'دوچرخه کوهستان ۲۷.۵ اینچ با ۲۱ دنده و کمک فنر', cat: 'دوچرخه', brand: 'آدیداس', price: 21500000, old: 0, stock: 7, sold: 16, colors: ['مشکی', 'قرمز'], specs: [['سایز چرخ', '۲۷.۵ اینچ'], ['دنده', '۲۱ سرعته'], ['بدنه', 'آلومینیوم']] },
  { title: 'کوله پشتی کوهنوردی ۵۰ لیتری ضد آب با فریم آلومینیومی', cat: 'تجهیزات کوهنوردی', brand: 'نایکی', price: 3850000, old: 4300000, stock: 29, sold: 94, colors: ['سبز', 'مشکی', 'آبی'], specs: [['حجم', '۵۰ لیتر'], ['وزن', '۱.۴ کیلوگرم'], ['ضد آب', 'بله']] },
  { title: 'کتاب هنر ظریف بی‌خیالی اثر مارک منسون', cat: 'رمان', brand: null, price: 185000, old: 0, stock: 120, sold: 520, specs: [['نویسنده', 'مارک منسون'], ['تعداد صفحات', '۲۲۴'], ['قطع', 'رقعی']] },
  { title: 'کتاب اثر مرکب اثر دارن هاردی نسخه جلد سخت', cat: 'کسب و کار', brand: null, price: 245000, old: 290000, stock: 84, sold: 310, specs: [['نویسنده', 'دارن هاردی'], ['تعداد صفحات', '۳۰۰']] },
  { title: 'چای سیاه قلم ممتاز لاهیجان ۵۰۰ گرمی', cat: 'چای و دمنوش', brand: null, price: 385000, old: 0, stock: 200, sold: 610, specs: [['وزن', '۵۰۰ گرم'], ['نوع', 'قلم ممتاز'], ['برداشت', 'بهاره']] },
  { title: 'روغن زیتون فرابکر ارگانیک ۱ لیتری', cat: 'خوردنی', brand: null, price: 545000, old: 620000, stock: 95, sold: 240, specs: [['حجم', '۱ لیتر'], ['نوع', 'فرابکر'], ['اسیدیته', 'کمتر از ۰.۳']] },
  { title: 'آووکادو کره‌ای الگانس خالص تازه و فوق‌العاده خوشمزه', cat: 'میوه و سبزیجات', brand: null, price: 128000, old: 0, stock: 40, sold: 165, specs: [['واحد', 'کیلوگرم'], ['نوع', 'کره‌ای']] },
  { title: 'پنل دوش حمام فریز شاور مدل TW ست کامل', cat: 'خواب و حمام', brand: 'پارس خزر', price: 9850000, old: 11200000, stock: 11, sold: 27, specs: [['جنس', 'استیل ۳۰۴'], ['تعداد خروجی آب', '۳'], ['گارانتی', '۲ سال']] },
  { title: 'شلوار جین مردانه اسلیم فیت مدل شهری', cat: 'شلوار مردانه', brand: 'آدیداس', price: 1450000, old: 1850000, stock: 76, sold: 240, colors: ['آبی', 'مشکی'], sizes: ['۳۸', '۴۰', '۴۲', '۴۴'], specs: [['جنس', 'جین کشی'], ['برش', 'اسلیم']] },
  { title: 'عینک آفتابی پولاریزه با فریم فلزی سبک', cat: 'عینک آفتابی', brand: 'لورآل', price: 980000, old: 0, stock: 64, sold: 130, colors: ['مشکی', 'طلایی'], specs: [['محافظت', 'UV400'], ['لنز', 'پولاریزه']] },
  { title: 'کیف دستی زنانه چرم طبیعی مدل مجلسی', cat: 'کیف دستی', brand: 'نایکی', price: 3450000, old: 3900000, stock: 22, sold: 58, colors: ['مشکی', 'صورتی', 'نقره‌ای'], specs: [['جنس', 'چرم طبیعی'], ['بند', 'قابل تنظیم']] },
  { title: 'هارد اکسترنال ۲ ترابایت وسترن دیجیتال مدل Elements', cat: 'حافظه داخلی', brand: 'لنوو', price: 4950000, old: 0, stock: 44, sold: 132, specs: [['ظرفیت', '۲ ترابایت'], ['رابط', 'USB 3.0'], ['ابعاد', '۲.۵ اینچ']] },
  { title: 'ماوس گیمینگ بی‌سیم با سنسور ۱۶۰۰۰ DPI', cat: 'ماوس', brand: 'ایسوس', price: 2150000, old: 2500000, stock: 58, sold: 190, colors: ['مشکی', 'سفید'], specs: [['سنسور', '۱۶۰۰۰ DPI'], ['باتری', 'قابل شارژ'], ['کلیدها', '۶']] },
  { title: 'وبکم ۱۰۸۰p با میکروفون داخلی مناسب کلاس آنلاین', cat: 'وبکم', brand: 'هواوی', price: 1350000, old: 0, stock: 0, sold: 88, specs: [['رزولوشن', 'Full HD 1080p'], ['زاویه دید', '۹۰ درجه']] },
  { title: 'شارژر فست ۶۵ وات GaN با سه پورت', cat: 'شارژر و کابل', brand: 'شیائومی', price: 1150000, old: 1350000, stock: 140, sold: 470, colors: ['سفید', 'مشکی'], specs: [['توان', '۶۵ وات'], ['پورت‌ها', 'USB-C ×2 + USB-A'], ['فناوری', 'GaN']] },
  { title: 'قاب سیلیکونی محافظ گوشی با لبه‌های ضربه‌گیر', cat: 'قاب و کاور', brand: 'شیائومی', price: 185000, old: 0, stock: 320, sold: 890, colors: ['مشکی', 'آبی', 'قرمز', 'سبز'], specs: [['جنس', 'سیلیکون'], ['محافظت', 'لبه‌های برجسته']] },
];

const POSTS = [
  { title: 'راهنمای کامل خرید گوشی موبایل در سال ۱۴۰۴', kind: 'text', cat: 'راهنمای خرید', excerpt: 'از پردازنده و صفحه‌نمایش تا دوربین و باتری؛ هر آنچه قبل از خرید گوشی باید بدانید.', mentions: ['گوشی موبایل سامسونگ مدل Galaxy A56', 'گوشی موبایل شیائومی مدل Redmi Note 13 Pro'] },
  { title: 'چطور ساعت هوشمند مناسب خود را انتخاب کنیم؟', kind: 'text', cat: 'راهنمای خرید', excerpt: 'مقایسه پلتفرم‌ها، سنسورهای سلامت و طول عمر باتری در ساعت‌های هوشمند.', mentions: ['ساعت هوشمند سامسونگ مدل Galaxy Watch6 Classic'] },
  { title: 'ویدیو: بررسی لپ تاپ گیمینگ و انتخاب کارت گرافیک', kind: 'video', cat: 'بررسی محصول', excerpt: 'در این ویدیو تفاوت کارت‌های گرافیک میان‌رده و پرچمدار را بررسی می‌کنیم.', mentions: ['لپ تاپ گیمینگ ۱۶ اینچی لنوو'] },
  { title: '۱۰ ترفند برای افزایش عمر باتری لپ تاپ', kind: 'text', cat: 'ترفندها', excerpt: 'تنظیمات ساده‌ای که می‌توانند تا ۴۰ درصد عمر باتری لپ تاپ شما را افزایش دهند.', mentions: ['لپ تاپ ۱۵.۶ اینچی ایسوس'] },
  { title: 'پادکست: آینده فروشگاه‌های اینترنتی در ایران', kind: 'podcast', cat: 'پادکست', excerpt: 'گفتگویی درباره لجستیک، اعتماد مشتری و نقش فروشندگان خرد در بازار آنلاین.', mentions: [] },
  { title: 'روتین مراقبت پوست در تابستان؛ ساده و مؤثر', kind: 'text', cat: 'سبک زندگی', excerpt: 'سه مرحله کلیدی برای حفظ سلامت پوست در روزهای گرم و آفتابی.', mentions: ['کرم ضد آفتاب نیوا', 'ست مراقبت پوست لورآل'] },
  { title: 'ابزار برقی بخریم یا دستی؟ راهنمای کارگاه خانگی', kind: 'text', cat: 'راهنمای خرید', excerpt: 'برای کارهای خانگی به کدام ابزارها واقعاً نیاز دارید و کدام‌ها هزینه اضافی است.', mentions: ['دریل شارژی رونیکس مدل ۸۵۱۲'] },
  { title: 'دوچرخه‌سواری شهری؛ تجهیزات ضروری و نکات ایمنی', kind: 'text', cat: 'سبک زندگی', excerpt: 'از کلاه ایمنی تا نور و قفل؛ فهرست کامل تجهیزاتی که نباید فراموش کنید.', mentions: ['دوچرخه کوهستان ۲۷.۵ اینچ'] },
];

const PAGES = [
  { title: 'درباره ما', slug: 'about-us', body: '<h2>داستان ما</h2><p>بالی‌وو با هدف ساده‌سازی خرید آنلاین و ایجاد بستری منصفانه برای فروشندگان ایرانی ساخته شده است. ما باور داریم یک فروشگاه خوب باید سه ویژگی داشته باشد: <strong>شفافیت در قیمت</strong>، <strong>سرعت در ارسال</strong> و <strong>پاسخگویی واقعی</strong>.</p><p>در بالی‌وو هر فروشنده یک صفحه اختصاصی دارد، عملکرد او بر اساس نرخ ارسال موفق و مرجوعی سنجیده می‌شود و مشتریان می‌توانند پیش از خرید، دیدگاه خریداران قبلی را بخوانند.</p><h3>آنچه ما را متفاوت می‌کند</h3><ul><li>پشتیبانی چند فروشندگی با سیستم کمیسیون شفاف</li><li>باشگاه مشتریان با سه سطح طلایی، نقره‌ای و برنزی</li><li>همکاری در فروش با پورسانت سه‌سطحی</li><li>کیف پول داخلی و ثبت کامل تراکنش‌ها</li><li>سیستم تیکتینگ برای ارتباط مستقیم با فروشندگان</li></ul>' },
  { title: 'قوانین و شرایط', slug: 'terms', body: '<h2>شرایط استفاده از خدمات</h2><p>ورود و استفاده از بالی‌وو به منزله پذیرش این شرایط است. لطفاً پیش از ثبت سفارش این صفحه را مطالعه کنید.</p><h3>۱. حساب کاربری</h3><p>هر کاربر مسئول حفظ محرمانگی اطلاعات حساب خود است. ورود با شماره موبایل و کد یکبار مصرف انجام می‌شود و امکان تعیین گذرواژه نیز وجود دارد.</p><h3>۲. ثبت سفارش و پرداخت</h3><p>سفارش پس از پرداخت موفق یا ثبت رسید کارت به کارت وارد چرخه پردازش می‌شود. در صورت ناموجود شدن کالا، مبلغ به کیف پول کاربر بازگردانده می‌شود.</p><h3>۳. ارسال و مرجوعی</h3><p>هزینه ارسال بر اساس روش انتخابی محاسبه می‌شود. مرجوعی کالا تا ۷ روز پس از تحویل و تنها در صورت حفظ شرایط اولیه کالا امکان‌پذیر است.</p><h3>۴. مسئولیت فروشندگان</h3><p>فروشندگان مسئول اصالت کالا، قیمت‌گذاری و زمان‌بندی ارسال هستند. در صورت تخلف، حساب فروشنده موقتاً مسدود می‌شود.</p>' },
  { title: 'حریم خصوصی', slug: 'privacy', body: '<h2>حریم خصوصی کاربران</h2><p>ما تنها داده‌هایی را جمع‌آوری می‌کنیم که برای پردازش سفارش و پشتیبانی ضروری است.</p><ul><li>شماره موبایل برای ورود و اطلاع‌رسانی سفارش</li><li>نشانی برای ارسال مرسوله</li><li>اطلاعات پرداخت صرفاً از طریق درگاه بانکی و بدون ذخیره شماره کارت</li></ul><p>کاربران می‌توانند در هر زمان از بخش «نشست‌های فعال» دستگاه‌های واردشده را مشاهده و خاتمه دهند.</p>' },
  { title: 'راهنمای خرید', slug: 'how-to-buy', body: '<h2>چطور خرید کنیم؟</h2><ol><li>محصول مورد نظر را از صفحه محصول انتخاب و به سبد خرید اضافه کنید.</li><li>نشانی دریافت و روش ارسال را انتخاب کنید.</li><li>روش پرداخت را تعیین کنید: درگاه بانکی، کیف پول، کارت به کارت یا پرداخت در محل.</li><li>پس از پرداخت، کد رهگیری سفارش از طریق پیامک و اعلان داخلی ارسال می‌شود.</li></ol>' },
];

const FAQS = [
  ['چطور سفارش خود را پیگیری کنم؟', 'از بخش «سفارش‌ها» در پنل کاربری می‌توانید وضعیت لحظه‌ای سفارش، کد رهگیری پستی و تاریخچه تغییر وضعیت را مشاهده کنید. همچنین در هر مرحله برای شما اعلان داخلی و پیامک ارسال می‌شود.', 'سفارشات'],
  ['امکان پرداخت در محل وجود دارد؟', 'بله. اگر روش ارسال انتخابی شما از پرداخت در محل پشتیبانی کند، در مرحله پرداخت گزینه «پرداخت در محل» فعال می‌شود. برای سفارش‌های بالای مبلغ مشخص، پرداخت آنلاین الزامی است.', 'پرداخت'],
  ['کد تخفیف را از کجا بگیریم؟', 'کدهای تخفیف از طریق صفحه نخست، اعلان‌های داخلی و پیامک اطلاع‌رسانی می‌شوند. در سبد خرید می‌توانید کد را وارد کنید تا تخفیف اعمال شود.', 'تخفیف‌ها'],
  ['شرایط مرجوع کردن کالا چیست؟', 'تا ۷ روز پس از تحویل، در صورتی که کالا در شرایط اولیه باشد (پلمپ باز نشده، برچسب‌ها سالم)، امکان مرجوعی وجود دارد. مبلغ پس از تایید به کیف پول شما بازگردانده می‌شود.', 'مرجوعی'],
  ['چطور فروشنده شوم؟', 'از صفحه «فروشنده شوید» فرم ثبت‌نام را کامل کنید و مدارک لازم را بارگذاری نمایید. پس از بررسی کارشناسان (معمولاً کمتر از ۴۸ ساعت)، پنل فروشندگی برای شما فعال می‌شود.', 'فروشندگان'],
  ['کمیسیون فروش چقدر است؟', 'کمیسیون پیش‌فرض فروشگاه ۵ درصد از مبلغ فروش هر کالا است. این درصد برای هر فروشنده به‌صورت جداگانه توسط مدیر قابل تنظیم است.', 'فروشندگان'],
  ['امتیاز باشگاه مشتریان چه کاربردی دارد؟', 'به ازای هر خرید امتیاز دریافت می‌کنید. امتیازها شما را در سه سطح برنزی، نقره‌ای و طلایی قرار می‌دهد و می‌توانید بخشی از مبلغ خرید بعدی را با امتیاز پرداخت کنید.', 'باشگاه مشتریان'],
  ['همکاری در فروش چطور کار می‌کند؟', 'با فعال‌سازی همکاری در فروش، لینک اختصاصی هر محصول را دریافت می‌کنید. اگر خریدی از طریق لینک شما انجام شود، پورسانت تعیین‌شده بر اساس سطح شما به کیف پول اضافه می‌شود.', 'همکاری در فروش'],
  ['کیف پول را چطور شارژ کنم؟', 'از پنل کاربری > کیف پول، مبلغ دلخواه را وارد و از طریق درگاه بانکی پرداخت کنید. مبلغ بلافاصله به کیف پول اضافه می‌شود.', 'پرداخت'],
  ['امکان خرید اقساطی وجود دارد؟', 'بله. برای سفارش‌های بالای مبلغ مشخص، درگاه‌های اقساطی مانند اسنپ‌پی و ترب‌پی فعال است و تعداد اقساط و مبلغ هر قسط در صفحه محصول نمایش داده می‌شود.', 'پرداخت'],
];

const FORMS = [
  { title: 'تماس با ما', slug: 'contact-us', description: 'سوال، پیشنهاد یا انتقادی دارید؟ برای ما بنویسید؛ کارشناسان در کمتر از ۲۴ ساعت پاسخ می‌دهند.', fields: [{ name: 'name', label: 'نام و نام خانوادگی', type: 'text', required: true }, { name: 'phone', label: 'شماره تماس', type: 'tel', required: true }, { name: 'email', label: 'ایمیل', type: 'email', required: false }, { name: 'subject', label: 'موضوع', type: 'select', required: true, options: ['پیگیری سفارش', 'همکاری در فروش', 'پیشنهاد و انتقاد', 'سایر موارد'] }, { name: 'message', label: 'متن پیام', type: 'textarea', required: true }], success_msg: 'پیام شما ثبت شد. به‌زودی با شما تماس می‌گیریم.' },
  { title: 'نظرسنجی تجربه خرید', slug: 'purchase-feedback', description: 'با چند پرسش کوتاه به ما کمک کنید تجربه خرید بهتری بسازیم.', fields: [{ name: 'satisfaction', label: 'میزان رضایت شما از خرید', type: 'select', required: true, options: ['خیلی راضی', 'راضی', 'متوسط', 'ناراضی'] }, { name: 'delivery', label: 'سرعت ارسال', type: 'radio', required: true, options: ['عالی', 'خوب', 'معمولی', 'ضعیف'] }, { name: 'comment', label: 'توضیحات', type: 'textarea', required: false }], success_msg: 'سپاس از مشارکت شما!' },
  { title: 'استعلام قیمت و موجودی', slug: 'price-inquiry', description: 'برای کالاهای بدون قیمت یا ناموجود، درخواست خود را ثبت کنید تا کارشناسان ما با شما تماس بگیرند.', fields: [{ name: 'product', label: 'نام کالا', type: 'text', required: true }, { name: 'name', label: 'نام و نام خانوادگی', type: 'text', required: true }, { name: 'phone', label: 'شماره تماس', type: 'tel', required: true }, { name: 'qty', label: 'تعداد مورد نیاز', type: 'number', required: false }, { name: 'note', label: 'توضیحات', type: 'textarea', required: false }], success_msg: 'درخواست استعلام شما ثبت شد؛ به‌زودی تماس می‌گیریم.' },
  { title: 'ثبت شکایت', slug: 'complaint', description: 'اگر از کالا، ارسال یا رفتار فروشنده شکایتی دارید آن را ثبت کنید. پرونده شما کد رهگیری دریافت می‌کند.', fields: [{ name: 'order_code', label: 'کد سفارش (در صورت وجود)', type: 'text', required: false }, { name: 'name', label: 'نام و نام خانوادگی', type: 'text', required: true }, { name: 'phone', label: 'شماره تماس', type: 'tel', required: true }, { name: 'subject', label: 'موضوع شکایت', type: 'select', required: true, options: ['کالای آسیب‌دیده', 'تاخیر در ارسال', 'عدم تطابق کالا', 'رفتار فروشنده', 'سایر موارد'] }, { name: 'message', label: 'شرح شکایت', type: 'textarea', required: true }], success_msg: 'شکایت شما ثبت شد و در اسرع وقت بررسی می‌شود.' },
];

const STORIES = [
  { label: 'فروش ویژه هفته', link: '/products?special=1' },
  { label: 'جدیدترین گوشی‌ها', link: '/products?cat=گوشی-موبایل' },
  { label: 'تخفیف پوشاک', link: '/products?cat=مد-و-پوشاک' },
  { label: 'ابزار کارگاه', link: '/products?cat=ابزارالات' },
  { label: 'مراقبت پوست', link: '/products?cat=ارایشی-بهداشتی' },
];

/* ---------------- اجرای seed ---------------- */

async function runSeed({ adminId = null, demo = 'medium' } = {}) {
  const result = { users: 0, sellers: 0, products: 0, posts: 0, orders: 0 };
  db.transaction(() => {
    /* --- تنظیمات پیش‌فرض --- */
    const defaults = {
      site_name: 'بالی‌وو', site_slogan: 'فروشگاه اینترنتی چند فروشنده',
      site_description: 'بالی‌وو یک پلتفرم خرید آنلاین چندفروشندگی است با امکان مقایسه قیمت، باشگاه مشتریان، همکاری در فروش و پرداخت امن.',
      site_phone: '02191001234', site_email: 'support@balewoo.test', site_address: 'تهران، خیابان ولیعصر، برج نمونه، طبقه ۷',
      site_postal_code: '1435812345', currency: 'تومان', multivendor_enabled: '1',
      seller_registration_enabled: '1', seller_auto_approve: '1', seller_default_commission: '5', seller_default_settlement: '7',
      seller_products_need_approval: '1', seller_posts_need_approval: '1', comment_moderation: '1', review_moderation: '0', question_moderation: '0',
      vat_percent: '9', vat_on_shipping: '0', cod_fee: '25000', free_shipping_above: '5000000',
      min_withdraw_amount: '50000', min_seller_withdraw: '500000',
      club_point_per_toman: '1000', club_point_value: '100', club_max_use_percent: '20', club_register_points: '50', club_review_points: '20',
      low_stock_threshold: '5', otp_length: '5', otp_ttl: '2', otp_resend_wait: '90',
      sms_driver: 'mock', sms_enabled: '1', payment_sandbox: '1',
      gateways_enabled: 'zarinpal,zibal,nextpay,payping,sadad,saman,snappay,torobpay,digipay,azkivam,card2card,wallet,cod',
      c2c_card_number: '6037-9911-2233-4455', c2c_owner_name: 'شرکت نمونه بالی‌وو', c2c_bank_name: 'بانک ملی',
      c2c_note: 'پس از واریز، چهار رقم آخر کارت و زمان واریز را در صفحه سفارش ثبت کنید.',
      cod_max_amount: '20000000', map_enabled: '1', map_provider: 'neshan', map_default_lat: '35.7448', map_default_lng: '51.3753',
      dark_mode_enabled: '1', cache_enabled: '1', cache_ttl: '60', theme_color: '#4f46e5',
      social_instagram: 'https://instagram.com/', social_telegram: 'https://t.me/', social_whatsapp: 'https://wa.me/989120000000',
      trust_note: 'پرداخت امن از طریق درگاه‌های معتبر بانکی', app_version: '1.0.0',
      home_seo_title: 'بالی‌وو | فروشگاه اینترنتی با امکان خرید از چند فروشنده',
      home_seo_desc: 'خرید آنلاین با بهترین قیمت، ارسال سریع، ضمانت اصالت کالا و امکان پرداخت اقساطی در بالی‌وو.',
    };
    for (const [k, v] of Object.entries(defaults)) if (setting(k, null) === null) setSetting(k, v, { group: 'install' });

    /* --- سطح‌های باشگاه مشتریان --- */
    if (!get('SELECT id FROM club_levels LIMIT 1')) {
      insert('club_levels', { level: 'bronze', title: 'برنزی', min_points: 0, color: '#b45309', perks: jstringify(['پیگیری سفارش آنلاین', 'پشتیبانی تلفنی', 'شرکت در جشنواره‌ها']), discount: 0 });
      insert('club_levels', { level: 'silver', title: 'نقره‌ای', min_points: 2000, color: '#6b7280', perks: jstringify(['۲٪ تخفیف دائمی', 'ارسال رایگان بالای ۳ میلیون تومان', 'اولویت در پشتیبانی']), discount: 2 });
      insert('club_levels', { level: 'gold', title: 'طلایی', min_points: 8000, color: '#d4af37', perks: jstringify(['۵٪ تخفیف دائمی', 'ارسال رایگان همه سفارش‌ها', 'مشاور اختصاصی خرید', 'دسترسی زودهنگام به فروش ویژه']), discount: 5 });
    }

    /* --- فروشگاه اصلی --- */
    let mainSeller = get('SELECT * FROM sellers WHERE is_main=1');
    if (!mainSeller) {
      const id = insert('sellers', { shop_name: setting('site_name', 'بالی‌وو'), shop_slug: slugify(setting('site_name', 'balewoo')), is_main: 1, status: 'active', commission: 0, settlement_days: 0, score: 4.9, success_rate: 99, products_count: 0, created_at: now(), updated_at: now(), description: 'فروشگاه اصلی بالی‌وو با ضمانت اصالت کالا و ارسال از انبار مرکزی.' });
      mainSeller = get('SELECT * FROM sellers WHERE id=@id', { id });
    }

    /* --- مدیر --- */
    let admin = adminId ? get('SELECT * FROM users WHERE id=@id', { id: adminId }) : get(`SELECT * FROM users WHERE role='admin' LIMIT 1`);
    if (!admin) {
      const id = auth.createUser({ phone: config.seed.adminPhone, name: 'مدیر کل بالی‌وو', password: config.seed.adminPassword, role: 'admin', status: 'active' });
      const role = get(`SELECT id FROM roles WHERE slug='super-admin'`);
      if (role) run('UPDATE users SET role_id=@r WHERE id=@id', { r: role.id, id });
      admin = get('SELECT * FROM users WHERE id=@id', { id });
      result.users++;
    }

    /* --- دسته‌بندی‌ها --- */
    const catIds = {};
    const insertCat = (name, parentId, icon = null) => {
      const existing = get('SELECT id FROM categories WHERE slug=@s', { s: slugify(name) });
      if (existing) { catIds[name] = existing.id; return existing.id; }
      const id = insert('categories', { name, slug: slugify(name), parent_id: parentId, icon, sort: Object.keys(catIds).length, status: 'active', created_at: now() });
      catIds[name] = id;
      return id;
    };
    for (const c of CATEGORIES) {
      const pid = insertCat(c.name, null, c.icon);
      for (const ch of c.children || []) {
        const cid = insertCat(ch.name, pid);
        for (const gch of ch.children || []) insertCat(gch.name, cid);
      }
    }

    /* --- برندها --- */
    const brandIds = {};
    BRANDS.forEach(([name, en], i) => {
      if (en === '—') en = name;
      const existing = get('SELECT id FROM brands WHERE slug=@s', { s: slugify(name) });
      const logo = writeSeedImage(`brand-${slugify(name)}.svg`, name, en, i + 3, 320, 160);
      if (existing) { brandIds[name] = existing.id; update('brands', existing.id, { logo }); return; }
      brandIds[name] = insert('brands', { name, name_en: en, slug: slugify(name), logo, description: `خرید انواع محصولات ${name} با ضمانت اصالت کالا و قیمت رقابتی از فروشگاه‌های معتبر بالی‌وو.`, status: 'active', sort: i, created_at: now() });
    });

    /* --- گروه‌های ویژگی --- */
    const groupIds = {};
    for (const a of ATTRIBUTES) {
      const existing = get('SELECT id FROM attribute_groups WHERE name=@n', { n: a.name });
      const options = a.options.map((o, i) => ({ id: i + 1, title: o[0], color: o[1] || null }));
      if (existing) { groupIds[a.name] = existing.id; update('attribute_groups', existing.id, { options: jstringify(options) }); continue; }
      groupIds[a.name] = insert('attribute_groups', { name: a.name, type: a.type, options: jstringify(options), is_filter: a.is_filter ? 1 : 0, is_variant: a.is_variant ? 1 : 0, is_spec: a.is_spec ? 1 : 0, sort: Object.keys(groupIds).length, created_at: now() });
    }

    /* --- فروشندگان نمونه --- */
    const sellers = [];
    const SELLER_SEEDS = [
      { name: 'دیجیتال آرمان', en: 'Arman Digital', city: 'تهران', commission: 6, desc: 'توزیع‌کننده رسمی موبایل و لوازم جانبی با ۱۲ سال سابقه و گارانتی اختصاصی.', phone: '09121000001', score: 4.7 },
      { name: 'ابزار صنعت نوین', en: 'Sanat Noovin', city: 'اصفهان', commission: 8, desc: 'فروش تخصصی ابزار برقی و دستی صنعتی با خدمات پس از فروش و تامین قطعات.', phone: '09121000002', score: 4.5 },
      { name: 'مد و پوشاک آتره', en: 'Atre Fashion', city: 'تهران', commission: 10, desc: 'طراحی و تولید پوشاک مردانه و زنانه با پارچه درجه یک و دوخت ایرانی.', phone: '09121000003', score: 4.8 },
      { name: 'بیوتی استور لیانا', en: 'Liana Beauty', city: 'شیراز', commission: 9, desc: 'واردکننده مستقیم محصولات آرایشی و بهداشتی اصل با کد اصالت.', phone: '09121000004', score: 4.6 },
      { name: 'خودرو یدک پارس', en: 'Pars Yadak', city: 'کرج', commission: 7, desc: 'تامین لوازم یدکی و جانبی خودرو با ارسال سریع به سراسر کشور.', phone: '09121000005', score: 4.3 },
    ];
    for (let i = 0; i < SELLER_SEEDS.length; i++) {
      const s = SELLER_SEEDS[i];
      const existing = get('SELECT * FROM sellers WHERE shop_slug=@s', { s: slugify(s.name) });
      const logo = writeSeedImage(`seller-${slugify(s.name)}.svg`, s.name, s.en, i + 1, 320, 320);
      let seller;
      if (existing) { seller = existing; update('sellers', existing.id, { logo }); }
      else {
        let user = get('SELECT * FROM users WHERE phone=@p', { p: s.phone });
        if (!user) { const uid = auth.createUser({ phone: s.phone, name: s.name, password: '12345678', role: 'seller', status: 'active' }); user = get('SELECT * FROM users WHERE id=@id', { id: uid }); }
        const sid = insert('sellers', {
          user_id: user.id, shop_name: s.name, shop_slug: slugify(s.name), shop_en: s.en, logo, type: i % 2 ? 'legal' : 'real',
          national_id: '1010' + String(100000 + i * 137), phone: s.phone, email: `${slugify(s.en)}@example.test`,
          province: 'تهران', city: s.city, address: `${s.city}، خیابان اصلی، پلاک ${10 + i}`,
          description: s.desc, commission: s.commission, settlement_days: 7 + i, direct_shipping: i % 2, status: 'active',
          score: s.score, success_rate: 92 + i, cancel_rate: 2, return_rate: 1, views: 120 + i * 40, wallet: 1500000 * (i + 1),
          created_at: now(), updated_at: now(),
        });
        run('UPDATE users SET seller_id=@s WHERE id=@u', { s: sid, u: user.id });
        seller = get('SELECT * FROM sellers WHERE id=@id', { id: sid });
        // انبار فروشنده
        insert('warehouses', { owner_type: 'seller', owner_id: sid, name: `انبار مرکزی ${s.name}`, address: s.city, is_default: 1, created_at: now() });
        // حساب بانکی
        insert('bank_accounts', { owner_type: 'seller', owner_id: sid, owner_name: s.name, bank_name: ['ملی', 'ملت', 'سامان', 'پاسارگاد', 'صادرات'][i], card_number: `603799${String(10000000 + i * 7913).slice(0, 8)}`, iban: 'IR' + String(820000000000 + i * 1379), status: 'approved', created_at: now() });
        result.sellers++;
      }
      sellers.push(seller);
    }

    /* --- محصولات --- */
    const createdProducts = [];
    PRODUCTS.forEach((p, idx) => {
      const catId = catIds[p.cat] || null;
      const brandId = p.brand ? brandIds[p.brand] : null;
      const existing = get('SELECT id FROM products WHERE slug=@s', { s: slugify(p.title) });
      if (existing) { createdProducts.push(get('SELECT * FROM products WHERE id=@id', { id: existing.id })); return; }

      // تخصیص فروشنده
      let sellerId = mainSeller.id;
      if (idx % 3 !== 0 && sellers.length) sellerId = sellers[idx % sellers.length].id;

      const price = p.price;
      const old = p.old || 0;
      const cover = writeSeedImage(`product-${idx + 1}.svg`, p.title.split(' مدل ')[0].slice(0, 18), p.brand || 'بالی‌وو', idx, 700, 700);
      const id = insert('products', {
        seller_id: sellerId, created_by: admin.id, category_id: catId, brand_id: brandId,
        title: p.title, title_en: (p.brand || '') + ' ' + p.title.slice(0, 30),
        slug: slugify(p.title), sku: 'SKU-' + String(10000 + idx), product_code: 'p-' + (8500000 + idx * 137),
        type: 'normal', condition_txt: 'new', warranty: idx % 4 === 0 ? '۱۸ ماه گارانتی شرکتی' : null,
        short_desc: `خرید ${p.title} با ضمانت اصالت کالا، ارسال سریع و امکان پرداخت اقساطی از بالی‌وو.`,
        description: `<p>${p.title} با کیفیت ساخت بالا و قیمت رقابتی در بالی‌وو عرضه می‌شود. این محصول دارای گارانتی معتبر است و در صورت عدم رضایت، تا ۷ روز امکان مرجوعی دارد.</p><h3>چرا این محصول؟</h3><ul><li>اصالت کالا تضمین‌شده است</li><li>ارسال از انبار مرکزی یا انبار فروشنده</li><li>پشتیبانی و پاسخگویی به پرسش‌های شما</li><li>امکان دریافت امتیاز باشگاه مشتریان</li></ul><p>برای مقایسه با محصولات مشابه می‌توانید از امکان «مقایسه» استفاده کنید و مشخصات فنی را کنار هم ببینید.</p>`,
        specs: jstringify(p.specs || []),
        highlights: jstringify((p.specs || []).slice(0, 4).map(([t, v]) => ({ title: t, value: v }))),
        attributes: jstringify(buildAttributes(groupIds, p)),
        keywords: [p.cat, p.brand, p.title.split(' مدل ')[0]].filter(Boolean).join('، '),
        price, old_price: old, stock: p.stock, weight: 500 + idx * 40, sold: p.sold || 0, views: 300 + idx * 37, likes: 10 + idx * 3,
        is_special: p.special ? 1 : 0, is_featured: idx % 5 === 0 ? 1 : 0, is_best_seller: p.sold > 200 ? 1 : 0,
        affiliate: 1, aff_gold: 6, aff_silver: 4, aff_bronze: 2,
        points_reward: Math.floor(price / 1000), min_order: 1, max_order: p.stock > 100 ? 20 : 5,
        status: 'active', discount_start: old ? now() : null, discount_end: old ? new Date(daysFromNow(12)).toISOString().replace('T', ' ').slice(0, 19) : null,
        base_currency_rate: 1, published_at: now(), created_at: now(), updated_at: now(),
      });

      // تصاویر
      insert('product_images', { product_id: id, media_path: cover, alt: p.title, kind: 'cover', sort: 0, created_at: now() });
      for (let k = 1; k <= 2; k++) {
        const extra = writeSeedImage(`product-${idx + 1}-${k}.svg`, p.title.split(' مدل ')[0].slice(0, 14) + ' — ' + (k === 1 ? 'نمای جانبی' : 'جزئیات'), '', idx + k, 700, 700);
        insert('product_images', { product_id: id, media_path: extra, alt: p.title, kind: 'gallery', sort: k, created_at: now() });
      }

      // متغیرها
      const colors = p.colors || [];
      const sizes = p.sizes || [];
      const memory = p.memory || [];
      const combos = [];
      if (colors.length) for (const c of colors) combos.push({ 'رنگ': c });
      if (sizes.length) for (const s of sizes) combos.push({ 'سایز': s });
      if (memory.length) for (const m of memory) combos.push({ 'حافظه داخلی': m });
      if (!combos.length) combos.push({ 'استاندارد': 'یک سایز' });

      combos.forEach((opts, i) => {
        const title = Object.values(opts).join(' / ');
        const priceDelta = Math.round((i % 3) * (price * 0.02) / 1000) * 1000;
        insert('product_variants', {
          product_id: id, seller_id: sellerId, title, options: jstringify(opts),
          price: price + priceDelta, old_price: old ? old + priceDelta : 0,
          stock: Math.max(0, Math.floor(p.stock / combos.length) + (i === 0 ? 2 : 0)),
          sku: 'V-' + String(100000 + idx * 20 + i), is_default: i === 0 ? 1 : 0, status: 'active', created_at: now(),
        });
      });

      // ویژگی‌های اضافی اختیاری
      if (idx % 2 === 0) {
        insert('product_options', { product_id: id, title: 'بسته‌بندی ویژه هدیه', price: 120000, sort: 0 });
        insert('product_options', { product_id: id, title: 'گارانتی تعویض ۶ ماهه', price: 450000, sort: 1 });
        insert('product_options', { product_id: id, title: 'محافظ صفحه نمایش', price: 0, sort: 2 });
      }

      // تخفیف پلکانی
      if (p.stock > 30) {
        insert('tier_discounts', { product_id: id, min_qty: 5, price: Math.round(price * 0.95 / 1000) * 1000 });
        insert('tier_discounts', { product_id: id, min_qty: 10, price: Math.round(price * 0.9 / 1000) * 1000 });
      }

      // تاریخچه قیمت
      for (let d = 5; d >= 1; d--) {
        const drift = 1 + (d % 3 - 1) * 0.03;
        insert('price_history', { product_id: id, price: Math.round(price * drift / 1000) * 1000, old_price: old, created_at: new Date(Date.now() - d * 86400000 * 4).toISOString().replace('T', ' ').slice(0, 19) });
      }
      insert('price_history', { product_id: id, price, old_price: old, created_at: now() });

      // موجودی انبار
      const wh = get(`SELECT * FROM warehouses WHERE owner_type='${sellerId === mainSeller.id ? 'main' : 'seller'}' AND owner_id=@o AND is_default=1`, { o: sellerId === mainSeller.id ? 0 : sellerId });
      if (wh) insert('warehouse_items', { warehouse_id: wh.id, product_id: id, qty: p.stock, price, updated_at: now() });

      // نظرات و پرسش‌ها
      seedReviews(id, p, idx);
      seedQuestions(id, p, idx);

      createdProducts.push(get('SELECT * FROM products WHERE id=@id', { id }));
      result.products++;
    });

    // شمارنده دسته‌بندی و برند
    for (const c of all('SELECT id FROM categories')) run(`UPDATE categories SET products_count=(SELECT COUNT(*) FROM products WHERE category_id=@c AND deleted_at IS NULL AND status='active')`, { c: c.id });
    for (const b of all('SELECT id FROM brands')) run(`UPDATE brands SET products_count=(SELECT COUNT(*) FROM products WHERE brand_id=@b AND deleted_at IS NULL AND status='active')`, { b: b.id });
    for (const s of all('SELECT id FROM sellers')) run(`UPDATE sellers SET products_count=(SELECT COUNT(*) FROM products WHERE seller_id=@s AND deleted_at IS NULL AND status='active')`, { s: s.id });

    /* --- مشتریان نمونه --- */
    const customers = [];
    const CUSTOMER_SEEDS = [
      ['سارا محمدی', '09122000001', 12500, 'gold'], ['امیر رضایی', '09122000002', 3200, 'silver'], ['نگار حسینی', '09122000003', 450, 'bronze'],
      ['محمد کریمی', '09122000004', 8900, 'gold'], ['الهام شریفی', '09122000005', 120, 'bronze'], ['رضا نوری', '09122000006', 5600, 'silver'],
      ['مریم احمدی', '09122000007', 210, 'bronze'], ['حسین موسوی', '09122000008', 15400, 'gold'],
    ];
    for (let i = 0; i < CUSTOMER_SEEDS.length; i++) {
      const [name, phone, points, level] = CUSTOMER_SEEDS[i];
      let u = get('SELECT * FROM users WHERE phone=@p', { p: phone });
      if (!u) {
        const id = auth.createUser({ phone, name, password: '12345678', role: 'customer', status: 'active' });
        run('UPDATE users SET points=@p, club_level=@l, wallet=@w, is_affiliate=@a, created_at=@c WHERE id=@id',
          { p: points, l: level, w: 250000 * (i + 1), a: i % 2, c: new Date(Date.now() - (90 - i * 9) * 86400000).toISOString().replace('T', ' ').slice(0, 19), id });
        u = get('SELECT * FROM users WHERE id=@id', { id });
        insert('addresses', { user_id: u.id, title: 'منزل', receiver: name, phone, province: 'تهران', city: 'تهران', address: `تهران، خیابان ${['ولیعصر', 'شریعتی', 'کارگر', 'آزادی'][i % 4]}، کوچه ${i + 1}، پلاک ${10 + i}، واحد ${i % 5 + 1}`, postal_code: `143581${String(1000 + i * 13)}`, is_default: 1, created_at: now() });
        insert('bank_accounts', { owner_type: 'user', owner_id: u.id, owner_name: name, bank_name: ['ملی', 'ملت', 'سامان'][i % 3], card_number: `603799${String(20000000 + i * 3137).slice(0, 8)}`, status: i % 3 === 0 ? 'approved' : 'pending', created_at: now() });
        insert('club_activities', { user_id: u.id, points, reason: 'purchase', created_at: now() });
        if (u.is_affiliate) insert('affiliate_referrals', { affiliate_id: u.id, user_id: customers[0]?.id || u.id, level: 1, created_at: now() });
        result.users++;
      }
      customers.push(u);
    }

    /* --- انبار اصلی --- */
    if (!get(`SELECT id FROM warehouses WHERE owner_type='main'`)) {
      insert('warehouses', { owner_type: 'main', owner_id: 0, name: 'انبار مرکزی تهران', address: 'تهران، منطقه صنعتی چهاردانگه', phone: '02191001234', is_default: 1, created_at: now() });
      insert('warehouses', { owner_type: 'main', owner_id: 0, name: 'انبار اصفهان', address: 'اصفهان، شهرک صنعتی جی', is_default: 0, created_at: now() });
    }

    /* --- روش‌های ارسال --- */
    if (!get('SELECT id FROM shipping_methods LIMIT 1')) {
      insert('shipping_methods', { title: 'پست پیشتاز', description: 'تحویل ۲ تا ۴ روز کاری در سراسر کشور', base_price: 65000, free_above: 5000000, extra_weight_price: 15000, extra_weight_from: 2000, eta_days: 3, cod_allowed: 1, sort: 1, status: 'active' });
      insert('shipping_methods', { title: 'تیپاکس (پس‌کرایه)', description: 'مناسب بسته‌های سنگین و حجیم', base_price: 120000, free_above: 20000000, extra_weight_price: 25000, extra_weight_from: 3000, eta_days: 2, cod_allowed: 0, sort: 2, status: 'active' });
      insert('shipping_methods', { title: 'ارسال سریع تهران (اسنپ)', description: 'تحویل همان روز در محدوده تهران', base_price: 95000, free_above: 0, extra_weight_price: 0, extra_weight_from: 0, eta_days: 1, cod_allowed: 1, sort: 3, status: 'active' });
      insert('shipping_methods', { title: 'ارسال اکسپرس (فوری)', description: 'تحویل زیر ۳ ساعت در تهران — ویژه سفارش‌های ضروری', base_price: 250000, free_above: 0, eta_days: 0, cod_allowed: 0, sort: 4, status: 'active' });
      insert('shipping_methods', { title: 'دریافت حضوری از فروشگاه', description: 'بدون هزینه ارسال — مراجعه به مراکز دریافت', base_price: 0, eta_days: 0, cod_allowed: 1, sort: 5, status: 'active' });
    }
    if (!get('SELECT id FROM pickup_centers LIMIT 1')) {
      insert('pickup_centers', { title: 'مرکز دریافت تهران — ولیعصر', address: 'تهران، خیابان ولیعصر، بالاتر از میدان ونک، پلاک ۱۲۳', phone: '02191001234', lat: 35.7575, lng: 51.4092, work_hours: 'شنبه تا چهارشنبه ۹ تا ۱۸، پنجشنبه ۹ تا ۱۳', status: 'active' });
      insert('pickup_centers', { title: 'مرکز دریافت کرج — مهرویلا', address: 'کرج، مهرویلا، خیابان اصلی، مجتمع تجاری نمونه', phone: '02633001234', lat: 35.8327, lng: 50.9915, work_hours: 'شنبه تا پنجشنبه ۱۰ تا ۲۰', status: 'active' });
      insert('pickup_centers', { title: 'مرکز دریافت اصفهان — چهارباغ', address: 'اصفهان، چهارباغ بالا، پاساژ نمونه، طبقه دوم', phone: '03136001234', lat: 32.6546, lng: 51.6680, work_hours: 'شنبه تا چهارشنبه ۱۰ تا ۱۹', status: 'active' });
    }

    /* --- کوپن‌ها --- */
    if (!get('SELECT id FROM coupons LIMIT 1')) {
      insert('coupons', { code: 'BALEWOO10', type: 'percent', value: 10, max_discount: 500000, min_cart: 1000000, usage_limit: 500, per_user: 2, starts_at: now(), expires_at: new Date(daysFromNow(45)).toISOString().replace('T', ' ').slice(0, 19), status: 'active', created_by: admin.id, created_at: now() });
      insert('coupons', { code: 'NEWUSER', type: 'fixed', value: 200000, min_cart: 500000, usage_limit: 0, per_user: 1, expires_at: new Date(daysFromNow(90)).toISOString().replace('T', ' ').slice(0, 19), status: 'active', created_by: admin.id, created_at: now() });
      insert('coupons', { code: 'SUMMER25', type: 'percent', value: 25, max_discount: 1500000, min_cart: 3000000, usage_limit: 100, starts_at: now(), expires_at: new Date(daysFromNow(15)).toISOString().replace('T', ' ').slice(0, 19), status: 'active', created_by: admin.id, created_at: now() });
      insert('coupons', { code: 'EXPIRED50', type: 'percent', value: 50, expires_at: new Date(Date.now() - 86400000).toISOString().replace('T', ' ').slice(0, 19), status: 'active', created_at: now() });
    }

    /* --- بنرها --- */
    if (!get('SELECT id FROM banners LIMIT 1')) {
      const banners = [
        ['جشنواره تابستانه — تا ۴۰٪ تخفیف', '/products?off=1', 'موبایل، لوازم خانگی و پوشاک', 0],
        ['ارسال رایگان سفارش‌های بالای ۵ میلیون تومان', '/products', 'در سراسر کشور با پست پیشتاز', 1],
        ['فروشندگان برتر ماه', '/brands', 'خرید مستقیم از فروشگاه‌های معتبر', 2],
        ['پرداخت اقساطی بدون پیش‌پرداخت', '/products?special=1', 'با اسنپ‌پی و ترب‌پی در ۴ قسط', 3],
      ];
      banners.forEach(([title, link, sub, i]) => {
        insert('banners', {
          title, link, position: 'home', sort: i, status: 'active', created_at: now(),
          image: writeSeedImage(`banner-${i + 1}.svg`, title.slice(0, 20), sub, i, 1600, 480),
          image_dark: writeSeedImage(`banner-${i + 1}-dark.svg`, title.slice(0, 20), sub, i + 5, 1600, 480),
        });
      });
      insert('banners', { title: 'تخفیف ویژه ابزارآلات', position: 'home-mid', link: '/products?cat=ابزارالات', image: writeSeedImage('banner-mid-1.svg', 'ابزارآلات', 'تا ۳۵٪ تخفیف', 6, 800, 400), sort: 0, status: 'active', created_at: now() });
      insert('banners', { title: 'فروش ویژه پوشاک', position: 'home-mid', link: '/products?cat=مد-و-پوشاک', image: writeSeedImage('banner-mid-2.svg', 'مد و پوشاک', 'کالکشن جدید', 7, 800, 400), sort: 1, status: 'active', created_at: now() });
    }

    /* --- استوری‌ها --- */
    if (!get('SELECT id FROM stories LIMIT 1')) {
      STORIES.forEach((s, i) => {
        insert('stories', {
          owner_type: i % 2 ? 'seller' : 'admin', owner_id: i % 2 ? sellers[i % sellers.length]?.id : null,
          media_path: writeSeedImage(`story-${i + 1}.svg`, s.label, '', i + 2, 420, 740),
          media_type: 'image', link: s.link, duration: 5, sort: i, views: 120 + i * 30, likes: 10 + i * 4,
          starts_at: now(), expires_at: new Date(Date.now() + 86400000).toISOString().replace('T', ' ').slice(0, 19), status: 'active', created_at: now(),
        });
      });
    }

    /* --- مجله --- */
    if (!get('SELECT id FROM post_categories LIMIT 1')) {
      ['راهنمای خرید', 'بررسی محصول', 'ترفندها', 'سبک زندگی', 'پادکست'].forEach((n, i) => insert('post_categories', { name: n, slug: slugify(n), sort: i, status: 'active' }));
    }
    for (let i = 0; i < POSTS.length; i++) {
      const p = POSTS[i];
      if (get('SELECT id FROM posts WHERE slug=@s', { s: slugify(p.title) })) continue;
      const cat = get('SELECT id FROM post_categories WHERE name=@n', { n: p.cat });
      const cover = writeSeedImage(`post-${i + 1}.svg`, p.title.slice(0, 18), p.cat, i + 1, 1200, 630);
      const mentions = p.mentions.map((m) => createdProducts.find((cp) => cp.title.includes(m.slice(0, 14)))).filter(Boolean);
      const body = `<p>${p.excerpt}</p>
<h2>چرا این موضوع مهم است؟</h2>
<p>انتخاب درست در بازار شلوغ امروز کار ساده‌ای نیست. تنوع مدل‌ها، تفاوت قیمت بین فروشندگان و تبلیغات پرحجم باعث می‌شود تصمیم‌گیری سخت شود. در این مقاله تلاش کرده‌ایم معیارهای اصلی را ساده و کاربردی بیان کنیم تا با کمترین ریسک خرید کنید.</p>
${mentions.length ? `<h3>محصولات مرتبط با این مقاله</h3><p>محصولاتی که در ادامه به آن‌ها اشاره می‌کنیم، در فروشگاه بالی‌وو موجود هستند و می‌توانید قیمت و مشخصات کامل آن‌ها را ببینید:</p><ul>${mentions.map((m) => `<li>${m.title} — ${numberFormat(m.price)} تومان</li>`).join('')}</ul>` : ''}
<h2>نکات کلیدی</h2>
<ol><li>پیش از خرید، مشخصات فنی را با نیاز واقعی خود مقایسه کنید.</li><li>دیدگاه خریداران قبلی را بخوانید؛ نقاط ضعف معمولاً در نظرات دیده می‌شود.</li><li>گارانتی و خدمات پس از فروش را جدی بگیرید.</li><li>قیمت را در چند فروشگاه مقایسه کنید و به اعتبار فروشنده توجه کنید.</li></ol>
<h2>جمع‌بندی</h2>
<p>خرید هوشمندانه یعنی ترکیب اطلاعات درست، مقایسه قیمت و اعتماد به فروشنده معتبر. با استفاده از امکان مقایسه محصولات و امتیاز باشگاه مشتریان در بالی‌وو، می‌توانید هم در هزینه صرفه‌جویی کنید و هم تجربه بهتری داشته باشید.</p>`;
      const id = insert('posts', {
        author_type: i % 4 === 0 && sellers.length ? 'seller' : 'admin', author_id: i % 4 === 0 && sellers.length ? sellers[i % sellers.length].user_id : admin.id,
        seller_id: i % 4 === 0 && sellers.length ? sellers[i % sellers.length].id : null,
        category_id: cat?.id || null, title: p.title, slug: slugify(p.title), excerpt: p.excerpt, body, cover,
        kind: p.kind, video_url: p.kind === 'video' ? 'https://example.test/video.mp4' : null, audio_url: p.kind === 'podcast' ? 'https://example.test/podcast.mp3' : null,
        tags: jstringify(['راهنمای خرید', p.cat, 'بررسی'].slice(0, 3)), status: 'published', views: 200 + i * 87,
        published_at: new Date(Date.now() - i * 3 * 86400000).toISOString().replace('T', ' ').slice(0, 19),
        created_at: now(), updated_at: now(),
      });
      mentions.forEach((m, k) => insert('post_products', { post_id: id, product_id: m.id, sort: k }));
      result.posts++;
    }

    /* --- صفحات --- */
    for (const pg of PAGES) {
      if (get('SELECT id FROM pages WHERE slug=@s', { s: pg.slug })) continue;
      insert('pages', { title: pg.title, slug: pg.slug, body: pg.body, status: 'published', views: 40, created_at: now(), updated_at: now() });
    }

    /* --- FAQ --- */
    if (!get('SELECT id FROM faqs LIMIT 1')) {
      FAQS.forEach(([q, a, c], i) => insert('faqs', { question: q, answer: a, category: c, sort: i, status: 'active', created_at: now() }));
    }

    /* --- فرم‌ها --- */
    for (const f of FORMS) {
      if (get('SELECT id FROM forms WHERE slug=@s', { s: f.slug })) continue;
      insert('forms', { title: f.title, slug: f.slug, description: f.description, fields: jstringify(f.fields), success_msg: f.success_msg, status: 'active', created_at: now() });
    }
    // چند پاسخ نمونه
    if (!get('SELECT id FROM form_submissions LIMIT 1')) {
      const form = get(`SELECT id FROM forms WHERE slug='contact-us'`);
      if (form) {
        insert('form_submissions', { form_id: form.id, user_id: customers[0]?.id, data: jstringify({ name: 'سارا محمدی', phone: '09122000001', email: 'sara@example.test', subject: 'پیگیری سفارش', message: 'سفارش من سه روز است در وضعیت پردازش قرار دارد.' }), ip: '127.0.0.1', created_at: now() });
        insert('form_submissions', { form_id: form.id, data: jstringify({ name: 'کاوه رستمی', phone: '09133000009', email: '', subject: 'همکاری در فروش', message: 'تمایل به همکاری در فروش دارم.' }), ip: '127.0.0.1', created_at: now() });
      }
    }

    /* --- منوها --- */
    if (!get('SELECT id FROM menus LIMIT 1')) {
      const mid = insert('menus', { title: 'منوی اصلی', location: 'header', created_at: now() });
      [['صفحه نخست', '/'], ['آرشیو محصولات', '/products'], ['مجله', '/blog'], ['برندها', '/brands'], ['پرسش‌های متداول', '/faq'], ['فروشنده شوید', '/auth/seller/register'], ['تماس با ما', '/form/contact-us']].forEach(([t, u], i) => insert('menu_items', { menu_id: mid, title: t, url: u, sort: i, status: 'active' }));
      const fid = insert('menus', { title: 'منوی فوتر', location: 'footer', created_at: now() });
      [['درباره ما', '/page/about-us'], ['قوانین و شرایط', '/page/terms'], ['حریم خصوصی', '/page/privacy'], ['راهنمای خرید', '/page/how-to-buy'], ['مجله', '/blog'], ['پرسش‌های متداول', '/faq']].forEach(([t, u], i) => insert('menu_items', { menu_id: fid, title: t, url: u, sort: i, status: 'active' }));
    }

    /* --- قالب صفحه نخست (صفحه‌ساز) --- */
    if (!get('SELECT id FROM templates LIMIT 1')) {
      insert('templates', {
        name: 'قالب پیش‌فرض صفحه نخست', route: 'home', theme: 'classic', is_active: 1, status: 'published', created_by: admin.id, created_at: now(), updated_at: now(),
        sections: jstringify([
          { id: 's1', type: 'slider', title: 'اسلایدر اصلی' },
          { id: 's2', type: 'stories', title: 'استوری‌ها' },
          { id: 's3', type: 'services', title: 'خدمات ما' },
          { id: 's4', type: 'categories', title: 'خرید بر اساس دسته‌بندی', limit: 10 },
          { id: 's5', type: 'product_list', title: 'فروش ویژه امروز', source: 'special', limit: 8 },
          { id: 's6', type: 'banner', title: 'بنر میانی', position: 'home-mid' },
          { id: 's7', type: 'product_list', title: 'پرفروش‌ترین‌ها', source: 'bestseller', limit: 8 },
          { id: 's8', type: 'product_list', title: 'جدیدترین محصولات', source: 'newest', limit: 12 },
          { id: 's9', type: 'brands', title: 'برندهای محبوب', limit: 12 },
          { id: 's10', type: 'stores', title: 'فروشگاه‌های برتر', limit: 6 },
          { id: 's11', type: 'blog', title: 'از مجله بالی‌وو', limit: 3 },
        ]),
      });
      insert('templates', { name: 'قالب خام (بدون بخش)', route: 'home', theme: 'minimal', is_active: 0, status: 'draft', created_by: admin.id, created_at: now(), updated_at: now(), sections: jstringify([]) });
    }

    /* --- نرخ ارز --- */
    if (!get('SELECT id FROM currencies LIMIT 1')) {
      insert('currencies', { code: 'IRR', title: 'ریال ایران', rate: 1, is_base: 1, updated_at: now() });
      insert('currencies', { code: 'USD', title: 'دلار آمریکا', rate: 890000, updated_at: now() });
      insert('currencies', { code: 'EUR', title: 'یورو', rate: 965000, updated_at: now() });
      insert('currencies', { code: 'AED', title: 'درهم امارات', rate: 242000, updated_at: now() });
    }

    /* --- جستجوهای پرتکرار --- */
    if (!get('SELECT id FROM search_terms LIMIT 1')) {
      [['گوشی موبایل', 320], ['ساعت هوشمند', 210], ['لپ تاپ', 180], ['هدفون', 150], ['پاوربانک', 120], ['دریل شارژی', 95], ['کفش ورزشی', 88], ['ضد آفتاب', 70], ['چای', 54], ['دوچرخه', 40]]
        .forEach(([term, count]) => insert('search_terms', { term, count, last_at: now() }));
    }

    /* --- سفارش‌ها و تراکنش‌ها --- */
    result.orders = seedOrders({ customers, products: createdProducts, sellers, mainSeller, admin });

    /* --- تیکت‌ها --- */
    seedTickets({ customers, sellers, admin, products: createdProducts });

    /* --- اعلان‌ها --- */
    for (const c of customers.slice(0, 4)) {
      notify.push(c.id, { type: 'order', icon: 'cart', title: 'سفارش شما ارسال شد', body: 'بسته شما تحویل شرکت پست شد و کد رهگیری برای شما پیامک شد.', link: '/user/orders' });
      notify.push(c.id, { type: 'club', icon: 'award', title: 'امتیاز باشگاه مشتریان', body: '۲۴۵ امتیاز از خرید اخیر به حساب شما اضافه شد.', link: '/user/club' });
    }

    /* --- تعامل کاربران، پیش‌فاکتور، برداشت، انبار، همکاری در فروش --- */
    seedEngagement({ customers, sellers, admin, products: createdProducts, mainSeller });

    /* --- بازدید صفحات --- */
    seedPageViews(customers);
  })();

  return result;
}

function buildAttributes(groupIds, p) {
  const out = {};
  const add = (name, titles) => {
    const gid = groupIds[name];
    if (!gid) return;
    const g = get('SELECT options FROM attribute_groups WHERE id=@id', { id: gid });
    const opts = JSON.parse(g.options || '[]');
    const ids = titles.map((t) => opts.find((o) => o.title === t)?.id).filter(Boolean).map(String);
    if (ids.length) out[gid] = ids;
  };
  add('رنگ', p.colors || []);
  add('حافظه داخلی', p.memory || []);
  add('سایز', p.sizes || []);
  add('وضعیت کالا', ['آکبند']);
  add('کشور سازنده', [['چین'], ['کره جنوبی'], ['آلمان'], ['ایران']][(p.title.length) % 4]);
  add('گارانتی بازگشت', ['دارد']);
  return out;
}

const REVIEWERS = ['سارا محمدی', 'امیر رضایی', 'نگار حسینی', 'محمد کریمی', 'الهام شریفی', 'رضا نوری', 'مریم احمدی', 'حسین موسوی', 'کاوه رستمی', 'شیدا فرهادی'];
const PROS = ['کیفیت ساخت عالی', 'قیمت مناسب نسبت به بازار', 'ارسال سریع', 'بسته‌بندی تمیز و سالم', 'مطابق توضیحات سایت', 'گارانتی معتبر', 'ظاهر زیبا'];
const CONS = ['دفترچه راهنما فارسی نیست', 'کمی سنگین است', 'باتری می‌توانست بهتر باشد', 'رنگ دقیقاً مثل عکس نیست', 'قیمت نسبت به هفته قبل افزایش داشته'];

function seedReviews(productId, p, idx) {
  if (get('SELECT id FROM reviews WHERE product_id=@p LIMIT 1', { p: productId })) return;
  const count = Math.min(4, Math.max(1, Math.floor((idx % 4) + 1)));
  let ratingSum = 0, recommends = 0;
  for (let i = 0; i < count; i++) {
    const rating = [5, 4, 5, 3, 4][i % 5];
    ratingSum += rating;
    const recommend = rating >= 4 ? 1 : 0;
    recommends += recommend;
    const pros = PROS.slice(i % 3, (i % 3) + 2);
    const cons = rating >= 5 ? [] : CONS.slice(i % 2, (i % 2) + 1);
    insert('reviews', {
      product_id: productId, user_id: null, rating, recommend, pros: jstringify(pros), cons: jstringify(cons),
      title: [rating === 5 ? 'خرید بسیار خوبی بود' : rating === 4 ? 'راضی هستم' : 'قابل قبول اما نه عالی'][0],
      body: [
        `بعد از ${10 + i * 5} روز استفاده می‌توانم بگویم ${rating >= 4 ? 'انتخاب درستی بوده' : 'بد نیست ولی انتظاراتم کامل برآورده نشد'}. ${pros[0]} و ${pros[1] || 'بسته‌بندی مناسب'} از نکات مثبت خریدم بود.`,
        `محصول ${rating >= 4 ? 'دقیقاً مطابق توضیحات سایت' : 'کمی با توضیحات تفاوت داشت'} ارسال شد. ${cons[0] || ''}`.trim(),
        `برای مصرف ${['روزمره', 'حرفه‌ای', 'خانگی'][i % 3]} تهیه کردم و تا الان مشکلی نداشته. ${rating >= 4 ? 'پیشنهاد می‌کنم.' : 'قبل از خرید بیشتر بررسی کنید.'}`,
      ][i % 3],
      is_buyer: i % 2, helpful: i * 3, status: 'approved',
      admin_reply: i === 0 ? 'از بازخورد شما سپاسگزاریم. در صورت نیاز، تیم پشتیبانی در خدمت شماست.' : null,
      created_at: new Date(Date.now() - (i * 7 + 2) * 86400000).toISOString().replace('T', ' ').slice(0, 19),
    });
  }
  run('UPDATE products SET rating_sum=@s, rating_count=@c, recommend_count=@r WHERE id=@id', { s: ratingSum, c: count, r: recommends, id: productId });
}

const QUESTIONS = [
  ['آیا این محصول گارانتی رسمی دارد؟', 'بله، تمامی محصولات دارای گارانتی اصالت و سلامت فیزیکی هستند و در صفحه محصول مدت گارانتی ذکر شده است.', 'admin'],
  ['امکان ارسال به شهرستان وجود دارد؟', 'بله، ارسال به همه شهرهای کشور از طریق پست پیشتاز و تیپاکس انجام می‌شود.', 'seller'],
  ['آیا قیمت شامل مالیات بر ارزش افزوده است؟', 'مالیات بر ارزش افزوده در مرحله نهایی خرید و بر اساس نرخ تنظیم‌شده فروشگاه محاسبه و در فاکتور درج می‌شود.', 'admin'],
  ['می‌توانم چند عدد از این محصول سفارش دهم؟', 'بله، با افزایش تعداد، تخفیف پلکانی فعال می‌شود. جدول تخفیف را در صفحه محصول ببینید.', 'buyer'],
];
function seedQuestions(productId, p, idx) {
  if (get('SELECT id FROM questions WHERE product_id=@p LIMIT 1', { p: productId })) return;
  const count = idx % 3 === 0 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const [q, a, role] = QUESTIONS[(idx + i) % QUESTIONS.length];
    const qid = insert('questions', { product_id: productId, user_id: null, body: q, status: 'approved', created_at: new Date(Date.now() - (i * 5 + 3) * 86400000).toISOString().replace('T', ' ').slice(0, 19) });
    insert('answers', { question_id: qid, user_id: null, role_label: role, body: a, created_at: new Date(Date.now() - (i * 5 + 2) * 86400000).toISOString().replace('T', ' ').slice(0, 19) });
  }
}

function seedOrders({ customers, products, sellers, mainSeller, admin }) {
  if (get('SELECT id FROM orders LIMIT 1')) return 0;
  const ordersMod = require('../modules/orders');
  const statuses = ['delivered', 'delivered', 'shipping', 'processing', 'paid', 'pending', 'canceled', 'delivered', 'shipping', 'delivered'];
  let count = 0;
  for (let i = 0; i < Math.min(24, customers.length * 3); i++) {
    const customer = customers[i % customers.length];
    const address = get('SELECT * FROM addresses WHERE user_id=@u LIMIT 1', { u: customer.id });
    if (!address) continue;
    const status = statuses[i % statuses.length];
    const code = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-SM${String(1000 + i)}`;
    const method = get('SELECT * FROM shipping_methods ORDER BY sort LIMIT 1');
    const chosen = [];
    const n = 1 + (i % 3);
    for (let k = 0; k < n; k++) {
      const p = products[(i * 3 + k * 5) % products.length];
      if (p && !chosen.some((c) => c.id === p.id)) chosen.push(p);
    }
    let subtotal = 0, commission = 0;
    const created = new Date(Date.now() - (30 - i) * 86400000).toISOString().replace('T', ' ').slice(0, 19);
    const orderId = insert('orders', {
      code, user_id: customer.id, status, payment_status: status === 'pending' ? 'unpaid' : status === 'canceled' ? 'refunded' : 'paid',
      payment_method: ['zarinpal', 'wallet', 'card2card', 'cod', 'zibal'][i % 5], gateway: ['zarinpal', null, null, null, 'zibal'][i % 5],
      gateway_ref: status !== 'pending' ? 'REF' + String(900000 + i) : null, paid_at: status !== 'pending' ? created : null,
      shipping_method_id: method?.id, shipping_title: method?.title, address_snapshot: jstringify(address),
      receiver_name: customer.name, receiver_phone: customer.phone, postal_code: address.postal_code,
      created_at: created, updated_at: created, affiliate_id: i % 4 === 0 ? customers[0].id : null,
    });
    for (const p of chosen) {
      const qty = 1 + (i % 2);
      const total = p.price * qty;
      subtotal += total;
      const seller = p.seller_id ? get('SELECT commission FROM sellers WHERE id=@id', { id: p.seller_id }) : null;
      const c = seller?.commission ? Math.round(total * seller.commission / 100) : 0;
      commission += c;
      const itemId = insert('order_items', {
        order_id: orderId, product_id: p.id, variant_id: null, seller_id: p.seller_id, title: p.title,
        qty, price: p.price, old_price: p.old_price, total, commission: c,
        status: status === 'pending' ? 'pending' : status, created_at: created,
        tracking_code: ['shipping', 'delivered'].includes(status) ? 'TRK' + String(500000 + i) : null,
        shipped_at: ['shipping', 'delivered'].includes(status) ? created : null,
        delivered_at: status === 'delivered' ? created : null,
      });
      if (p.seller_id) insert('settlements', { seller_id: p.seller_id, order_item_id: itemId, amount: total, commission: c, net: total - c, due_at: new Date(new Date(created).getTime() + 7 * 86400000).toISOString().replace('T', ' ').slice(0, 19), status: status === 'delivered' ? 'paid' : 'pending', paid_at: status === 'delivered' ? created : null, created_at: created });
    }
    const vat = Math.round(subtotal * 9 / 100);
    const shippingCost = subtotal > 5000000 ? 0 : (method?.base_price || 65000);
    const total = subtotal + vat + shippingCost;
    run(`UPDATE orders SET subtotal=@s, vat=@v, shipping_cost=@sh, total=@t, commission_total=@c, invoice_no=@inv,
         tracking_code=@tr, delivered_at=@d WHERE id=@id`,
      { s: subtotal, v: vat, sh: shippingCost, t: total, c: commission, inv: 'INV-' + code, tr: ['shipping', 'delivered'].includes(status) ? 'TRK' + String(500000 + i) : null, d: status === 'delivered' ? created : null, id: orderId });
    insert('order_status_history', { order_id: orderId, status: 'pending', note: 'سفارش ثبت شد', created_at: created });
    if (status !== 'pending') insert('order_status_history', { order_id: orderId, status: 'paid', note: 'پرداخت تایید شد', created_at: created });
    if (['shipping', 'delivered'].includes(status)) insert('order_status_history', { order_id: orderId, status: 'shipping', note: 'بسته تحویل پست شد', created_at: created });
    if (status === 'delivered') insert('order_status_history', { order_id: orderId, status: 'delivered', note: 'تحویل مشتری شد', created_at: created });
    if (status === 'canceled') insert('order_status_history', { order_id: orderId, status: 'canceled', note: 'لغو به درخواست مشتری', created_at: created });

    // تراکنش
    insert('transactions', { user_id: customer.id, owner_type: 'user', owner_id: customer.id, type: 'order', amount: -total, gateway: 'zarinpal', reference: 'REF' + String(900000 + i), order_id: orderId, status: status === 'pending' ? 'pending' : status === 'canceled' ? 'canceled' : 'success', description: `پرداخت سفارش ${code}`, created_at: created });
    if (status === 'delivered') insert('transactions', { user_id: customer.id, owner_type: 'user', owner_id: customer.id, type: 'commission', amount: Math.floor(total / 1000), balance: 0, gateway: 'system', reference: 'CLUB' + i, status: 'success', description: 'امتیاز باشگاه مشتریان', created_at: created });
    count++;
  }
  return count;
}

function seedTickets({ customers, sellers, admin, products }) {
  if (get('SELECT id FROM tickets LIMIT 1')) return;
  const seeds = [
    ['پیگیری وضعیت سفارش', 'سلام، سفارش من سه روز است در وضعیت «در حال پردازش» است. لطفاً بررسی کنید.', 'support', 'normal', 'open'],
    ['درخواست فاکتور رسمی', 'برای خرید سازمانی نیاز به فاکتور رسمی با کد اقتصادی دارم. ممکن است ارسال کنید؟', 'finance', 'normal', 'answered'],
    ['مشکل در ورود به حساب', 'کد ورود پیامک نمی‌شود. شماره من درست است ولی پیامکی دریافت نکردم.', 'technical', 'high', 'answered'],
    ['درخواست فعال‌سازی همکاری در فروش', 'لطفاً قابلیت همکاری در فروش را برای حساب من فعال کنید.', 'sales', 'low', 'closed'],
  ];
  seeds.forEach(([subject, body, dept, priority, status], i) => {
    const owner = customers[i % customers.length];
    const code = 'TK-' + String(100000 + i * 37);
    const created = new Date(Date.now() - (i + 2) * 86400000).toISOString().replace('T', ' ').slice(0, 19);
    const id = insert('tickets', { code, subject, body, department: dept, priority, owner_type: 'user', owner_id: owner.id, status, last_message_at: created, messages_count: 2, created_at: created, updated_at: created });
    insert('ticket_messages', { ticket_id: id, user_id: owner.id, role_label: 'user', body, created_at: created });
    insert('ticket_messages', { ticket_id: id, user_id: admin.id, role_label: 'admin', body: ['سلام، درخواست شما بررسی شد و نتیجه از طریق اعلان به شما اطلاع داده می‌شود.', 'فاکتور رسمی برای شما صادر و در پنل کاربری قرار گرفت.', 'مشکل از سمت سرویس پیامک بود و برطرف شد؛ لطفاً مجدداً تلاش کنید.', 'قابلیت همکاری در فروش برای حساب شما فعال شد.'][i], created_at: created });
  });
  // تیکت فروشنده
  if (sellers[0]) {
    const code = 'TK-' + String(200000);
    const created = now();
    const id = insert('tickets', { code, subject: 'درخواست افزایش سقف برداشت', body: 'با سلام، امکان افزایش سقف برداشت هفتگی برای فروشگاه ما وجود دارد؟', department: 'finance', priority: 'normal', owner_type: 'seller', owner_id: sellers[0].id, seller_id: sellers[0].id, status: 'open', last_message_at: created, messages_count: 1, created_at: created, updated_at: created });
    insert('ticket_messages', { ticket_id: id, user_id: sellers[0].user_id, role_label: 'seller', body: 'با سلام، امکان افزایش سقف برداشت هفتگی برای فروشگاه ما وجود دارد؟', created_at: created });
  }
}

/**
 * داده‌های تکمیلی نمونه: علاقه‌مندی‌ها، مقایسه، هشدار موجودی، دیدگاه‌های مجله،
 * برچسب‌ها، مشترکین خبرنامه، پیش‌فاکتور، حساب بانکی و درخواست برداشت،
 * گردش انبار، پورسانت همکاری در فروش و گزارش پیامک‌ها.
 */
function seedEngagement({ customers, sellers, admin, products, mainSeller }) {
  const days = (n, h = 0) => new Date(Date.now() - n * 86400000 + h * 3600000).toISOString().replace('T', ' ').slice(0, 19);
  const pick = (arr, i) => arr[i % arr.length];

  /* --- علاقه‌مندی‌ها / مقایسه / بازدید اخیر / هشدار کالا --- */
  if (!get('SELECT id FROM favorites LIMIT 1')) {
    customers.forEach((c, ci) => {
      products.slice(ci * 3, ci * 3 + 4).forEach((p) => {
        insert('favorites', { user_id: c.id, product_id: p.id, created_at: days(1 + ci) });
      });
      if (ci < 4) {
        products.slice(ci * 2, ci * 2 + 3).forEach((p) => insert('compare_items', { user_id: c.id, session_id: null, product_id: p.id, created_at: days(ci) }));
      }
      products.slice(ci, ci + 3).forEach((p) => insert('recently_viewed', { user_id: c.id, session_id: null, product_id: p.id, viewed_at: days(0, ci) }));
      if (ci % 3 === 0 && products[ci * 5]) {
        insert('product_alerts', { user_id: c.id, product_id: products[ci * 5].id, kind: ci % 2 ? 'on_sale' : 'in_stock', status: 'active', created_at: days(2 + ci) });
      }
    });
  }

  /* --- برچسب‌های مجله --- */
  if (!get('SELECT id FROM tags LIMIT 1')) {
    const tagNames = new Set();
    all(`SELECT tags FROM posts WHERE tags IS NOT NULL`).forEach((r) => {
      try { (JSON.parse(r.tags) || []).forEach((t) => tagNames.add(String(t))); } catch { /* ignore */ }
    });
    ['راهنمای خرید', 'بررسی تخصصی', 'تخفیف', 'مقایسه', 'نگهداری کالا'].forEach((t) => tagNames.add(t));
    [...tagNames].slice(0, 24).forEach((name) => insert('tags', { name, slug: slugify(name) }));
  }

  /* --- دیدگاه‌های مجله --- */
  if (!get('SELECT id FROM comments LIMIT 1')) {
    const bodies = [
      'ممنون از توضیح کاملتون، واقعاً به کارم آمد.',
      'سوالی داشتم؛ این مورد برای مدل‌های قدیمی‌تر هم صدق می‌کند؟',
      'به نظرم بخش مقایسه قیمت را هم اضافه کنید عالی می‌شود.',
      'من طبق همین راهنما خرید کردم و راضی بودم.',
      'لطفاً درباره گارانتی‌ها هم یک مقاله بنویسید.',
    ];
    const posts = all(`SELECT id FROM posts WHERE status='published' ORDER BY id LIMIT 8`);
    posts.forEach((post, i) => {
      const parent = insert('comments', { post_id: post.id, user_id: pick(customers, i).id, parent_id: null, body: pick(bodies, i), status: i % 4 === 3 ? 'pending' : 'approved', created_at: days(1 + i) });
      if (i % 2 === 0) {
        insert('comments', { post_id: post.id, user_id: pick(customers, i + 2).id, parent_id: parent, body: 'دقیقاً همین سوال برای من هم بود، ممنون می‌شوم پاسخ دهید.', status: 'approved', created_at: days(i, 3) });
      }
    });
  }

  /* --- مشترکین خبرنامه --- */
  if (!get('SELECT id FROM newsletter_subscribers LIMIT 1')) {
    const names = ['نگار احمدی', 'امیر تهرانی', 'سحر موسوی', 'کاوه رستمی', 'مریم شریفی', 'حسین نوری', 'الهام کریمی', 'رضا صادقی'];
    names.forEach((name, i) => insert('newsletter_subscribers', {
      email: `subscriber${i + 1}@example.test`, name, user_id: customers[i] ? customers[i].id : null,
      status: i === 6 ? 'unsubscribed' : 'active', token: randomCode(18), ip: `2.180.${10 + i}.${40 + i}`,
      created_at: days(20 - i), updated_at: days(20 - i), unsubscribed_at: i === 6 ? days(4) : null,
    }));
  }

  /* --- درخواست برداشت (حساب‌های بانکی پیش‌تر در seed ساخته شده‌اند) --- */
  if (!get('SELECT id FROM withdrawals LIMIT 1')) {
    const sellerAccounts = all(`SELECT id, owner_id, owner_name FROM bank_accounts WHERE owner_type='seller' AND status='approved' ORDER BY id LIMIT 4`);
    sellerAccounts.forEach((acc, i) => {
      insert('withdrawals', {
        owner_type: 'seller', owner_id: acc.owner_id, bank_account_id: acc.id, amount: [3500000, 8200000, 1250000, 5400000][i] || 900000,
        status: i === 0 ? 'pending' : (i === 1 ? 'processing' : 'paid'),
        admin_note: i === 0 ? null : (i === 1 ? 'در صف واریز پایا' : 'در تاریخ مقرر واریز شد'),
        reference: i > 1 ? 'W' + randomDigits(8) : null,
        created_at: days(6 - i * 2), updated_at: days(5 - i * 2),
      });
    });
    const userAccounts = all(`SELECT id, owner_id FROM bank_accounts WHERE owner_type='user' AND status='approved' ORDER BY id LIMIT 3`);
    userAccounts.forEach((acc, i) => insert('withdrawals', {
      owner_type: 'user', owner_id: acc.owner_id, bank_account_id: acc.id, amount: [450000, 780000, 1200000][i],
      status: ['pending', 'paid', 'rejected'][i], admin_note: i === 2 ? 'موجودی کیف پول کافی نیست' : (i === 1 ? 'واریز شد' : null),
      reference: i === 1 ? 'W' + randomDigits(8) : null, created_at: days(4 - i), updated_at: days(3 - i),
    }));
  }

  /* --- پیش‌فاکتور --- */
  if (!get('SELECT id FROM preinvoices LIMIT 1')) {
    customers.slice(0, 2).forEach((c, ci) => {
      const items = products.slice(ci * 4, ci * 4 + 3).map((p) => ({ product_id: p.id, title: p.title, qty: 1 + ci, price: p.price, total: p.price * (1 + ci) }));
      const subtotal = items.reduce((a, it) => a + it.total, 0);
      const vat = Math.round(subtotal * 0.09);
      insert('preinvoices', {
        code: 'PI-' + String(4400 + ci * 13), user_id: c.id, created_by: admin.id, items: jstringify(items),
        subtotal, discount: 0, vat, total: subtotal + vat, note: ci ? 'پیش‌فاکتور سازمانی — اعتبار ۷ روز' : 'پیش‌فاکتور خرید عمده',
        status: ci ? 'draft' : 'issued', expires_at: days(-7), created_at: days(4 - ci),
      });
    });
  }

  /* --- گردش انبار --- */
  if (!get('SELECT id FROM stock_movements LIMIT 1')) {
    const wh = all(`SELECT id, owner_type, owner_id FROM warehouses ORDER BY is_default DESC LIMIT 4`);
    products.slice(0, 12).forEach((p, i) => {
      const w = pick(wh, i);
      insert('stock_movements', { warehouse_id: w.id, product_id: p.id, variant_id: null, change: 20 + i, reason: 'purchase', reference: 'PO-' + randomDigits(5), user_id: admin.id, created_at: days(10 - (i % 8)) });
      insert('stock_movements', { warehouse_id: w.id, product_id: p.id, variant_id: null, change: -(2 + (i % 5)), reason: 'sale', reference: 'ORD-' + randomDigits(5), user_id: admin.id, created_at: days(6 - (i % 5)) });
      if (i % 5 === 0) insert('stock_movements', { warehouse_id: w.id, product_id: p.id, variant_id: null, change: -(1 + (i % 3)), reason: 'return', reference: 'RET-' + randomDigits(4), user_id: admin.id, created_at: days(2) });
    });
  }

  /* --- همکاری در فروش: زیرمجموعه‌ها و پورسانت‌ها --- */
  if (!get('SELECT id FROM affiliate_commissions LIMIT 1')) {
    const affiliates = customers.filter((c) => c.is_affiliate).slice(0, 3);
    const targets = customers.slice(3);
    affiliates.forEach((aff, ai) => {
      targets.slice(ai, ai + 3).forEach((buyer) => {
        if (buyer.id === aff.id) return;
        if (!get('SELECT id FROM affiliate_referrals WHERE affiliate_id=@a AND user_id=@u', { a: aff.id, u: buyer.id })) {
          insert('affiliate_referrals', { affiliate_id: aff.id, user_id: buyer.id, level: 1, created_at: days(18 - ai) });
        }
      });
      const orderRows = all(`SELECT o.id AS order_id, oi.id AS item_id, oi.product_id, oi.total, o.user_id
                             FROM orders o JOIN order_items oi ON oi.order_id=o.id
                             WHERE o.payment_status='paid' ORDER BY o.id DESC LIMIT 12`);
      orderRows.slice(ai * 2, ai * 2 + 4).forEach((r, ri) => {
        const level = ri % 3 === 2 ? 'level2' : 'direct';
        const percent = level === 'direct' ? 3 : 1;
        insert('affiliate_commissions', {
          user_id: aff.id, order_id: r.order_id, order_item_id: r.item_id, product_id: r.product_id, buyer_id: r.user_id,
          level, percent, amount: Math.round(r.total * percent / 100), status: ri % 4 === 3 ? 'pending' : 'paid', created_at: days(9 - ri),
        });
      });
    });
  }

  /* --- گزارش ارسال پیامک --- */
  if (!get('SELECT id FROM sms_logs LIMIT 1')) {
    const templates = [['otp', 'کد ورود: {code}'], ['order_paid', 'سفارش {code} با موفقیت پرداخت شد'], ['order_shipped', 'سفارش {code} ارسال شد. کد رهگیری: {tracking}'], ['withdraw_paid', 'مبلغ {amount} به حساب شما واریز شد']];
    customers.slice(0, 6).forEach((c, i) => {
      const [tpl, body] = pick(templates, i);
      insert('sms_logs', { provider: 'mock', phone: c.phone, body, template: tpl, status: i === 4 ? 'failed' : 'sent', response: i === 4 ? 'خطای ارسال: محدودیت موقت سرویس' : '{"status":"ok"}', created_at: days(7 - i) });
    });
  }
}

function seedPageViews(customers) {
  if (get('SELECT id FROM page_views LIMIT 1')) return;
  const paths = ['/', '/products', '/blog', '/faq', '/cart', '/brands', '/page/about-us'];
  for (let d = 29; d >= 0; d--) {
    const count = 40 + Math.floor(Math.random() * 120);
    for (let i = 0; i < count; i++) {
      const p = paths[Math.floor(Math.random() * paths.length)];
      insert('page_views', { path: p, user_id: Math.random() > 0.7 ? customers[Math.floor(Math.random() * customers.length)].id : null, ip: `5.120.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`, ua: 'Mozilla/5.0 (seed)', created_at: new Date(Date.now() - d * 86400000 + Math.random() * 86400000).toISOString().replace('T', ' ').slice(0, 19) });
    }
  }
}

function notifyPushStub() { /* placeholder */ }
const notify = require('../core/notify');

/* ---------------- ریست کامل ---------------- */

function reset() {
  const tables = all(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'meta'`).map((r) => r.name);
  db.pragma('foreign_keys = OFF');
  db.transaction(() => { for (const t of tables) run(`DELETE FROM ${t}`); })();
  db.pragma('foreign_keys = ON');
  try {
    const lock = path.join(require('./index').DATA_DIR, 'installed.lock');
    if (fs.existsSync(lock)) fs.unlinkSync(lock);
  } catch { /* ignore */ }
  setSetting('installed', '0', { group: 'system' });
}

async function main() {
  const args = process.argv.slice(2);
  // اطمینان از وجود جداول پیش از هر کاری (اجرای مستقل اسکریپت)
  const m = migrate();
  if (m.fresh) console.log('▸ ساختار پایگاه داده ایجاد شد (نسخه ' + m.to + ').');
  if (args.includes('--reset')) { console.log('▸ پاکسازی پایگاه داده...'); reset(); console.log('✓ تمام جداول خالی شدند.'); }
  if (args.includes('--reset-only')) return;
  console.log('▸ ساخت داده نمونه...');
  const result = await runSeed({ demo: 'medium' });
  console.log('✓ داده نمونه ساخته شد:', result);
  console.log('');
  console.log('  حساب مدیر:   ' + config.seed.adminPhone + '  /  گذرواژه: ' + config.seed.adminPassword);
  console.log('  حساب فروشنده: 09121000001  /  گذرواژه: 12345678');
  console.log('  حساب مشتری:  09122000001  /  گذرواژه: 12345678');
  console.log('  ورود با کد یکبار مصرف در حالت mock: کد در فلش پیام نمایش داده می‌شود');
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });

module.exports = { runSeed, run: runSeed, reset, writeSeedImage, svgImage };
