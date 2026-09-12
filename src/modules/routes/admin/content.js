'use strict';
const express = require('express');
const router = express.Router();
const { all, get, insert, update, run, db, jparse, jstringify, setting } = require('../../../db');
const auth = require('../../../core/auth');
const notify = require('../../../core/notify');
const activity = require('../../../core/activity');
const catalog = require('../../../core/catalog');
const media = require('../../../core/media');
const { now, toInt, numberFormat, slugify, paginate, truncate, randomCode } = require('../../../core/utils');
const { formatJalali, toPersianDigits, timeAgo } = require('../../../core/jalali');

/* ================= مقالات ================= */

router.get('/posts', auth.requirePermission('posts.view'), (req, res) => {
  const page = toInt(req.query.page, 1), perPage = 20;
  const where = ['p.deleted_at IS NULL'];
  const values = { l: perPage, o: (page - 1) * perPage };
  if (req.query.status) { where.push('p.status=@st'); values.st = req.query.status; }
  if (req.query.search) { where.push('p.title LIKE @q'); values.q = `%${req.query.search}%`; }
  const W = where.join(' AND ');
  const total = get(`SELECT COUNT(*) AS c FROM posts p WHERE ${W}`, values).c;
  const rows = all(`SELECT p.*, pc.name AS cat_name, u.name AS author_name, s.shop_name AS seller_name
                    FROM posts p LEFT JOIN post_categories pc ON pc.id=p.category_id
                    LEFT JOIN users u ON u.id=p.author_id LEFT JOIN sellers s ON s.id=p.seller_id
                    WHERE ${W} ORDER BY p.id DESC LIMIT @l OFFSET @o`, values);
  res.locals.pageTitle = 'مقالات';
  res.render('admin/posts', { rows, pg: paginate(total, page, perPage), categories: all('SELECT * FROM post_categories ORDER BY sort') });
});

router.get('/posts/create', auth.requirePermission('posts.manage'), (req, res) => {
  res.locals.pageTitle = 'مقاله جدید';
  res.render('admin/post-form', { post: null, categories: all('SELECT * FROM post_categories ORDER BY sort'), tags: all('SELECT * FROM tags ORDER BY name'), products: all(`SELECT id,title,slug FROM products WHERE deleted_at IS NULL AND status='active' ORDER BY id DESC LIMIT 300`), sellers: all(`SELECT id,shop_name FROM sellers WHERE deleted_at IS NULL`) });
});

router.get('/posts/:id/edit', auth.requirePermission('posts.manage'), (req, res) => {
  const post = get('SELECT * FROM posts WHERE id=@id', { id: toInt(req.params.id) });
  if (!post) return res.redirect('/admin/content/posts');
  post.tags = jparse(post.tags, []);
  post.mentioned = all('SELECT product_id FROM post_products WHERE post_id=@id', { id: post.id }).map((r) => r.product_id);
  res.locals.pageTitle = 'ویرایش مقاله';
  res.render('admin/post-form', { post, categories: all('SELECT * FROM post_categories ORDER BY sort'), tags: all('SELECT * FROM tags ORDER BY name'), products: all(`SELECT id,title,slug FROM products WHERE deleted_at IS NULL AND status='active' ORDER BY id DESC LIMIT 300`), sellers: all(`SELECT id,shop_name FROM sellers WHERE deleted_at IS NULL`) });
});

