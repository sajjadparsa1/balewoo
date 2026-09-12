'use strict';
/**
 * تولید بارکد Code 39 به‌صورت SVG — بدون وابستگی خارجی.
 * هر نویسه با ۹ عنصر (۵ میله و ۴ فاصله)编码 می‌شود؛ ۱ = پهن، ۰ = باریک.
 */

const PATTERNS = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000', '4': '000110001',
  '5': '100110000', '6': '001110000', '7': '000100101', '8': '100100100', '9': '001100100',
  'A': '100001001', 'B': '001001001', 'C': '101001000', 'D': '000011001', 'E': '100011000',
  'F': '001011000', 'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
  'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011', 'O': '100010010',
  'P': '001010010', 'Q': '000000111', 'R': '100000110', 'S': '001000110', 'T': '000010110',
  'U': '110000001', 'V': '011000001', 'W': '111000000', 'X': '010010001', 'Y': '110010000',
  'Z': '011010000', '-': '010000101', '.': '110000100', ' ': '011000100',
  '$': '010101000', '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100',
};

const NARROW = 2;      // عرض عنصر باریک
const WIDE = 5;        // عرض عنصر پهن
const GAP = 2;         // فاصله بین نویسه‌ها

/** نرمال‌سازی ورودی به نویسه‌های مجاز Code 39 */
function normalize(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/[^0-9A-Z\-. $/+%]/g, '-')
    .slice(0, 40);
}

/**
 * تولید SVG بارکد
 * @param {string} text متن بارکد
 * @param {{height?:number, showText?:boolean, margin?:number}} opts
 * @returns {string} markup
 */
function svg(text, opts = {}) {
  const value = normalize(text);
  const height = opts.height || 56;
  const showText = opts.showText !== false;
  const margin = opts.margin ?? 6;
  const chars = ['*', ...value.split(''), '*'];

  let x = margin;
  let bars = '';
  for (const ch of chars) {
    const pattern = PATTERNS[ch] || PATTERNS['-'];
    for (let i = 0; i < 9; i++) {
      const w = pattern[i] === '1' ? WIDE : NARROW;
      if (i % 2 === 0) bars += `<rect x="${x}" y="${margin}" width="${w}" height="${height}" fill="#000"/>`;
      x += w;
    }
    x += GAP;
  }
  const width = x - GAP + margin;
  const totalHeight = height + margin * 2 + (showText ? 18 : 0);
  const label = showText
    ? `<text x="${width / 2}" y="${height + margin + 14}" text-anchor="middle" font-family="monospace" font-size="12" fill="#000">${escapeXml(value)}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${totalHeight}" width="${width}" height="${totalHeight}" role="img" aria-label="بارکد ${escapeXml(value)}">${bars}${label}</svg>`;
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

module.exports = { svg, normalize, PATTERNS };
