'use strict';
const { all, get, insert, update, remove, jparse } = require('../db');

/**
 * سیستم ACL — مقام‌ها و دسترسی‌ها
 * هر دسترسی به شکل «ماژول.عمل» است؛ `*` یعنی همه.
 */

const PERMISSION_GROUPS = [
  {
    key: 'dashboard', title: 'داشبورد', icon: 'grid',
    items: [['dashboard.view', 'مشاهده داشبورد'], ['dashboard.charts', 'مشاهده نمودارها']],
  },
  {
    key: 'catalog', title: 'کاتالوگ', icon: 'box',
    items: [
      ['products.view', 'مشاهده محصولات'], ['products.create', 'ایجاد محصول'], ['products.edit', 'ویرایش محصول'],
      ['products.delete', 'حذف محصول'], ['products.approve', 'تایید محصولات فروشندگان'], ['products.price', 'تغییر قیمت و تخفیف'],
      ['categories.view', 'مشاهده دسته‌بندی‌ها'], ['categories.manage', 'مدیریت دسته‌بندی‌ها'],
      ['brands.view', 'مشاهده برندها'], ['brands.manage', 'مدیریت برندها'],
      ['attributes.manage', 'مدیریت فیلترها و ویژگی‌ها'],
      ['warehouses.manage', 'مدیریت انبارها و موجودی'],
      ['trash.manage', 'سطل زباله و بازیابی'],
    ],
  },
  {
    key: 'sales', title: 'فروش و سفارشات', icon: 'cart',
    items: [
      ['orders.view', 'مشاهده سفارشات'], ['orders.manage', 'تغییر وضعیت سفارشات'], ['orders.refund', 'بازگشت وجه'],
      ['orders.invoice', 'صدور فاکتور'], ['preinvoices.manage', 'پیش‌فاکتورها'],
      ['coupons.manage', 'کدهای تخفیف'], ['shipping.manage', 'روش‌های ارسال'], ['pickups.manage', 'مراکز دریافت حضوری'],
      ['settlements.manage', 'تسویه فروشندگان'],
    ],
  },
  {
    key: 'people', title: 'کاربران و فروشندگان', icon: 'users',
    items: [
      ['users.view', 'مشاهده کاربران'], ['users.manage', 'ویرایش/مسدودسازی کاربران'], ['users.wallet', 'شارژ و کسر کیف پول'],
      ['users.points', 'مدیریت امتیاز باشگاه مشتریان'],
      ['sellers.view', 'مشاهده فروشندگان'], ['sellers.approve', 'تایید/رد فروشنده'], ['sellers.manage', 'ویرایش و مسدودسازی فروشنده'],
      ['sellers.commission', 'تنظیم کمیسیون فروشندگان'],
    ],
  },
  {
    key: 'content', title: 'محتوا', icon: 'edit',
    items: [
      ['posts.view', 'مشاهده مقالات'], ['posts.manage', 'مدیریت مقالات'],
      ['pages.manage', 'مدیریت صفحات'], ['menus.manage', 'منوساز'], ['forms.manage', 'فرم‌ساز'],
      ['faqs.manage', 'پرسش‌های متداول'], ['stories.manage', 'استوری‌ها'], ['banners.manage', 'بنرها'],
      ['templates.manage', 'قالب و صفحه‌ساز'],
      ['reviews.manage', 'مدیریت دیدگاه‌ها'], ['questions.manage', 'مدیریت پرسش‌ها'],
    ],
  },
  {
    key: 'marketing', title: 'بازاریابی', icon: 'megaphone',
    items: [
      ['affiliates.manage', 'همکاری در فروش'], ['club.manage', 'باشگاه مشتریان'],
      ['newsletter.manage', 'خبرنامه و پیامک انبوه'], ['currency.manage', 'نرخ ارز و بروزرسانی قیمت‌ها'],
    ],
  },
  {
    key: 'support', title: 'پشتیبانی', icon: 'life-buoy',
    items: [['tickets.view', 'مشاهده تیکت‌ها'], ['tickets.manage', 'پاسخ و مدیریت تیکت‌ها'], ['notifications.send', 'ارسال اعلان']],
  },
  {
    key: 'media', title: 'مدیا', icon: 'image',
    items: [['media.view', 'مشاهده کتابخانه'], ['media.upload', 'بارگذاری فایل'], ['media.delete', 'حذف فایل']],
  },
  {
    key: 'system', title: 'سیستم', icon: 'settings',
    items: [
      ['settings.view', 'مشاهده تنظیمات'], ['settings.manage', 'تغییر تنظیمات'],
      ['gateways.manage', 'درگاه‌های پرداخت و پیامکی'],
      ['roles.manage', 'نقش‌ها و دسترسی‌ها (ACL)'], ['admins.manage', 'مدیران'],
      ['logs.view', 'گزارش فعالیت‌ها'], ['sessions.manage', 'نشست‌های فعال'],
      ['reports.view', 'آمار و گزارش‌ها'], ['seo.manage', 'تنظیمات سئو'],
      ['backup.manage', 'پشتیبان‌گیری و بروزرسانی'],
    ],
  },
];

