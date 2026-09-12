'use strict';
/**
 * آزمون پیوندها — همه hrefهای ثابت در قالب‌ها را با مسیرهای ثبت‌شده مقایسه می‌کند
 * تا پیوند شکسته (صفحه‌ای که مسیرش وجود ندارد) گزارش شود.
 * اجرا: npm run test:links
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const ROUTE_FILES = [
  ['src/modules/routes/storefront.js', ''],
  ['src/modules/routes/authroutes.js', ''],
  ['src/modules/routes/paymentroutes.js', '/payment'],
  ['src/modules/routes/api.js', '/api'],
  ['src/modules/routes/installer.js', '/install'],
  ['src/modules/routes/userpanel.js', '/user'],
  ['src/modules/routes/sellerpanel.js', '/seller'],
  ['src/modules/routes/adminpanel.js', '/admin'],
  ['src/modules/routes/admin/people.js', '/admin/people'],
  ['src/modules/routes/admin/settings.js', '/admin/settings'],
  ['src/modules/routes/admin/content.js', '/admin/content'],
  ['src/modules/routes/admin/system.js', '/admin/system'],
];

/* ---------- مسیرهای ثبت‌شده (GET و POST) ---------- */
function collectRoutes() {
  const get = new Set();
  const post = new Set();
  for (const [file, prefix] of ROUTE_FILES) {
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, 'utf8');
    const re = /router\.(get|post)\(\s*(\[[^\]]*\]|[`'"][^`'"]+[`'"])/g;
    let m;
    while ((m = re.exec(src))) {
      const raw = m[2];
      const paths = raw.trim().startsWith('[')
        ? [...raw.matchAll(/[`'"]([^`'"]+)[`'"]/g)].map((x) => x[1])
        : [raw.slice(1, -1)];
      for (const seg of paths) {
        const p = (prefix + (seg === '/' ? '' : seg)) || '/';
        (m[1] === 'get' ? get : post).add(p);
      }
    }
  }
  return { get: [...get], post: [...post] };
}

/** تبدیل الگوی مسیر به عبارت منظم */
function toRegex(pattern) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '[^/]+');
  return new RegExp('^' + escaped + '/?$');
}

/* ---------- جمع‌آوری hrefها از قالب‌ها و اسکریپت‌ها ---------- */
function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (f.endsWith('.ejs')) out.push(p);
  }
  return out;
}

const STATIC_EXT = /\.(css|js|svg|png|jpg|jpeg|webp|gif|ico|woff2?|ttf|xml|txt|json|mp4|webm|mp3)$/i;

function collectLinks() {
  const links = [];
  const push = (file, url, index, src) => {
    if (!url || url.startsWith('//') || STATIC_EXT.test(url)) return;
    links.push({ file: path.relative(ROOT, file), url, line: src.slice(0, index).split('\n').length });
  };

  // ۱) قالب‌ها: href / action / data-url
  for (const file of walk(path.join(ROOT, 'src', 'views'))) {
    const src = fs.readFileSync(file, 'utf8');
    const re = /(?:href|action|data-url)="(\/[^"#<%\s]*)"/g;
    let m;
    while ((m = re.exec(src))) push(file, m[1], m.index, src);
    // ۲) مسیرهای ساخته‌شده در جاوااسکریپتِ درون قالب: fetch('/x') یا location.href = '/x'
    const jsRe = /(?:fetch\(|location\.href\s*=\s*|window\.location\s*=\s*|url:\s*)['"`](\/[A-Za-z0-9_/\-:.{}$]*)['"`]/g;
    while ((m = jsRe.exec(src))) {
      if (m[1].includes('${') || m[1].includes('<%')) continue;
      push(file, m[1], m.index, src);
    }
  }

  // ۳) پیوندهای اعلان‌ها در کد سمت سرور (link: '…')
  const serverFiles = [];
  (function walkJs(dir) {
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      const st = fs.statSync(fp);
      if (st.isDirectory()) { if (!['views', 'public'].includes(f)) walkJs(fp); }
      else if (f.endsWith('.js')) serverFiles.push(fp);
    }
  })(path.join(ROOT, 'src'));
  for (const file of serverFiles) {
    const src = fs.readFileSync(file, 'utf8');
    const re = /link:\s*([`'"])(\/[^`'"\s]*)\1(\s*\+)?/g;
    let m;
    while ((m = re.exec(src))) {
      // مسیرهایی که با الحاق یا قالب ساخته می‌شوند کامل نیستند — نادیده گرفته می‌شوند
      if (m[3] || m[2].includes('${') || m[2].includes('<%')) continue;
      push(file, m[2].split('?')[0], m.index, src);
    }
  }

  // ۴) اسکریپت سمت کلاینت
  const jsFile = path.join(ROOT, 'src', 'public', 'js', 'app.js');
  if (fs.existsSync(jsFile)) {
    const src = fs.readFileSync(jsFile, 'utf8');
    const re = /(?:fetch\(|location\.href\s*=\s*|url:\s*)['"`](\/[A-Za-z0-9_/\-:.{}$]*)['"`]/g;
    let m;
    while ((m = re.exec(src))) {
      if (m[1].includes('${')) continue;
      push(jsFile, m[1], m.index, src);
    }
  }
  return links;
}

/* ---------- اجرای بررسی ---------- */
const { get: getRoutes, post: postRoutes } = collectRoutes();
const getRes = getRoutes.map(toRegex);
const postRes = postRoutes.map(toRegex);
const staticPaths = ['/'];

const links = collectLinks();
const broken = [];
const seen = new Set();
for (const l of links) {
  const url = l.url.split('?')[0];
  if (staticPaths.includes(url)) continue;
  const key = url;
  const okGet = getRes.some((r) => r.test(url));
  const okPost = postRes.some((r) => r.test(url));
  if (!okGet && !okPost && !seen.has(key)) { seen.add(key); broken.push(l); }
}

console.log(`\n▸ بررسی پیوندها — ${links.length} پیوند در ${new Set(links.map((l) => l.file)).size} قالب`);
console.log(`  مسیرهای ثبت‌شده: ${getRoutes.length} GET · ${postRoutes.length} POST`);
if (broken.length) {
  console.log(`\n✗ ${broken.length} پیوند بدون مسیر متناظر:`);
  broken.forEach((b) => console.log(`   - ${b.url}   (${b.file}:${b.line})`));
  console.log('');
  process.exit(1);
}
console.log('\n✓ همه پیوندهای قالب‌ها به مسیرهای ثبت‌شده اشاره می‌کنند.\n');