router.post('/posts', auth.requirePermission('posts.manage'), media.upload.single('cover'), (req, res) => {
  const b = req.body;
  const cover = req.file ? media.register(req.file, { userId: req.user.id, folder: '/posts' }).url : (b.cover_url || null);
  const tags = String(b.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  const data = {
    author_type: b.seller_id ? 'seller' : 'admin', author_id: req.user.id, seller_id: toInt(b.seller_id) || null,
    category_id: toInt(b.category_id) || null, title: String(b.title || '').trim(),
    slug: catalog.uniqueSlug('posts', slugify(b.slug || b.title)),
    excerpt: b.excerpt || null, body: b.body || '', cover, video_url: b.video_url || null, audio_url: b.audio_url || null,
    kind: b.kind || 'text', tags: jstringify(tags), status: b.status || 'published',
    seo_title: b.seo_title || null, seo_desc: b.seo_desc || null,
    published_at: b.status === 'published' ? (b.published_at || now()) : null, updated_at: now(),
  };
  let id;
  if (b.id) { id = toInt(b.id); update('posts', id, data); }
  else { id = insert('posts', { ...data, created_at: now(), views: 0 }); }
  run('DELETE FROM post_products WHERE post_id=@id', { id });
  [].concat(b.product_ids || []).map(toInt).filter(Boolean).forEach((pid, i) => insert('post_products', { post_id: id, product_id: pid, sort: i }));
  for (const t of tags) run('INSERT OR IGNORE INTO tags(name,slug) VALUES(@n,@s)', { n: t, s: slugify(t) });
  activity.logReq(req, 'post_create', { subjectType: 'post', subjectId: id, description: data.title });
  auth.flash(req, 'success', 'مقاله ذخیره شد.');
  res.redirect('/admin/content/posts/' + id + '/edit');
});

router.post('/posts/:id/status', auth.requirePermission('posts.manage'), (req, res) => {
  update('posts', toInt(req.params.id), { status: req.body.status, published_at: req.body.status === 'published' ? now() : null });
  if (req.body.status === 'approved' || req.body.status === 'published') {
    const p = get('SELECT seller_id,title FROM posts WHERE id=@id', { id: toInt(req.params.id) });
    if (p?.seller_id) { const s = get('SELECT user_id FROM sellers WHERE id=@id', { id: p.seller_id }); if (s?.user_id) notify.push(s.user_id, notify.T.productApproved(p.title)); }
  }
  res.redirect('back');
});

router.post('/posts/:id/delete', auth.requirePermission('posts.manage'), (req, res) => { catalog.softDelete('posts', toInt(req.params.id)); auth.flash(req, 'success', 'مقاله به سطل زباله رفت.'); res.redirect('/admin/content/posts'); });

/* ---------------- دسته‌بندی مقالات ---------------- */
router.get('/post-categories', auth.requirePermission('posts.manage'), (req, res) => {
  res.locals.pageTitle = 'دسته‌بندی مقالات';
  res.render('admin/post-categories', { rows: all('SELECT * FROM post_categories ORDER BY sort, id') });
});
router.post('/post-categories', auth.requirePermission('posts.manage'), (req, res) => {
  const data = { name: req.body.name, slug: slugify(req.body.slug || req.body.name), sort: toInt(req.body.sort), status: req.body.status || 'active' };
  if (req.body.id) update('post_categories', toInt(req.body.id), data); else insert('post_categories', data);
  res.redirect('/admin/content/post-categories');
});
router.post('/post-categories/:id/delete', auth.requirePermission('posts.manage'), (req, res) => { run('DELETE FROM post_categories WHERE id=@id', { id: toInt(req.params.id) }); res.redirect('/admin/content/post-categories'); });

/* ================= دیدگاه‌ها و پرسش‌ها ================= */

router.get('/reviews', auth.requirePermission('reviews.manage'), (req, res) => {
  res.locals.pageTitle = 'دیدگاه‌ها';
  res.render('admin/reviews', {
    rows: all(`SELECT r.*, p.title, p.slug, u.name AS author, u.phone FROM reviews r JOIN products p ON p.id=r.product_id LEFT JOIN users u ON u.id=r.user_id
               ${req.query.status ? `WHERE r.status='${req.query.status}'` : ''} ORDER BY r.id DESC LIMIT 200`).map((r) => ({ ...r, pros: jparse(r.pros, []), cons: jparse(r.cons, []) })),
  });
});
router.post('/reviews/:id/status', auth.requirePermission('reviews.manage'), (req, res) => {
  const id = toInt(req.params.id);
  const r = get('SELECT * FROM reviews WHERE id=@id', { id });
  if (!r) return res.redirect('back');
  update('reviews', id, { status: req.body.status, admin_reply: req.body.admin_reply ?? r.admin_reply });
  if (req.body.status === 'approved') {
    // بازمحاسبه امتیاز محصول
    const agg = get(`SELECT COUNT(*) AS c, COALESCE(SUM(rating),0) AS s, SUM(recommend) AS rec FROM reviews WHERE product_id=@p AND status='approved'`, { p: r.product_id });
    run('UPDATE products SET rating_count=@c, rating_sum=@s, recommend_count=@r WHERE id=@p', { c: agg.c, s: agg.s, r: agg.rec || 0, p: r.product_id });
    if (r.user_id) {
      const p = get('SELECT title FROM products WHERE id=@id', { id: r.product_id });
      notify.push(r.user_id, notify.T.reviewApproved(p?.title || ''));
      const bonus = toInt(setting('club_review_points', '20'), 0);
      if (bonus > 0) { run('UPDATE users SET points=points+@p WHERE id=@u', { p: bonus, u: r.user_id }); insert('club_activities', { user_id: r.user_id, points: bonus, reason: 'review', reference: String(r.product_id), created_at: now() }); }
    }
  }
  activity.logReq(req, 'review_status', { subjectType: 'review', subjectId: id, description: req.body.status });
  auth.flash(req, 'success', 'وضعیت دیدگاه بروزرسانی شد.');
  res.redirect('back');
});
router.post('/reviews/:id/delete', auth.requirePermission('reviews.manage'), (req, res) => { catalog.softDelete('reviews', toInt(req.params.id)); res.redirect('/admin/content/reviews'); });

router.get('/questions', auth.requirePermission('questions.manage'), (req, res) => {
  res.locals.pageTitle = 'پرسش و پاسخ';
  res.render('admin/questions', {
    rows: all(`SELECT q.*, p.title, p.slug, p.seller_id, u.name AS author FROM questions q JOIN products p ON p.id=q.product_id LEFT JOIN users u ON u.id=q.user_id ORDER BY q.id DESC LIMIT 200`)
      .map((q) => ({ ...q, answers: all('SELECT a.*, u.name, u.role FROM answers a LEFT JOIN users u ON u.id=a.user_id WHERE a.question_id=@q ORDER BY a.id', { q: q.id }) })),
  });
});
router.post('/questions/:id', auth.requirePermission('questions.manage'), (req, res) => {
  const id = toInt(req.params.id);
  const q = get('SELECT * FROM questions WHERE id=@id', { id });
  if (!q) return res.redirect('back');
  if (req.body.action === 'delete') { catalog.softDelete('questions', id); return res.redirect('/admin/content/questions'); }
  if (req.body.body) {
    insert('answers', { question_id: id, user_id: req.user.id, role_label: 'admin', body: req.body.body, created_at: now() });
    if (q.user_id) { const p = get('SELECT title FROM products WHERE id=@id', { id: q.product_id }); notify.push(q.user_id, notify.T.questionAnswered(p?.title || '')); }
  }
  update('questions', id, { status: req.body.status || 'approved' });
  auth.flash(req, 'success', 'ذخیره شد.');
  res.redirect('/admin/content/questions');
});

router.get('/comments', auth.requirePermission('posts.manage'), (req, res) => {
  res.locals.pageTitle = 'دیدگاه‌های مجله';
  res.render('admin/comments', { rows: all('SELECT c.*, p.title, p.slug, u.name AS author FROM comments c JOIN posts p ON p.id=c.post_id LEFT JOIN users u ON u.id=c.user_id ORDER BY c.id DESC LIMIT 200') });
});
router.post('/comments/:id/status', auth.requirePermission('posts.manage'), (req, res) => { update('comments', toInt(req.params.id), { status: req.body.status }); res.redirect('back'); });

/* ================= صفحات ================= */

router.get('/pages', auth.requirePermission('pages.manage'), (req, res) => {
  res.locals.pageTitle = 'صفحات';
  res.render('admin/pages', { rows: all('SELECT * FROM pages WHERE deleted_at IS NULL ORDER BY id DESC') });
});
router.get('/pages/create', auth.requirePermission('pages.manage'), (req, res) => { res.locals.pageTitle = 'صفحه جدید'; res.render('admin/page-form', { page: null }); });
router.get('/pages/:id/edit', auth.requirePermission('pages.manage'), (req, res) => {
  const page = get('SELECT * FROM pages WHERE id=@id', { id: toInt(req.params.id) });
  if (!page) return res.redirect('/admin/content/pages');
  res.locals.pageTitle = 'ویرایش صفحه';
  res.render('admin/page-form', { page });
});
router.post('/pages', auth.requirePermission('pages.manage'), (req, res) => {
  const b = req.body;
  const data = { title: b.title, slug: catalog.uniqueSlug('pages', slugify(b.slug || b.title)), body: b.body || '', seo_title: b.seo_title || null, seo_desc: b.seo_desc || null, status: b.status || 'published', updated_at: now() };
  if (b.id) update('pages', toInt(b.id), data); else insert('pages', { ...data, created_at: now(), views: 0 });
  activity.logReq(req, 'page_save', { subjectType: 'page', description: b.title });
  auth.flash(req, 'success', 'صفحه ذخیره شد.');
  res.redirect('/admin/content/pages');
});
router.post('/pages/:id/delete', auth.requirePermission('pages.manage'), (req, res) => { catalog.softDelete('pages', toInt(req.params.id)); res.redirect('/admin/content/pages'); });

/* ================= FAQ ================= */

router.get('/faqs', auth.requirePermission('faqs.manage'), (req, res) => {
  res.locals.pageTitle = 'پرسش‌های متداول';
  res.render('admin/faqs', { rows: all('SELECT * FROM faqs ORDER BY sort, id'), categories: all('SELECT DISTINCT category FROM faqs WHERE category IS NOT NULL') });
});
router.post('/faqs', auth.requirePermission('faqs.manage'), (req, res) => {
  const data = { question: req.body.question, answer: req.body.answer, category: req.body.category || 'عمومی', sort: toInt(req.body.sort), status: req.body.status || 'active' };
  if (req.body.id) update('faqs', toInt(req.body.id), data); else insert('faqs', { ...data, created_at: now() });
  auth.flash(req, 'success', 'ذخیره شد.');
  res.redirect('/admin/content/faqs');
});
router.post('/faqs/:id/delete', auth.requirePermission('faqs.manage'), (req, res) => { run('DELETE FROM faqs WHERE id=@id', { id: toInt(req.params.id) }); res.redirect('/admin/content/faqs'); });

/* ================= منوساز ================= */

router.get('/menus', auth.requirePermission('menus.manage'), (req, res) => {
  const menus = all('SELECT * FROM menus ORDER BY id');
  const current = get('SELECT * FROM menus WHERE id=@id', { id: toInt(req.query.id) }) || menus[0];
  res.locals.pageTitle = 'منوساز';
  res.render('admin/menus', {
    menus, current,
    items: current ? all('SELECT * FROM menu_items WHERE menu_id=@m ORDER BY sort, id', { m: current.id }) : [],
    categories: all(`SELECT id,name,slug FROM categories WHERE deleted_at IS NULL AND status='active' ORDER BY name LIMIT 100`),
    pages: all(`SELECT id,title,slug FROM pages WHERE deleted_at IS NULL`),
  });
});
router.post('/menus', auth.requirePermission('menus.manage'), (req, res) => {
  const b = req.body;
  if (b.action === 'create-menu') { insert('menus', { title: b.title, location: slugify(b.location), created_at: now() }); }
  else if (b.action === 'add-item') {
    insert('menu_items', { menu_id: toInt(b.menu_id), parent_id: toInt(b.parent_id) || null, title: b.title, url: b.url, icon: b.icon || null, target: b.target || '_self', sort: toInt(b.sort), status: 'active' });
  } else if (b.action === 'update-order') {
    for (const [id, sort] of Object.entries(jparse(b.order, {}))) run('UPDATE menu_items SET sort=@s, parent_id=@p WHERE id=@id', { s: toInt(sort), p: toInt(b.parents?.[id]) || null, id: toInt(id) });
  }
  auth.flash(req, 'success', 'منو ذخیره شد.');
  res.redirect('/admin/content/menus?id=' + (b.menu_id || ''));
});
router.post('/menus/items/:id/delete', auth.requirePermission('menus.manage'), (req, res) => { run('DELETE FROM menu_items WHERE id=@id', { id: toInt(req.params.id) }); run('UPDATE menu_items SET parent_id=NULL WHERE parent_id=@id', { id: toInt(req.params.id) }); res.redirect('back'); });

/* ================= فرم‌ساز ================= */

router.get('/forms', auth.requirePermission('forms.manage'), (req, res) => {
  res.locals.pageTitle = 'فرم‌ساز';
  res.render('admin/forms', { rows: all('SELECT * FROM forms ORDER BY id DESC').map((f) => ({ ...f, fields: jparse(f.fields, []), submissions: get('SELECT COUNT(*) AS c FROM form_submissions WHERE form_id=@id', { id: f.id }).c })) });
});
router.get('/forms/create', auth.requirePermission('forms.manage'), (req, res) => {
  res.locals.pageTitle = 'فرم جدید';
  res.render('admin/form-edit', { form: null, fields: [], submissions: [] });
});
router.get('/forms/:id/edit', auth.requirePermission('forms.manage'), (req, res) => {
  const form = get('SELECT * FROM forms WHERE id=@id', { id: toInt(req.params.id) });
  if (!form) return res.redirect('/admin/content/forms');
  res.locals.pageTitle = 'ویرایش فرم';
  res.render('admin/form-edit', { form, fields: jparse(form.fields, []), submissions: all('SELECT fs.*, u.name, u.phone FROM form_submissions fs LEFT JOIN users u ON u.id=fs.user_id WHERE fs.form_id=@id ORDER BY fs.id DESC LIMIT 100', { id: form.id }).map((s) => ({ ...s, data: jparse(s.data, {}) })) });
});
router.post('/forms', auth.requirePermission('forms.manage'), (req, res) => {
  const b = req.body;
  const fields = [].concat(b.field_labels || []).map((label, i) => ({
    name: slugify([].concat(b.field_names || [])[i] || label, 'f' + i), label,
    type: [].concat(b.field_types || [])[i] || 'text',
    required: !![].concat(b.field_required || []).includes(String(i)) || [].concat(b.field_required || [])[i] === 'on',
    options: String([].concat(b.field_options || [])[i] || '').split('\n').map((x) => x.trim()).filter(Boolean),
    placeholder: [].concat(b.field_placeholders || [])[i] || '',
  })).filter((f) => f.label);
  const data = { title: b.title, slug: catalog.uniqueSlug('forms', slugify(b.slug || b.title)), description: b.description || null, fields: jstringify(fields), success_msg: b.success_msg || null, notify_email: b.notify_email || null, status: b.status || 'active' };
  if (b.id) update('forms', toInt(b.id), data); else insert('forms', { ...data, created_at: now() });
  auth.flash(req, 'success', 'فرم ذخیره شد.');
  res.redirect('/admin/content/forms');
});
router.post('/forms/:id/delete', auth.requirePermission('forms.manage'), (req, res) => { run('DELETE FROM form_submissions WHERE form_id=@id', { id: toInt(req.params.id) }); run('DELETE FROM forms WHERE id=@id', { id: toInt(req.params.id) }); res.redirect('/admin/content/forms'); });
router.post('/forms/submissions/:id/delete', auth.requirePermission('forms.manage'), (req, res) => { run('DELETE FROM form_submissions WHERE id=@id', { id: toInt(req.params.id) }); res.redirect('back'); });

/* ================= بنرها ================= */

router.get('/banners', auth.requirePermission('banners.manage'), (req, res) => {
  res.locals.pageTitle = 'بنرها';
  res.render('admin/banners', { rows: all('SELECT * FROM banners ORDER BY position, sort, id DESC') });
});
router.post('/banners', auth.requirePermission('banners.manage'), media.upload.fields([{ name: 'image', maxCount: 1 }, { name: 'image_dark', maxCount: 1 }]), (req, res) => {
  const b = req.body;
  const data = { title: b.title || null, link: b.link || null, position: b.position || 'home', sort: toInt(b.sort), starts_at: b.starts_at || null, ends_at: b.ends_at || null, status: b.status || 'active' };
  if (req.files?.image?.[0]) data.image = media.register(req.files.image[0], { userId: req.user.id, folder: '/banners' }).url;
  else if (b.image_url) data.image = b.image_url;
  if (req.files?.image_dark?.[0]) data.image_dark = media.register(req.files.image_dark[0], { userId: req.user.id, folder: '/banners' }).url;
  else if (b.image_dark_url) data.image_dark = b.image_dark_url;
  if (b.id) update('banners', toInt(b.id), data); else insert('banners', { ...data, created_at: now() });
  auth.flash(req, 'success', 'بنر ذخیره شد.');
  res.redirect('/admin/content/banners');
});
router.post('/banners/:id/delete', auth.requirePermission('banners.manage'), (req, res) => { run('DELETE FROM banners WHERE id=@id', { id: toInt(req.params.id) }); res.redirect('/admin/content/banners'); });

/* ================= استوری‌ها ================= */

router.get('/stories', auth.requirePermission('stories.manage'), (req, res) => {
  res.locals.pageTitle = 'استوری‌ها';
  res.render('admin/stories', {
    rows: all(`SELECT st.*, s.shop_name FROM stories st LEFT JOIN sellers s ON s.id=st.owner_id ORDER BY st.id DESC LIMIT 100`),
    sellers: all(`SELECT id,shop_name FROM sellers WHERE deleted_at IS NULL`),
    products: all(`SELECT id,title FROM products WHERE deleted_at IS NULL AND status='active' ORDER BY id DESC LIMIT 200`),
  });
});
router.post('/stories', auth.requirePermission('stories.manage'), media.upload.single('media'), (req, res) => {
  const b = req.body;
  const path = req.file ? media.register(req.file, { userId: req.user.id, folder: '/stories' }).url : b.media_url;
  if (!path) { auth.flash(req, 'danger', 'فایل استوری الزامی است.'); return res.redirect('/admin/content/stories'); }
  const days = toInt(b.duration_days, 1);
  insert('stories', {
    owner_type: b.seller_id ? 'seller' : 'admin', owner_id: toInt(b.seller_id) || null, media_path: path,
    media_type: (req.file?.mimetype || '').startsWith('video') ? 'video' : 'image',
    link: b.link || null, product_ids: jstringify([].concat(b.product_ids || []).map(toInt).filter(Boolean)),
    duration: toInt(b.duration, 5), sort: toInt(b.sort), starts_at: b.starts_at || now(),
    expires_at: new Date(Date.now() + days * 86400000).toISOString().replace('T', ' ').slice(0, 19),
    status: 'active', created_at: now(),
  });
  activity.logReq(req, 'story_create', { description: 'استوری جدید' });
  auth.flash(req, 'success', 'استوری منتشر شد.');
  res.redirect('/admin/content/stories');
});
router.post('/stories/:id/delete', auth.requirePermission('stories.manage'), (req, res) => { run('DELETE FROM stories WHERE id=@id', { id: toInt(req.params.id) }); res.redirect('/admin/content/stories'); });

/* ================= صفحه‌ساز / قالب‌ها ================= */

const SECTION_TYPES = [
  { type: 'slider', title: 'اسلایدر / بنر اصلی', fields: [] },
  { type: 'services', title: 'ویجت خدمات', fields: [['limit', 'تعداد']] },
  { type: 'categories', title: 'دسته‌بندی‌ها', fields: [['limit', 'تعداد']] },
  { type: 'product_list', title: 'لیست محصولات', fields: [['source', 'منبع: special|bestseller|newest|popular|discounted|manual'], ['limit', 'تعداد'], ['categoryId', 'دسته'], ['title', 'عنوان']] },
  { type: 'brands', title: 'برندها', fields: [['limit', 'تعداد']] },
  { type: 'blog', title: 'آخرین مقالات', fields: [['limit', 'تعداد']] },
  { type: 'banner', title: 'بنر', fields: [['position', 'جایگاه']] },
  { type: 'stores', title: 'فروشگاه‌های برتر', fields: [['limit', 'تعداد']] },
  { type: 'stories', title: 'استوری‌ها', fields: [] },
  { type: 'html', title: 'بلوک HTML دلخواه', fields: [['content', 'کد HTML']] },
  { type: 'text', title: 'متن ساده (کارت)', fields: [['body', 'متن']] },
];

router.get('/templates', auth.requirePermission('templates.manage'), (req, res) => {
  res.locals.pageTitle = 'قالب و صفحه‌ساز';
  res.render('admin/templates', { rows: all('SELECT * FROM templates ORDER BY is_active DESC, id DESC').map((t) => ({ ...t, sections: jparse(t.sections, []) })) });
});

router.get('/templates/:id/edit', auth.requirePermission('templates.manage'), (req, res) => {
  const t = get('SELECT * FROM templates WHERE id=@id', { id: toInt(req.params.id) });
  if (!t) return res.redirect('/admin/content/templates');
  res.locals.pageTitle = 'ویرایش قالب';
  res.render('admin/template-edit', { t, sections: jparse(t.sections, []), types: SECTION_TYPES, categories: all('SELECT id,name FROM categories WHERE deleted_at IS NULL'), products: all('SELECT id,title FROM products WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 200') });
});

router.post('/templates', auth.requirePermission('templates.manage'), (req, res) => {
  const b = req.body;
  const data = { name: b.name, route: b.route || 'home', theme: b.theme || 'classic', status: b.status || 'draft' };
  let id;
  if (b.id) { id = toInt(b.id); update('templates', id, { ...data, updated_at: now() }); }
  else { id = insert('templates', { ...data, sections: '[]', created_by: req.user.id, created_at: now(), updated_at: now() }); }
  if (b.activate === '1') { run('UPDATE templates SET is_active=0 WHERE route=@r', { r: data.route }); run('UPDATE templates SET is_active=1, status=\'published\' WHERE id=@id', { id }); }
  cacheFlush();
  auth.flash(req, 'success', 'قالب ذخیره شد.');
  res.redirect('/admin/content/templates/' + id + '/edit');
});

router.post('/templates/:id/sections', auth.requirePermission('templates.manage'), (req, res) => {
  const id = toInt(req.params.id);
  const t = get('SELECT * FROM templates WHERE id=@id', { id });
  if (!t) return res.redirect('/admin/content/templates');
  let sections = jparse(t.sections, []);
  const action = req.body.action;
  if (action === 'add') {
    sections.push({
      id: 'sec_' + randomCode('', 5).toLowerCase(), type: req.body.type, title: req.body.title || '',
      source: req.body.source || null, limit: toInt(req.body.limit, 8), position: req.body.position || null,
      categoryId: req.body.categoryId || null, interval: toInt(req.body.interval, 0) || undefined,
      content: req.body.content || req.body.html || null, body: req.body.body || null,
      productIds: [].concat(req.body['productIds[]'] || req.body.productIds || []).map(toInt).filter(Boolean),
    });
    if (!sections[sections.length - 1].productIds.length) delete sections[sections.length - 1].productIds;
  } else if (action === 'update') {
    const idx = sections.findIndex((s) => s.id === req.body.section_id);
    if (idx >= 0) sections[idx] = { ...sections[idx], ...jparse(req.body.data, {}) };
  } else if (action === 'remove') {
    sections = sections.filter((s) => s.id !== req.body.section_id);
  } else if (action === 'reorder') {
    const order = jparse(req.body.order, []);
    sections.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  } else if (action === 'move') {
    const idx = sections.findIndex((s) => s.id === req.body.section_id);
    if (idx >= 0) {
      const [item] = sections.splice(idx, 1);
      const to = req.body.direction === 'up' ? Math.max(0, idx - 1) : Math.min(sections.length, idx + 1);
      sections.splice(to, 0, item);
    }
  }
  update('templates', id, { sections: jstringify(sections), updated_at: now() });
  cacheFlush();
  if (req.xhr) return res.json({ ok: true, sections });
  res.redirect('/admin/content/templates/' + id + '/edit');
});

router.post('/templates/:id/delete', auth.requirePermission('templates.manage'), (req, res) => { run('DELETE FROM templates WHERE id=@id', { id: toInt(req.params.id) }); cacheFlush(); res.redirect('/admin/content/templates'); });

function cacheFlush() { try { require('../../../core/cache').flush(); } catch { /* ignore */ } }

module.exports = router;
module.exports.SECTION_TYPES = SECTION_TYPES;
