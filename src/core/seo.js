'use strict';
const { setting } = require('../db');
const { escapeHtml, numberFormat } = require('./utils');
const { formatJalali } = require('./jalali');

/**
 * سازنده متاتگ‌ها، Open Graph، Twitter Card و Google Schema (JSON-LD)
 */

function siteUrl(path = '') {
  const base = setting('site_url', '') || '';
  return (base.replace(/\/$/, '') + '/' + String(path || '').replace(/^\//, '')).replace(/([^:])\/{2,}/g, '$1/');
}

function meta(options = {}) {
  const site = setting('site_name', 'بالی‌وو');
  const title = options.title ? `${options.title} | ${site}` : (options.fullTitle || `${site} — ${setting('site_slogan', 'فروشگاه اینترنتی')}`);
  const desc = options.desc || setting('site_description', 'فروشگاه اینترنتی چندفروشندگی بالی‌وو');
  const canonical = options.canonical || siteUrl(options.path || '');
  const image = options.image ? (options.image.startsWith('http') ? options.image : siteUrl(options.image)) : siteUrl(setting('site_og_image', '/img/og-default.svg'));
  const noindex = options.noindex ? '<meta name="robots" content="noindex,nofollow">' : '';

  let schema = '';
  if (options.schema) schema = `<script type="application/ld+json">${JSON.stringify(options.schema)}</script>`;

  return {
    title,
    desc,
    html: `
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
${options.keywords ? `<meta name="keywords" content="${escapeHtml(options.keywords)}">` : ''}
<link rel="canonical" href="${escapeHtml(canonical)}">
${noindex}
<meta property="og:type" content="${options.ogType || 'website'}">
<meta property="og:site_name" content="${escapeHtml(site)}">
<meta property="og:locale" content="fa_IR">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(desc)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
${schema}`.trim(),
  };
}

/* ---------------- Schema.org ---------------- */

function schemaOrganization() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: setting('site_name', 'بالی‌وو'),
    url: siteUrl(),
    logo: siteUrl(setting('site_logo', '/img/logo.svg')),
    contactPoint: [{ '@type': 'ContactPoint', telephone: setting('site_phone', ''), contactType: 'customer support', availableLanguage: ['Persian'] }],
    sameArea: [],
  };
}

function schemaWebsite() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: setting('site_name', 'بالی‌وو'),
    url: siteUrl(),
    inLanguage: 'fa-IR',
    potentialAction: {
      '@type': 'SearchAction',
      target: siteUrl('/products?search={search_term_string}'),
      'query-input': 'required name=search_term_string',
    },
  };
}

function schemaProduct(p, opts = {}) {
  const offers = [];
  for (const v of opts.variants || []) {
    offers.push({
      '@type': 'Offer',
      price: v.price,
      priceCurrency: 'IRR',
      availability: v.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      sku: v.sku || undefined,
      url: siteUrl('/product/' + p.slug),
    });
  }
  if (!offers.length) {
    offers.push({
      '@type': 'Offer',
      price: p.price,
      priceCurrency: 'IRR',
      availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: siteUrl('/product/' + p.slug),
    });
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    image: (opts.images || []).map((i) => siteUrl(i)),
    description: p.short_desc || undefined,
    sku: p.sku || undefined,
    mpn: p.product_code || undefined,
    brand: p.brand_name ? { '@type': 'Brand', name: p.brand_name } : undefined,
    category: p.category_name || undefined,
    aggregateRating: p.rating_count ? { '@type': 'AggregateRating', ratingValue: (p.rating_sum / p.rating_count).toFixed(1), reviewCount: p.rating_count, bestRating: 5 } : undefined,
    offers: offers.length === 1 ? offers[0] : { '@type': 'AggregateOffer', lowPrice: Math.min(...offers.map((o) => o.price)), highPrice: Math.max(...offers.map((o) => o.price)), offerCount: offers.length, priceCurrency: 'IRR', offers },
    review: (opts.reviews || []).map((r) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: r.author || 'کاربر' },
      datePublished: r.created_at ? formatJalali(r.created_at) : undefined,
      reviewBody: r.body,
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5 },
    })),
  };
}

function schemaBreadcrumb(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: siteUrl(it.url) })),
  };
}

function schemaArticle(post, author) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    image: post.cover ? [siteUrl(post.cover)] : undefined,
    datePublished: post.published_at || post.created_at,
    author: { '@type': 'Organization', name: author || setting('site_name', 'بالی‌وو') },
    publisher: { '@type': 'Organization', name: setting('site_name', 'بالی‌وو'), logo: { '@type': 'ImageObject', url: siteUrl(setting('site_logo', '/img/logo.svg')) } },
    mainEntityOfPage: siteUrl('/blog/' + post.slug),
    inLanguage: 'fa-IR',
  };
}

function schemaFaq(rows) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: rows.map((r) => ({ '@type': 'Question', name: r.question, acceptedAnswer: { '@type': 'Answer', text: String(r.answer || '').replace(/<[^>]*>/g, '') } })),
  };
}

module.exports = { siteUrl, meta, schemaOrganization, schemaWebsite, schemaProduct, schemaBreadcrumb, schemaArticle, schemaFaq, numberFormat };
