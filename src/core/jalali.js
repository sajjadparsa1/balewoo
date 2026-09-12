'use strict';
/**
 * تبدیل تاریخ میلادی <-> شمسی (الگوریتم استاندارد jalaali-js، پیاده‌سازی مستقل)
 */

function div(a, b) { return ~~(a / b); }
function mod(a, b) { return a - ~~(a / b) * b; }

const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

function jalCal(jy) {
  const bl = breaks.length;
  const gy = jy + 621;
  let leapJ = -14, jp = breaks[0], jm, jump, leap, n, i;
  if (jy < jp || jy >= breaks[bl - 1]) throw new Error('Invalid Jalali year ' + jy);
  for (i = 1; i < bl; i += 1) {
    jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let jd, jm, k;
  k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    } else {
      k -= 186;
    }
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
    + div(153 * mod(gm + 9, 12) + 2, 5)
    + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn) {
  let j, i, gd, gm, gy;
  j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  i = div(mod(j, 1461), 4) * 5 + 308;
  gd = div(mod(i, 153), 5) + 1;
  gm = mod(div(i, 153), 12) + 1;
  gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

function toJalali(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d2j(g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()));
}

function fromJalali(jy, jm, jd) {
  const r = d2g(j2d(jy, jm, jd));
  return new Date(r.gy, r.gm - 1, r.jd);
}

function zeroPad(n) { return String(n).padStart(2, '0'); }

/** 1404/06/21 */
function formatJalali(date, sep = '/') {
  const j = toJalali(date);
  return `${j.jy}${sep}${zeroPad(j.jm)}${sep}${zeroPad(j.jd)}`;
}

/** ۲۱ شهریور ۱۴۰۴ */
function formatJalaliLong(date) {
  const j = toJalali(date);
  return `${toPersianDigits(j.jd)} ${MONTHS[j.jm - 1]} ${toPersianDigits(j.jy)}`;
}

/** شنبه ۲۱ شهریور ۱۴۰۴ - ۱۴:۳۰ */
function formatJalaliFull(date) {
  const d = date instanceof Date ? date : new Date(date);
  const jsDay = (d.getUTCDay() + 1) % 7; // Saturday based on local server tz (UTC)
  return `${WEEKDAYS[jsDay]} ${formatJalaliLong(d)} - ${toPersianDigits(zeroPad(d.getUTCHours()))}:${toPersianDigits(zeroPad(d.getUTCMinutes()))}`;
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function toPersianDigits(input) {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[+d]).replace(/,/g, '٬');
}
function toEnglishDigits(input) {
  const map = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٬': '', '،': ',' };
  return String(input).replace(/[۰-۹٬،]/g, (d) => map[d]);
}

/** فاصله دو تاریخ به روز */
function daysBetween(a, b) {
  const d1 = a instanceof Date ? a : new Date(a);
  const d2 = b instanceof Date ? b : new Date(b);
  return Math.round((d2 - d1) / 86400000);
}

/** "۳ روز پیش" */
function timeAgo(date) {
  const d = date instanceof Date ? date : new Date(date);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'لحظاتی پیش';
  if (s < 3600) return toPersianDigits(Math.floor(s / 60)) + ' دقیقه پیش';
  if (s < 86400) return toPersianDigits(Math.floor(s / 3600)) + ' ساعت پیش';
  if (s < 86400 * 30) return toPersianDigits(Math.floor(s / 86400)) + ' روز پیش';
  return formatJalali(d);
}

module.exports = {
  toJalali, fromJalali, formatJalali, formatJalaliLong, formatJalaliFull,
  toPersianDigits, toEnglishDigits, daysBetween, timeAgo, MONTHS, WEEKDAYS, WEEKDAYS_SHORT, j2d, d2j, g2d, d2g,
};
