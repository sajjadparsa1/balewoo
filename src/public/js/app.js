/* ==========================================================================
   Balewoo Shop — client side
   ناوبری بدون رفرش، تم شب/روز، سبد AJAX، جستجوی زنده، نمودار، صفحه‌ساز و…
   ========================================================================== */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;

  /* ---------- تم ---------- */
  const THEME_KEY = 'balewoo-theme';
  function applyTheme(t) {
    if (t === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    localStorage.setItem(THEME_KEY, t);
    $$('[data-theme-toggle]').forEach((b) => b.setAttribute('aria-label', t === 'dark' ? 'حالت روز' : 'حالت شب'));
  }
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (prefers && document.body?.dataset.autoDark === '1' ? 'dark' : 'light'));
  }
  initTheme();
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  /* ---------- اعلان (toast) ---------- */
  function toast(message, type = 'info', timeout = 4200) {
    let wrap = $('.flash-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'flash-wrap'; document.body.appendChild(wrap); }
    const el = document.createElement('div');
    el.className = 'flash ' + type;
    el.innerHTML = `<span>${ICON[type === 'success' ? 'check' : type === 'danger' ? 'x' : type === 'warning' ? 'alert' : 'info']}</span><div>${escapeHtml(message)}</div><button class="close" aria-label="بستن">&times;</button>`;
    wrap.appendChild(el);
    const kill = () => { el.style.opacity = '0'; el.style.transform = 'translateX(-20px)'; setTimeout(() => el.remove(), 220); };
    el.querySelector('.close').addEventListener('click', kill);
    if (timeout) setTimeout(kill, timeout);
    return el;
  }
  window.toast = toast;
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  const ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  };

  /* ---------- فلش‌های سمت سرور ---------- */
  setTimeout(() => $$('.flash[data-auto]').forEach((f) => { f.style.opacity = '0'; setTimeout(() => f.remove(), 300); }), 5200);
  document.addEventListener('click', (e) => { const c = e.target.closest('.flash .close'); if (c) c.closest('.flash').remove(); });

  /* ---------- ناوبری SPA-مانند (بدون رفرش) ---------- */
  const SPA_ENABLED = document.body?.dataset.spa === '1';
  if (SPA_ENABLED && window.history?.pushState) {
    let busy = false;
    document.addEventListener('click', async (e) => {
      const a = e.target.closest('a[data-spa], .nav-link, .side-link, .p-card .title, .pagination a');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(href, location.origin);
      if (url.origin !== location.origin) return;
      if (url.pathname.startsWith('/admin') !== location.pathname.startsWith('/admin')) return;
      if (url.pathname.startsWith('/seller') !== location.pathname.startsWith('/seller')) return;
      if (url.pathname.startsWith('/user') !== location.pathname.startsWith('/user')) return;
      e.preventDefault();
      if (busy) return;
      busy = true;
      try {
        const res = await fetch(url, { headers: { 'X-Spa': '1' } });
        if (!res.ok) throw new Error('bad status');
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const target = doc.querySelector('#spa-content') || doc.body;
        const current = $('#spa-content') || document.body;
        current.innerHTML = target.innerHTML;
        document.title = doc.title;
        history.pushState({}, '', url);
        window.scrollTo({ top: 0, behavior: 'instant' });
        boot();
      } catch (err) { location.href = url; }
      busy = false;
    });
    window.addEventListener('popstate', () => location.reload());
  }

  /* ---------- منوی موبایل و مگامنو ---------- */
  function initNav() {
    const toggle = $('[data-nav-toggle]');
    const nav = $('#mainNav');
    if (toggle && nav) toggle.addEventListener('click', () => nav.classList.toggle('mobile-open'));
    $$('[data-mega-toggle]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const li = b.closest('.has-mega');
      const open = li.classList.contains('open');
      $$('.has-mega.open').forEach((x) => x.classList.remove('open'));
      if (!open) li.classList.add('open');
    }));
    document.addEventListener('click', (e) => { if (!e.target.closest('.has-mega')) $$('.has-mega.open').forEach((x) => x.classList.remove('open')); });

    const sToggle = $('[data-sidebar-toggle]');
    const sidebar = $('#panelSidebar');
    if (sToggle && sidebar) sToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      let bd = $('#sidebarBackdrop');
      if (!bd) { bd = document.createElement('div'); bd.id = 'sidebarBackdrop'; bd.className = 'drawer-backdrop'; document.body.appendChild(bd); bd.addEventListener('click', () => { sidebar.classList.remove('open'); bd.classList.remove('open'); }); }
      bd.classList.toggle('open', sidebar.classList.contains('open'));
    });
  }

  /* ---------- جستجوی زنده ---------- */
  function initSearch() {
    const box = $('.search-box');
    if (!box) return;
    const input = box.querySelector('input');
    const panel = box.querySelector('.search-suggest');
    if (!input || !panel) return;
    let timer, abort;
    const render = (data) => {
      let html = '';
      if (data.products?.length) {
        html += `<div class="suggest-group"><div class="suggest-title">محصولات</div>` + data.products.map((p) =>
          `<a class="suggest-item" href="/product/${encodeURIComponent(p.slug)}"><img src="${p.cover || p.image || '/img/placeholder-product.svg'}" alt=""><div class="grow"><div class="t">${escapeHtml(p.title)}</div><div class="p">${p.stock > 0 ? fmt(p.price) + ' تومان' : 'ناموجود'}</div></div></a>`).join('') + `</div>`;
      }
      if (data.categories?.length) {
        html += `<div class="suggest-group"><div class="suggest-title">دسته‌بندی‌ها</div>` + data.categories.map((c) => `<a class="suggest-item" href="/products?cat=${encodeURIComponent(c.slug)}"><div class="t">${escapeHtml(c.name)}</div></a>`).join('') + `</div>`;
      }
      if (data.brands?.length) {
        html += `<div class="suggest-group"><div class="suggest-title">برندها</div>` + data.brands.map((b) => `<a class="suggest-item" href="/brand/${encodeURIComponent(b.slug)}">${b.logo ? `<img src="${b.logo}" alt="">` : ''}<div class="t">${escapeHtml(b.name)}</div></a>`).join('') + `</div>`;
      }
      if (!html) html = `<div class="suggest-group"><div class="suggest-item"><div class="t text-muted">نتیجه‌ای یافت نشد</div></div></div>`;
      panel.innerHTML = html;
      panel.classList.add('open');
    };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { panel.classList.remove('open'); return; }
      timer = setTimeout(async () => {
        abort?.abort(); abort = new AbortController();
        try {
          const r = await fetch('/api/search?q=' + encodeURIComponent(q), { signal: abort.signal });
          render(await r.json());
        } catch { /* ignore */ }
      }, 260);
    });
    input.addEventListener('focus', () => { if (panel.innerHTML && input.value.trim().length >= 2) panel.classList.add('open'); });
    document.addEventListener('click', (e) => { if (!box.contains(e.target)) panel.classList.remove('open'); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const f = panel.querySelector('a.suggest-item'); if (f && panel.classList.contains('open')) { e.preventDefault(); location.href = f.href; } }
      if (e.key === 'Escape') panel.classList.remove('open');
    });
  }
  function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }
  function faNum(n) { return fmt(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]).replace(/,/g, '٬'); }
  window.faNum = faNum; window.fmt = fmt;

  /* ---------- سبد خرید AJAX ---------- */
  function setCartBadge(n) {
    $$('[data-cart-count]').forEach((el) => { el.textContent = faNum(n); el.classList.toggle('hidden', !n); });
  }
  function initCart() {
    document.addEventListener('submit', async (e) => {
      const form = e.target.closest('form[data-ajax]');
      if (!form) return;
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      const old = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
      try {
        const r = await fetch(form.action || location.href, { method: form.method || 'POST', body: new FormData(form), headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
        const data = await r.json();
        if (data.ok !== false) {
          if (data.message) toast(data.message, 'success');
          if (data.totals) { setCartBadge(data.totals.count); if (window.__renderCart) window.__renderCart(data.totals); }
          else if (data.redirect) location.href = data.redirect;
          else if (form.dataset.reload) location.reload();
        } else {
          toast(data.error || 'خطا در انجام عملیات', 'danger');
        }
      } catch (err) { toast('خطای اتصال به سرور', 'danger'); }
      if (btn) { btn.disabled = false; btn.innerHTML = old; }
    });

    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-cart-add]');
      if (!btn) return;
      e.preventDefault();
      const pid = btn.dataset.productId;
      const vid = document.querySelector('[data-variant-input]:checked')?.value || '';
      const qty = $('[data-qty-input]')?.value || 1;
      const opts = $$('[data-option-check]:checked').map((c) => c.value);
      const fd = new FormData();
      fd.append('product_id', pid); if (vid) fd.append('variant_id', vid);
      fd.append('qty', qty); opts.forEach((o) => fd.append('option_ids', o));
      const old = btn.innerHTML;
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
      try {
        const r = await fetch('/cart/add', { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
        const data = await r.json();
        if (data.ok) { toast(data.message || 'به سبد خرید اضافه شد', 'success'); setCartBadge((parseInt($('[data-cart-count]')?.dataset.n || '0') || 0) + parseInt(qty)); location.reload(); }
        else toast(data.error || 'خطا', 'danger');
      } catch { toast('خطای اتصال', 'danger'); }
      btn.disabled = false; btn.innerHTML = old;
    });

    document.addEventListener('click', async (e) => {
      const fav = e.target.closest('[data-favorite]');
      if (!fav) return;
      e.preventDefault();
      try {
        const fd = new FormData(); fd.append('product_id', fav.dataset.productId);
        const r = await fetch('/favorites/toggle', { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
        const d = await r.json();
        if (d.redirect) { location.href = d.redirect + '?prev=' + encodeURIComponent(location.pathname); return; }
        fav.classList.toggle('active', d.favorited);
        fav.setAttribute('aria-pressed', d.favorited);
        toast(d.favorited ? 'به علاقمندی‌ها اضافه شد' : 'از علاقمندی‌ها حذف شد', d.favorited ? 'success' : 'info', 2200);
      } catch { toast('خطا', 'danger'); }
    });

    document.addEventListener('click', async (e) => {
      const c = e.target.closest('[data-compare]');
      if (!c) return;
      e.preventDefault();
      const fd = new FormData(); fd.append('product_id', c.dataset.productId);
      const r = await fetch(c.dataset.remove ? '/compare/remove' : '/compare/add', { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
      const d = await r.json();
      if (d.error) toast(d.error, 'warning'); else toast(d.message || (d.ok ? 'انجام شد' : ''), 'success', 2200);
      c.classList.toggle('active', !c.dataset.remove);
    });
  }

  /* ---------- انتخاب متغیر و محاسبه قیمت ---------- */
  function initVariants() {
    const wrap = $('[data-variants]');
    if (!wrap) return;
    const recalc = async () => {
      const pid = wrap.dataset.productId;
      const vid = $('[data-variant-input]:checked')?.value || '';
      const qty = parseInt($('[data-qty-input]')?.value || '1', 10);
      const opts = $$('[data-option-check]:checked').map((c) => parseInt(c.value));
      const fd = new FormData();
      if (vid) fd.append('variant_id', vid);
      fd.append('qty', qty); opts.forEach((o) => fd.append('option_ids', o));
      try {
        const r = await fetch(`/api/products/${pid}/price`, { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
        const d = await r.json();
        const priceEl = $('[data-price-now]');
        const oldEl = $('[data-price-old]');
        const offEl = $('[data-price-off]');
        const totalEl = $('[data-price-total]');
        const instEl = $('[data-installment]');
        const stockEl = $('[data-stock-text]');
        if (priceEl) priceEl.textContent = faNum(d.unit_price);
        if (oldEl) { oldEl.textContent = d.unit_old_price > d.unit_price ? faNum(d.unit_old_price) : ''; }
        if (offEl) { offEl.textContent = d.percent ? faNum(d.percent) + '٪' : ''; offEl.classList.toggle('hidden', !d.percent); }
        if (totalEl) totalEl.textContent = faNum(d.total);
        if (instEl) instEl.textContent = d.installment;
        if (stockEl) stockEl.textContent = '';
        // برجسته‌سازی ردیف تخفیف پلکانی فعال
        $$('[data-tier-row]').forEach((tr) => tr.classList.toggle('best', d.tier && parseInt(tr.dataset.tierQty) === d.tier.min_qty));
      } catch { /* ignore */ }
    };
    wrap.addEventListener('change', recalc);
    $$('[data-option-check]').forEach((c) => c.addEventListener('change', recalc));
    $$('[data-qty-input]').forEach((i) => i.addEventListener('change', recalc));
    document.addEventListener('click', (e) => {
      const q = e.target.closest('[data-qty-step]');
      if (!q) return;
      const input = $('[data-qty-input]');
      if (!input) return;
      let v = parseInt(input.value || '1', 10) + parseInt(q.dataset.qtyStep, 10);
      const min = parseInt(input.min || '1', 10), max = parseInt(input.max || '999', 10);
      v = Math.max(min, Math.min(max, v));
      input.value = v; input.dispatchEvent(new Event('change'));
    });
  }

  /* ---------- تب‌ها ---------- */
  function initTabs() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      const group = btn.closest('[data-tabs]') || document;
      $$('[data-tab]', group).forEach((b) => b.classList.toggle('active', b === btn));
      const target = btn.dataset.tab;
      $$('[data-pane]', group).forEach((p) => p.classList.toggle('active', p.dataset.pane === target));
      if (btn.dataset.tabScroll) document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const hash = location.hash.replace('#', '');
    if (hash) { const b = $(`[data-tab="${hash}"]`); if (b) b.click(); }
  }

  /* ---------- گالری ---------- */
  function initGallery() {
    const main = $('#galleryMain');
    if (!main) return;
    $$('#galleryThumbs img').forEach((t) => t.addEventListener('click', () => {
      main.src = t.dataset.full || t.src;
      $$('#galleryThumbs img').forEach((x) => x.classList.toggle('active', x === t));
    }));
    // زوم با ماوس
    main.parentElement.addEventListener('mousemove', (e) => {
      if (window.innerWidth < 1024) return;
      const r = main.parentElement.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;
      main.style.transformOrigin = `${x}% ${y}%`;
      main.style.transform = e.type === 'mousemove' && main.parentElement.matches(':hover') ? 'scale(1.6)' : 'scale(1)';
    });
    main.parentElement.addEventListener('mouseleave', () => { main.style.transform = 'scale(1)'; });
  }

  /* ---------- شمارش معکوس ---------- */
  function initCountdowns() {
    const els = $$('[data-countdown]');
    if (!els.length) return;
    const tick = () => {
      els.forEach((el) => {
        const target = new Date(el.dataset.countdown.replace(' ', 'T') + (el.dataset.countdown.includes('Z') ? '' : 'Z')).getTime();
        let diff = Math.max(0, target - Date.now());
        const d = Math.floor(diff / 86400000); diff -= d * 86400000;
        const h = Math.floor(diff / 3600000); diff -= h * 3600000;
        const m = Math.floor(diff / 60000); diff -= m * 60000;
        const s = Math.floor(diff / 1000);
        el.innerHTML = [[d, 'روز'], [h, 'ساعت'], [m, 'دقیقه'], [s, 'ثانیه']].filter(([v]) => v > 0 || true).map(([v, l]) => `<span>${String(v).padStart(2, '0')}<small>${l}</small></span>`).join('');
      });
    };
    tick(); setInterval(tick, 1000);
  }

  /* ---------- اسلایدر ---------- */
  function initSliders() {
    $$('[data-slider]').forEach((s) => {
      const track = s.querySelector('.slider-track');
      const slides = $$('.slider-slide', s);
      if (!slides.length) return;
      let i = 0, timer;
      const dots = s.querySelector('.slider-dots');
      if (dots) { dots.innerHTML = slides.map((_, k) => `<button data-i="${k}" class="${k === 0 ? 'active' : ''}" aria-label="اسلاید ${k + 1}"></button>`).join(''); }
      const go = (n) => {
        i = (n + slides.length) % slides.length;
        track.style.transform = `translateX(${i * 100}%)`;
        $$('.slider-dots button', s).forEach((b, k) => b.classList.toggle('active', k === i));
      };
      s.querySelector('.slider-nav.prev')?.addEventListener('click', () => { go(i - 1); reset(); });
      s.querySelector('.slider-nav.next')?.addEventListener('click', () => { go(i + 1); reset(); });
      dots?.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) { go(+b.dataset.i); reset(); } });
      const auto = s.dataset.slider;
      function reset() { clearInterval(timer); if (auto && auto !== 'manual') timer = setInterval(() => go(i + 1), parseInt(auto, 10) || 5000); }
      reset();
      // سوایپ
      let x0 = null;
      s.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      s.addEventListener('touchend', (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) go(dx > 0 ? i - 1 : i + 1);
        x0 = null; reset();
      });
    });
  }

  /* ---------- نمودارها (canvas بدون کتابخانه) ---------- */
  const CHART_COLORS = ['#4f46e5', '#0ea5e9', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
  function cssVar(name, fallback) { const v = getComputedStyle(root).getPropertyValue(name).trim(); return v || fallback; }

  function drawLine(canvas, series, opts = {}) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 600, h = canvas.clientHeight || 240;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
    const pad = { t: 14, r: 12, b: 26, l: 46 };
    const cw = w - pad.l - pad.r, chh = h - pad.t - pad.b;
    const labels = opts.labels || [];
    const maxV = Math.max(1, ...series.flatMap((s) => s.data));
    const grid = cssVar('--border', '#e3e6ef'), text = cssVar('--text-3', '#868ea3');
    ctx.strokeStyle = grid; ctx.fillStyle = text; ctx.font = '10px Vazirmatn, Tahoma'; ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const y = pad.t + (chh / 4) * g;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      const val = maxV - (maxV / 4) * g;
      ctx.textAlign = 'right'; ctx.fillText(shortNum(val), pad.l - 6, y + 3);
    }
    series.forEach((s, si) => {
      const color = s.color || CHART_COLORS[si % CHART_COLORS.length];
      ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.beginPath();
      s.data.forEach((v, k) => {
        const x = pad.l + (cw / Math.max(1, s.data.length - 1)) * k;
        const y = pad.t + chh - (v / maxV) * chh;
        k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      if (opts.fill !== false) {
        const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + chh);
        grad.addColorStop(0, color + '33'); grad.addColorStop(1, color + '00');
        ctx.lineTo(pad.l + cw, pad.t + chh); ctx.lineTo(pad.l, pad.t + chh); ctx.closePath();
        ctx.fillStyle = grad; ctx.fill();
      }
      s.data.forEach((v, k) => {
        const x = pad.l + (cw / Math.max(1, s.data.length - 1)) * k;
        const y = pad.t + chh - (v / maxV) * chh;
        ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      });
    });
    // برچسب محور x (راست به چپ)
    ctx.fillStyle = text; ctx.textAlign = 'center';
    const step = Math.ceil(labels.length / Math.min(8, labels.length || 1));
    labels.forEach((l, k) => { if (k % step === 0) { const x = pad.l + (cw / Math.max(1, labels.length - 1)) * k; ctx.fillText(String(l), x, h - 8); } });
  }

  function drawBars(canvas, series, opts = {}) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 600, h = canvas.clientHeight || 240;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
    const pad = { t: 14, r: 12, b: 26, l: 46 };
    const cw = w - pad.l - pad.r, chh = h - pad.t - pad.b;
    const labels = opts.labels || [];
    const maxV = Math.max(1, ...series.flatMap((s) => s.data));
    const grid = cssVar('--border', '#e3e6ef'), text = cssVar('--text-3', '#868ea3');
    ctx.strokeStyle = grid; ctx.fillStyle = text; ctx.font = '10px Vazirmatn, Tahoma';
    for (let g = 0; g <= 4; g++) {
      const y = pad.t + (chh / 4) * g;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(shortNum(maxV - (maxV / 4) * g), pad.l - 6, y + 3);
    }
    const groupW = cw / Math.max(1, labels.length);
    const barW = Math.min(26, (groupW * 0.72) / series.length);
    labels.forEach((l, k) => {
      series.forEach((s, si) => {
        const v = s.data[k] || 0;
        const bh = (v / maxV) * chh;
        const x = pad.l + groupW * k + (groupW - barW * series.length) / 2 + barW * si;
        const y = pad.t + chh - bh;
        ctx.fillStyle = s.color || CHART_COLORS[si % CHART_COLORS.length];
        roundRect(ctx, x, y, barW - 2, bh, 3); ctx.fill();
      });
      ctx.fillStyle = text; ctx.textAlign = 'center';
      ctx.fillText(String(l), pad.l + groupW * k + groupW / 2, h - 8);
    });
  }

  function drawDonut(canvas, values, labels) {
    const dpr = window.devicePixelRatio || 1;
    const size = Math.min(canvas.clientWidth || 200, canvas.clientHeight || 200);
    canvas.width = size * dpr; canvas.height = size * dpr;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, size, size);
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const cx = size / 2, cy = size / 2, r = size / 2 - 6, ir = r * 0.62;
    let start = -Math.PI / 2;
    values.forEach((v, i) => {
      const ang = (v / total) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + ang); ctx.closePath();
      ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length]; ctx.fill();
      start += ang;
    });
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(cx, cy, ir, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = cssVar('--text', '#111'); ctx.font = 'bold 15px Vazirmatn, Tahoma'; ctx.textAlign = 'center';
    ctx.fillText(shortNum(total), cx, cy + 2);
    ctx.font = '10px Vazirmatn, Tahoma'; ctx.fillStyle = cssVar('--text-3', '#888');
    ctx.fillText('مجموع', cx, cy + 17);
  }
  function roundRect(ctx, x, y, w, h, r) {
    if (h <= 0) return;
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function shortNum(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return String(Math.round(n));
  }

  function initCharts() {
    $$('canvas.chart').forEach((c) => {
      const cfg = JSON.parse(c.dataset.chart || '{}');
      const render = () => {
        if (cfg.type === 'bar') drawBars(c, cfg.series || [], { labels: cfg.labels || [] });
        else if (cfg.type === 'donut') drawDonut(c, cfg.values || [], cfg.labels || []);
        else drawLine(c, cfg.series || [], { labels: cfg.labels || [], fill: cfg.fill !== false });
      };
      render();
      window.addEventListener('resize', debounce(render, 200));
    });
    // اسطوره دونات
    $$('[data-donut-legend]').forEach((el) => {
      const cfg = JSON.parse(el.dataset.donutLegend || '{}');
      const total = (cfg.values || []).reduce((a, b) => a + b, 0) || 1;
      el.innerHTML = (cfg.labels || []).map((l, i) =>
        `<div class="li"><span class="sw" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span><span>${escapeHtml(l)}</span><b style="margin-inline-start:auto">${Math.round((cfg.values[i] / total) * 100)}٪</b></div>`).join('');
    });
  }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  /* ---------- مودال ---------- */
  function openModal(id) { const m = document.getElementById(id); if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; } }
  function closeModal(m) { (m || $('.modal-backdrop.open'))?.classList.remove('open'); document.body.style.overflow = ''; }
  window.openModal = openModal; window.closeModal = closeModal;
  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-modal-open]');
    if (open) { e.preventDefault(); openModal(open.dataset.modalOpen); }
    if (e.target.matches('.modal-backdrop') || e.target.closest('[data-modal-close]')) closeModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  /* ---------- تایید پیش از ارسال ---------- */
  document.addEventListener('submit', (e) => {
    const form = e.target;
    const msg = form.dataset.confirm || form.querySelector('[type=submit]')?.dataset.confirm;
    if (msg && !window.confirm(msg)) e.preventDefault();
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-confirm-click]');
    if (b && !window.confirm(b.dataset.confirmClick)) e.preventDefault();
  });

  /* ---------- کد یکبار مصرف ---------- */
  function initOtp() {
    const wrap = $('.otp-inputs');
    if (!wrap) return;
    const inputs = $$('input', wrap);
    inputs.forEach((inp, i) => {
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
        if (inp.value && inputs[i + 1]) inputs[i + 1].focus();
        syncHidden();
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !inp.value && inputs[i - 1]) inputs[i - 1].focus();
        if (e.key === 'ArrowLeft' && inputs[i + 1]) inputs[i + 1].focus();
        if (e.key === 'ArrowRight' && inputs[i - 1]) inputs[i - 1].focus();
      });
      inp.addEventListener('paste', (e) => {
        e.preventDefault();
        const txt = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, inputs.length);
        txt.split('').forEach((ch, k) => { if (inputs[k]) inputs[k].value = ch; });
        if (txt.length) inputs[Math.min(txt.length, inputs.length - 1)].focus();
        syncHidden();
      });
    });
    function syncHidden() { const h = $('[data-otp-hidden]'); if (h) h.value = inputs.map((x) => x.value).join(''); }
    // تایمر ارسال مجدد
    const timerEl = $('[data-resend-timer]');
    if (timerEl) {
      let left = parseInt(timerEl.dataset.resendTimer, 10) || 0;
      const btn = $('[data-resend-btn]');
      const tick = () => {
        if (left <= 0) { timerEl.classList.add('hidden'); if (btn) { btn.disabled = false; btn.classList.remove('disabled'); } clearInterval(iv); return; }
        timerEl.textContent = `ارسال مجدد کد تا ${faNum(left)} ثانیه`;
        left--;
      };
      if (btn) btn.disabled = left > 0;
      tick(); const iv = setInterval(tick, 1000);
    }
  }

  /* ---------- استوری ---------- */
  function initStories() {
    const viewer = $('#storyViewer');
    if (!viewer) return;
    let list = [], idx = 0, timer;
    const open = async (i) => {
      idx = i; viewer.classList.add('open'); document.body.style.overflow = 'hidden';
      await show();
    };
    const show = async () => {
      clearTimeout(timer);
      const s = list[idx]; if (!s) return close();
      viewer.querySelector('.sv-media').innerHTML = s.media_type === 'video'
        ? `<video src="${s.media_path}" autoplay playsinline></video>` : `<img src="${s.media_path}" alt="">`;
      viewer.querySelector('.sv-head').innerHTML = `${s.logo ? `<img src="${s.logo}" alt="">` : ''}<div><div class="semibold" style="font-size:.85rem">${escapeHtml(s.shop_name || 'بالی‌وو')}</div><div class="text-xs" style="opacity:.7">${escapeHtml(s.label || '')}</div></div>`;
      viewer.querySelector('.sv-progress').innerHTML = list.map((_, k) => `<span><i style="width:${k < idx ? '100' : '0'}%"></i></span>`).join('');
      const bar = viewer.querySelectorAll('.sv-progress i')[idx];
      if (bar) { bar.style.transition = `width ${(s.duration || 5)}s linear`; requestAnimationFrame(() => { bar.style.width = '100%'; }); }
      viewer.querySelector('.sv-link')?.setAttribute('href', s.link || '#');
      viewer.querySelector('.sv-link')?.classList.toggle('hidden', !s.link);
      timer = setTimeout(() => next(), (s.duration || 5) * 1000);
    };
    const next = () => { idx = (idx + 1) % list.length; show(); };
    const prev = () => { idx = (idx - 1 + list.length) % list.length; show(); };
    const close = () => { clearTimeout(timer); viewer.classList.remove('open'); document.body.style.overflow = ''; };
    $$('[data-story]').forEach((el, i) => el.addEventListener('click', () => { list = window.__stories || []; open(i); }));
    viewer.querySelector('.sv-close')?.addEventListener('click', close);
    viewer.querySelector('.sv-next')?.addEventListener('click', next);
    viewer.querySelector('.sv-prev')?.addEventListener('click', prev);
    viewer.addEventListener('click', (e) => { if (e.target === viewer) close(); });
  }

  /* ---------- صفحه‌ساز: drag & drop ---------- */
  function initBuilder() {
    const canvas = $('#builderCanvas');
    if (!canvas) return;
    let dragged = null;
    canvas.addEventListener('dragstart', (e) => {
      dragged = e.target.closest('.canvas-section');
      if (dragged) { dragged.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
    });
    canvas.addEventListener('dragend', () => {
      if (dragged) dragged.classList.remove('dragging');
      dragged = null;
      saveOrder();
    });
    canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragged) return;
      const after = getAfter(canvas, e.clientY);
      if (after == null) canvas.appendChild(dragged); else canvas.insertBefore(dragged, after);
    });
    function getAfter(container, y) {
      const els = $$('.canvas-section:not(.dragging)', container);
      return els.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) return { offset, element: child };
        return closest;
      }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    function saveOrder() {
      const order = $$('.canvas-section', canvas).map((el) => el.dataset.sectionId);
      const form = $('#builderOrderForm');
      if (!form) return;
      form.querySelector('[name=order]').value = JSON.stringify(order);
      fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } })
        .then((r) => r.json()).then(() => toast('ترتیب بخش‌ها ذخیره شد', 'success', 1800)).catch(() => {});
    }
    // جابجایی با دکمه
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-move-section]');
      if (!b) return;
      const sec = b.closest('.canvas-section');
      if (b.dataset.moveSection === 'up' && sec.previousElementSibling) canvas.insertBefore(sec, sec.previousElementSibling);
      if (b.dataset.moveSection === 'down' && sec.nextElementSibling) canvas.insertBefore(sec.nextElementSibling, sec);
      saveOrder();
    });
  }

  /* ---------- انتخابگر مدیا ---------- */
  function initMediaPicker() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-media-pick]');
      if (!b) return;
      e.preventDefault();
      openModal('mediaLibraryModal');
      window.__mediaTarget = b.dataset.mediaPick;
      window.__mediaMulti = b.dataset.mediaMulti === '1';
      $$('#mediaGrid .media-item').forEach((m) => m.classList.remove('selected'));
      loadMedia();
    });
    document.addEventListener('click', (e) => {
      const item = e.target.closest('#mediaGrid .media-item');
      if (!item) return;
      if (window.__mediaMulti) item.classList.toggle('selected');
      else { $$('#mediaGrid .media-item').forEach((m) => m.classList.toggle('selected', m === item)); }
    });
    $('#mediaInsertBtn')?.addEventListener('click', () => {
      const sel = $$('#mediaGrid .media-item.selected').map((m) => m.dataset.path);
      const target = window.__mediaTarget;
      if (!sel.length) return closeModal();
      if (target) {
        const field = document.querySelector(`[name="${target}"]`);
        if (field) field.value = window.__mediaMulti ? (field.value ? field.value + ',' + sel.join(',') : sel.join(',')) : sel[0];
        const prev = document.querySelector(`[data-preview-for="${target}"]`);
        if (prev && !window.__mediaMulti) prev.innerHTML = `<img src="${sel[0]}" alt="" style="max-height:90px;border-radius:10px">`;
      }
      closeModal();
      toast('تصویر انتخاب شد', 'success', 1800);
    });
  }
  async function loadMedia(folder, q) {
    const grid = $('#mediaGrid'); if (!grid) return;
    const search = typeof q === 'string' ? q : (document.getElementById('mediaSearchInput')?.value || '');
    grid.innerHTML = '<div class="empty"><span class="spinner"></span></div>';
    try {
      const base = (document.getElementById('mediaLibraryModal')?.dataset.url || '/admin/system/media').replace(/\?$/, '');
      const sep = base.includes('?') ? '&' : '?';
      const r = await fetch(base + sep + 'ajax=1' + (folder ? '&folder=' + encodeURIComponent(folder) : '') + (search ? '&q=' + encodeURIComponent(search) : ''), { headers: { Accept: 'application/json' } });
      const d = await r.json();
      grid.innerHTML = (d.rows || []).map((m) => `
        <div class="media-item" data-path="${m.path}" data-id="${m.id}">
          <span class="check-badge">✓</span>
          <div class="prev">${m.mime?.startsWith('image') ? `<img src="${m.path}" alt="${escapeHtml(m.alt || '')}" loading="lazy">` : `<div class="text-xs">${escapeHtml((m.mime || '').split('/')[1] || 'file')}</div>`}</div>
          <div class="meta"><div class="n" title="${escapeHtml(m.filename)}">${escapeHtml(m.filename)}</div><div class="text-muted">${m.size ? (m.size / 1024).toFixed(0) + ' KB' : ''}</div></div>
        </div>`).join('') || '<div class="empty">فایلی در کتابخانه نیست</div>';
    } catch { grid.innerHTML = '<div class="empty">خطا در بارگذاری</div>'; }
  }
  window.loadMedia = loadMedia;

  /* جستجوی زنده در کتابخانه مدیا */
  (function () {
    const input = document.getElementById('mediaSearchInput');
    if (!input || input.dataset.wired) return;
    input.dataset.wired = '1';
    let t = null;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => loadMedia(null, input.value), 320); });
  })();

  /* ---------- ویرایشگر متن ---------- */
  function initEditors() {
    $$('[data-editor]').forEach((box) => {
      const area = box.querySelector('.editable');
      const input = box.querySelector('textarea');
      if (!area || !input) return;
      area.innerHTML = input.value;
      area.addEventListener('input', () => { input.value = area.innerHTML; });
      box.querySelectorAll('[data-cmd]').forEach((btn) => btn.addEventListener('click', () => {
        const [cmd, val] = btn.dataset.cmd.split(':');
        area.focus();
        if (cmd === 'formatBlock') document.execCommand('formatBlock', false, val);
        else if (cmd === 'createLink') { const u = prompt('آدرس پیوند:', 'https://'); if (u) document.execCommand('createLink', false, u); }
        else if (cmd === 'insertImage') { const u = prompt('آدرس تصویر:', '/uploads/...'); if (u) document.execCommand('insertImage', false, u); }
        else if (cmd === 'insertHTML') document.execCommand('insertHTML', false, val);
        else document.execCommand(cmd, false, null);
        input.value = area.innerHTML;
      }));
    });
  }

  /* ---------- ردیف‌های تکرارشونده ---------- */
  function initRepeaters() {
    document.addEventListener('click', (e) => {
      const add = e.target.closest('[data-repeater-add]');
      if (add) {
        const tpl = document.getElementById(add.dataset.repeaterAdd);
        const wrap = document.getElementById(add.dataset.repeaterTarget);
        if (!tpl || !wrap) return;
        const clone = tpl.content.cloneNode(true);
        wrap.appendChild(clone);
        return;
      }
      const del = e.target.closest('[data-repeater-remove]');
      if (del) { del.closest('[data-repeater-row]').remove(); return; }
    });
  }

  /* ---------- دکمه بازگشت به بالا ---------- */
  function initToTop() {
    const b = $('#toTop');
    if (!b) return;
    const onScroll = () => b.classList.toggle('show', window.scrollY > 480);
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    b.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  /* ---------- dropdown ---------- */
  function initDropdowns() {
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-dropdown]');
      if (t) { const dd = t.closest('.dropdown'); const open = dd.classList.contains('open'); $$('.dropdown.open').forEach((x) => x.classList.remove('open')); dd.classList.toggle('open', !open); return; }
      if (!e.target.closest('.dropdown')) $$('.dropdown.open').forEach((x) => x.classList.remove('open'));
    });
  }

  /* ---------- انتخاب روش پرداخت / نشانی ---------- */
  function initChoiceCards() {
    document.addEventListener('change', (e) => {
      const input = e.target.closest('[data-choice-group] input');
      if (!input) return;
      const group = input.closest('[data-choice-group]');
      $$('[data-choice-item]', group.parentElement).forEach((el) => el.classList.toggle('active', el.contains(input) && input.checked));
    });
  }

  /* ---------- فیلترهای آرشیو ---------- */
  function initFilters() {
    const form = $('#filterForm');
    if (!form) return;
    const auto = form.dataset.auto === '1';
    if (auto) form.addEventListener('change', debounce(() => form.submit(), 400));
    $$('[data-filter-clear]').forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault();
      $$('input,select', form).forEach((i) => { if (i.type === 'checkbox' || i.type === 'radio') i.checked = false; else if (i.name !== 'cat' && i.name !== 'search') i.value = ''; });
      form.submit();
    }));
    $$('[data-filter-price]').forEach((i) => i.addEventListener('change', debounce(() => form.submit(), 700)));
  }

  /* ---------- ستاره‌دهی ---------- */
  function initRating() {
    $$('[data-rating]').forEach((box) => {
      const input = box.querySelector('input[type=hidden]');
      const stars = $$('svg, button', box);
      box.addEventListener('click', (e) => {
        const s = e.target.closest('[data-value]');
        if (!s) return;
        const v = +s.dataset.value;
        if (input) input.value = v;
        stars.forEach((st) => st.classList.toggle('on', +st.dataset.value <= v));
      });
      box.addEventListener('mouseover', (e) => {
        const s = e.target.closest('[data-value]');
        if (!s) return;
        stars.forEach((st) => st.classList.toggle('on', +st.dataset.value <= +s.dataset.value));
      });
    });
  }

  /* ---------- آمار زنده داشبورد ---------- */
  function initLiveStats() {
    const el = $('[data-live-stats]');
    if (!el) return;
    const load = async () => {
      try {
        const r = await fetch('/api/stats/live', { headers: { Accept: 'application/json' } });
        if (!r.ok) return;
        const d = await r.json();
        Object.entries(d).forEach(([k, v]) => { const t = el.querySelector(`[data-live="${k}"]`); if (t) t.textContent = faNum(v); });
      } catch { /* ignore */ }
    };
    load(); setInterval(load, 30000);
  }

  /* ---------- نقشه (نشان) ---------- */
  function initMap() {
    const el = $('#neshanMap');
    if (!el) return;
    const key = el.dataset.mapKey;
    const lat = parseFloat(el.dataset.lat || '35.7448'), lng = parseFloat(el.dataset.lng || '51.3753');
    if (!key) {
      el.innerHTML = `<div><div class="bold mb-6">نقشه غیرفعال است</div><div class="text-xs">برای فعال‌سازی، کلید API نشان را در «تنظیمات › نقشه» وارد کنید.<br>مختصات فعلی: ${lat}, ${lng}</div></div>`;
      return;
    }
    el.innerHTML = `<iframe src="https://www.neshan.org/maps/embed.html?zoom=14&lat=${lat}&lng=${lng}" width="100%" height="100%" style="border:0" loading="lazy" title="نقشه"></iframe>`;
  }


  /* ---------- ورودی مبلغ با جداکننده هزارگان ---------- */
  function initMoneyInputs() {
    const format = (el) => {
      const raw = String(el.value || '').replace(/[^0-9]/g, '');
      el.value = raw ? Number(raw).toLocaleString('en-US') : '';
      el.dataset.rawValue = raw;
    };
    $$('[data-money-input]').forEach((el) => {
      el.addEventListener('focus', () => { el.value = String(el.value || '').replace(/[^0-9]/g, ''); });
      el.addEventListener('blur', () => format(el));
      el.addEventListener('input', () => { el.dataset.rawValue = String(el.value || '').replace(/[^0-9]/g, ''); });
      if (el.value) format(el);
      const form = el.closest('form');
      if (form && !form.dataset.moneyWired) {
        form.dataset.moneyWired = '1';
        form.addEventListener('submit', () => $$('[data-money-input]', form).forEach((f) => { f.value = String(f.value || '').replace(/[^0-9]/g, ''); }));
      }
    });
  }

  /* ---------- ساخت خودکار آدرس یکتا از عنوان ---------- */
  function initSlugFrom() {
    const fa = 'ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی';
    const en = 'abptscchhxdzrzssszttzzaaghfqkglmnvhy';
    $$('[data-slug-from]').forEach((el) => {
      const src = document.querySelector(el.dataset.slugFrom);
      if (!src) return;
      let touched = !!el.value;
      el.addEventListener('input', () => { touched = true; });
      const build = () => {
        if (touched) return;
        const text = String(src.value || '').trim().toLowerCase()
          .split('').map((ch) => { const i = fa.indexOf(ch); return i > -1 ? en[i] : ch; }).join('')
          .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
        el.value = text;
      };
      src.addEventListener('input', build);
      src.addEventListener('blur', build);
    });
  }

  /* ---------- ناحیه رهاکردن فایل ---------- */
  function initDropzones() {
    $$('[data-dropzone]').forEach((dz) => {
      const input = dz.querySelector('input[type="file"]') || (dz.dataset.target ? document.querySelector(dz.dataset.target) : null);
      if (!input) return;
      dz.classList.add('has-input');
      dz.addEventListener('click', (e) => { if (e.target !== input && !input.contains(e.target)) input.click(); });
      ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
      ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
      dz.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) { input.files = e.dataTransfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); } });
      input.addEventListener('change', () => {
        const hint = dz.querySelector('.dz-hint');
        if (hint && input.files.length) hint.textContent = `${input.files.length} فایل انتخاب شد — ${Array.from(input.files).map((f) => f.name).slice(0, 3).join('، ')}`;
      });
    });
  }

  /* ---------- وضعیت در حال ارسال فرم ---------- */
  function initUploadForms() {
    $$('[data-upload-form]').forEach((form) => {
      form.addEventListener('submit', () => {
        const btn = form.querySelector('button[type="submit"]');
        if (!btn || btn.dataset.busy) return;
        btn.dataset.busy = '1';
        btn.dataset.label = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> در حال ارسال…';
        setTimeout(() => { if (btn.dataset.busy) { btn.disabled = false; btn.innerHTML = btn.dataset.label; delete btn.dataset.busy; } }, 20000);
      });
    });
  }

  /* ---------- حباب راهنما روی عناصر ---------- */
  function initPopovers() {
    let box = null;
    const hide = () => { if (box) { box.remove(); box = null; } };
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-popover]');
      hide();
      if (!t) return;
      e.preventDefault();
      box = document.createElement('div');
      box.className = 'popover-box';
      box.textContent = t.dataset.popover;
      document.body.appendChild(box);
      const r = t.getBoundingClientRect();
      box.style.top = `${window.scrollY + r.bottom + 8}px`;
      box.style.left = `${Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - box.offsetWidth - 12)}px`;
    });
    document.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('resize', hide);
  }

  /* ---------- انتخاب گروهی ردیف‌ها ---------- */
  function initBulk() {
    const targets = (master) => {
      const sel = master.dataset.checkAll;
      if (!sel) return [];
      const scope = $(sel);
      if (scope && scope.tagName === 'FORM') return $$('input[type="checkbox"][name]', scope).filter((c) => c !== master && !c.disabled);
      return $$(sel).filter((c) => c !== master && c.type === 'checkbox' && !c.disabled);
    };
    $$('[data-check-all]').forEach((master) => {
      master.addEventListener('change', () => { targets(master).forEach((c) => { c.checked = master.checked; c.dispatchEvent(new Event('change', { bubbles: true })); }); });
    });
    document.addEventListener('change', (e) => {
      const box = e.target.closest('input[type="checkbox"][name]');
      if (!box) return;
      $$('[data-check-all]').forEach((master) => {
        const list = targets(master);
        if (!list.length || list.indexOf(box) === -1) return;
        master.checked = list.every((c) => c.checked);
        master.indeterminate = !master.checked && list.some((c) => c.checked);
        const n = list.filter((c) => c.checked).length;
        const scope = master.dataset.checkAll.startsWith('#') ? $(master.dataset.checkAll) : document;
        $$('[data-bulk-count]', scope || document).forEach((el) => { el.textContent = String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]); });
        $$('[data-bulk-guard]', scope || document).forEach((el) => { el.disabled = n === 0; });
      });
    });
  }

  /* ---------- راه‌اندازی ---------- */
  function boot() {
    initNav(); initSearch(); initCart(); initVariants(); initTabs(); initGallery();
    initCountdowns(); initSliders(); initCharts(); initOtp(); initStories(); initBuilder();
    initEditors(); initToTop(); initDropdowns(); initChoiceCards(); initFilters(); initRating();
    initLiveStats(); initMap(); initRepeaters(); initMediaPicker(); initBulk();
    initMoneyInputs(); initSlugFrom(); initDropzones(); initUploadForms(); initPopovers();
    // انیمیشن ورود با اسکرول
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: .08 });
    $$('[data-reveal]').forEach((el) => { el.style.opacity = '0'; el.style.transform = 'translateY(16px)'; el.style.transition = 'opacity .5s ease, transform .5s ease'; io.observe(el); });
    const style = document.createElement('style');
    style.textContent = '[data-reveal].in{opacity:1 !important;transform:none !important}';
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