const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i[0]));

function listPermissions() { return PERMISSION_GROUPS; }
function permissionTitle(key) {
  for (const g of PERMISSION_GROUPS) for (const [k, t] of g.items) if (k === key) return t;
  return key;
}

/* ---------------- نقش‌ها ---------------- */

function allRoles() { return all('SELECT * FROM roles ORDER BY is_system DESC, id ASC'); }
function findRole(id) { return get('SELECT * FROM roles WHERE id=@id', { id }); }
function roleBySlug(slug) { return get('SELECT * FROM roles WHERE slug=@s', { s: slug }); }

function permissionsOf(role) {
  if (!role) return [];
  return jparse(role.permissions, []);
}

function can(user, permission) {
  if (!user) return false;
  if (user.role === 'staff' || user.role === 'admin') {
    // ادمین کل همیشه دسترسی کامل دارد
    if (user.is_super || (user.role === 'admin')) return true;
    const role = user.role_id ? findRole(user.role_id) : null;
    const perms = permissionsOf(role);
    if (perms.includes('*')) return true;
    if (perms.includes(permission)) return true;
    const mod = permission.split('.')[0];
    return perms.includes(mod + '.*');
  }
  return false;
}

function createRole({ name, slug, permissions = [], is_system = 0 }) {
  return insert('roles', { name, slug, permissions: JSON.stringify(permissions), is_system, created_at: new Date().toISOString() });
}

function updateRole(id, data) {
  if (data.permissions && !Array.isArray(data.permissions)) data.permissions = JSON.parse(data.permissions);
  if (data.permissions) data.permissions = JSON.stringify(data.permissions);
  return update('roles', id, data);
}

/** نقش‌های پیش‌فرض سیستم */
function ensureSystemRoles() {
  const defaults = [
    { name: 'مدیر کل', slug: 'super-admin', permissions: ['*'], is_system: 1 },
    { name: 'مدیر فروشگاه', slug: 'shop-manager', permissions: ['dashboard.*', 'catalog.*', 'sales.*', 'people.view', 'content.*', 'marketing.*', 'support.*', 'media.*', 'reports.view'], is_system: 1 },
    { name: 'کارشناس پشتیبانی', slug: 'support', permissions: ['dashboard.view', 'tickets.*', 'orders.view', 'users.view', 'notifications.send'], is_system: 1 },
    { name: 'کارشناس محتوا', slug: 'content', permissions: ['dashboard.view', 'content.*', 'media.*', 'products.view', 'products.edit', 'categories.view', 'brands.view'], is_system: 1 },
    { name: 'انباردار', slug: 'warehouse', permissions: ['dashboard.view', 'products.view', 'warehouses.manage', 'orders.view', 'stock.view'], is_system: 1 },
    { name: 'حسابدار', slug: 'accountant', permissions: ['dashboard.view', 'dashboard.charts', 'sales.*', 'people.view', 'users.wallet', 'reports.view', 'settlements.manage'], is_system: 1 },
  ];
  for (const d of defaults) {
    const existing = roleBySlug(d.slug);
    if (!existing) createRole(d);
  }
}

module.exports = { PERMISSION_GROUPS, ALL_PERMISSIONS, listPermissions, permissionTitle, allRoles, findRole, roleBySlug, permissionsOf, can, createRole, updateRole, ensureSystemRoles };
