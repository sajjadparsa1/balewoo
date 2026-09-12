-- ============================================================
--  Balewoo Shop — schema (SQLite)
--  اسکریپت فروشگاهی چندفروشندگی با پنل مدیر / فروشنده / کاربر
-- ============================================================

-- ---------- تنظیمات ----------
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  group_name  TEXT DEFAULT 'general',
  type        TEXT DEFAULT 'text',
  label       TEXT,
  updated_at  TEXT
);

-- ---------- نقش‌ها (ACL) ----------
CREATE TABLE IF NOT EXISTS roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  permissions TEXT DEFAULT '[]',
  is_system   INTEGER DEFAULT 0,
  created_at  TEXT
);

-- ---------- کاربران ----------
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  phone          TEXT UNIQUE,
  email          TEXT,
  password_hash  TEXT,
  name           TEXT,
  national_id    TEXT,
  avatar         TEXT,
  role           TEXT DEFAULT 'customer',   -- customer | staff | seller
  role_id        INTEGER,                   -- نقش ACL برای staff
  seller_id      INTEGER,
  status         TEXT DEFAULT 'active',     -- active | blocked | pending
  wallet         INTEGER DEFAULT 0,
  points         INTEGER DEFAULT 0,
  club_level     TEXT DEFAULT 'bronze',     -- bronze | silver | gold
  referrer_id    INTEGER,
  affiliate_code TEXT UNIQUE,
  is_affiliate   INTEGER DEFAULT 0,
  gender         TEXT,
  birth_date     TEXT,
  login_count    INTEGER DEFAULT 0,
  last_login_at  TEXT,
  last_seen_at   TEXT,
  created_at     TEXT,
  updated_at     TEXT,
  deleted_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- ---------- فروشندگان ----------
CREATE TABLE IF NOT EXISTS sellers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER,
  shop_name         TEXT NOT NULL,
  shop_slug         TEXT UNIQUE NOT NULL,
  shop_en           TEXT,
  logo              TEXT,
  banner            TEXT,
  type              TEXT DEFAULT 'real',     -- real | legal
  national_id       TEXT,
  reg_no            TEXT,
  phone             TEXT,
  email             TEXT,
  province          TEXT,
  city              TEXT,
  address           TEXT,
  lat               REAL, lng REAL,
  documents         TEXT DEFAULT '[]',       -- مدارک بارگذاری شده
  description       TEXT,
  commission        REAL DEFAULT 0,          -- درصد کمیسیون
  settlement_days   INTEGER DEFAULT 7,       -- روزشمار واریز
  direct_shipping   INTEGER DEFAULT 0,
  status            TEXT DEFAULT 'pending',  -- pending | active | blocked
  is_main           INTEGER DEFAULT 0,       -- فروشگاه اصلی
  score             REAL DEFAULT 5,
  success_rate      REAL DEFAULT 100,
  cancel_rate       REAL DEFAULT 0,
  return_rate       REAL DEFAULT 0,
  views             INTEGER DEFAULT 0,
  products_count    INTEGER DEFAULT 0,
  wallet            INTEGER DEFAULT 0,       -- درآمد قابل برداشت
  blocked_until     TEXT,
  created_at        TEXT, updated_at TEXT, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sellers_status ON sellers(status);

-- ---------- حساب‌های بانکی ----------
CREATE TABLE IF NOT EXISTS bank_accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type  TEXT DEFAULT 'user',   -- user | seller
  owner_id    INTEGER,
  owner_name  TEXT,
  bank_name   TEXT,
  card_number TEXT,
  iban        TEXT,
  account_no  TEXT,
  is_default  INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'pending', -- pending | approved | rejected
  created_at  TEXT
);

-- ---------- درخواست برداشت ----------
CREATE TABLE IF NOT EXISTS withdrawals (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type     TEXT DEFAULT 'user',
  owner_id       INTEGER,
  bank_account_id INTEGER,
  amount         INTEGER NOT NULL,
  status         TEXT DEFAULT 'pending', -- pending | paid | rejected
  admin_note     TEXT,
  reference      TEXT,
  created_at     TEXT, updated_at TEXT
);

-- ---------- دسته‌بندی‌ها ----------
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id   INTEGER,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  image       TEXT,
  icon        TEXT,
  description TEXT,
  seo_title   TEXT, seo_desc TEXT, seo_keywords TEXT,
  sort        INTEGER DEFAULT 0,
  in_menu     INTEGER DEFAULT 1,
  status      TEXT DEFAULT 'active',
  products_count INTEGER DEFAULT 0,
  created_at  TEXT, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cat_parent ON categories(parent_id);

-- ---------- برندها ----------
CREATE TABLE IF NOT EXISTS brands (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  name_en     TEXT,
  slug        TEXT UNIQUE NOT NULL,
  logo        TEXT,
  banner      TEXT,
  description TEXT,
  seo_title   TEXT, seo_desc TEXT,
  sort        INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'active',
  products_count INTEGER DEFAULT 0,
  created_at  TEXT, deleted_at TEXT
);

-- ---------- گروه فیلتر / ویژگی ----------
CREATE TABLE IF NOT EXISTS attribute_groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  category_id INTEGER,             -- null = عمومی
  type        TEXT DEFAULT 'select', -- select | multi | color | bool | number | range
  options     TEXT DEFAULT '[]',   -- [{id,title,color}]
  unit        TEXT,
  is_filter   INTEGER DEFAULT 1,   -- در آرشیو نمایش داده شود
  is_variant  INTEGER DEFAULT 0,   -- به‌عنوان متغیر محصول
  is_spec     INTEGER DEFAULT 0,   -- در جدول مشخصات
  sort        INTEGER DEFAULT 0,
  created_at  TEXT
);

-- ---------- محصولات ----------
CREATE TABLE IF NOT EXISTS products (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id      INTEGER,                 -- null = فروشگاه اصلی
  created_by     INTEGER,                 -- کاربر سازنده
  category_id    INTEGER,
  brand_id       INTEGER,
  title          TEXT NOT NULL,
  title_en       TEXT,
  slug           TEXT UNIQUE NOT NULL,
  sku            TEXT,
  product_code   TEXT,                    -- شناسه محصول p-xxxx
  type           TEXT DEFAULT 'normal',   -- normal | inquiry | digital
  condition_txt  TEXT DEFAULT 'new',      -- new | open | used
  warranty       TEXT,
  short_desc     TEXT,
  description    TEXT,
  specs          TEXT DEFAULT '[]',       -- [{title,value}]
  highlights     TEXT DEFAULT '[]',       -- خصوصیات برجسته
  attributes     TEXT DEFAULT '{}',       -- {group_id: [option ids]}
  keywords       TEXT,
  price          INTEGER DEFAULT 0,       -- کمترین قیمت متغیرها
  old_price      INTEGER DEFAULT 0,
  discount_start TEXT, discount_end TEXT,
  base_currency_rate REAL DEFAULT 1,      -- برای بروزرسانی نرخ ارز
  stock          INTEGER DEFAULT 0,
  weight         REAL DEFAULT 0,          -- گرم
  is_special     INTEGER DEFAULT 0,
  is_featured    INTEGER DEFAULT 0,
  is_best_seller INTEGER DEFAULT 0,
  is_inquiry     INTEGER DEFAULT 0,
  affiliate      INTEGER DEFAULT 0,
  aff_gold       REAL DEFAULT 5,
  aff_silver     REAL DEFAULT 3,
  aff_bronze     REAL DEFAULT 1,
  points_reward  INTEGER DEFAULT 0,       -- امتیاز باشگاه مشتریان
  min_order      INTEGER DEFAULT 1,
  max_order      INTEGER DEFAULT 0,
  status         TEXT DEFAULT 'active',   -- draft | pending | active | inactive | rejected
  reject_reason  TEXT,
  views          INTEGER DEFAULT 0,
  likes          INTEGER DEFAULT 0,
  sold           INTEGER DEFAULT 0,
  rating_sum     INTEGER DEFAULT 0,
  rating_count   INTEGER DEFAULT 0,
  recommend_count INTEGER DEFAULT 0,
  seo_title      TEXT, seo_desc TEXT,
  source         TEXT DEFAULT 'manual',   -- manual | digikala | torob
  source_url     TEXT,
  published_at   TEXT,
  created_at     TEXT, updated_at TEXT, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);

-- ---------- متغیرها ----------
CREATE TABLE IF NOT EXISTS product_variants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL,
  seller_id   INTEGER,
  title       TEXT,                        -- «فیروزه‌ای / ۱۲۸ گیگ»
  options     TEXT DEFAULT '{}',           -- {رنگ:'فیروزه‌ای', گارانتی:'۱۸ ماه'}
  price       INTEGER DEFAULT 0,
  old_price   INTEGER DEFAULT 0,
  stock       INTEGER DEFAULT 0,
  sku         TEXT,
  image       TEXT,
  weight      REAL DEFAULT 0,
  is_default  INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'active',
  created_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

-- ---------- ویژگی‌های اضافی اختیاری ----------
CREATE TABLE IF NOT EXISTS product_options (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL,
  title       TEXT NOT NULL,
  price       INTEGER DEFAULT 0,
  is_required INTEGER DEFAULT 0,
  max_count   INTEGER DEFAULT 1,
  sort        INTEGER DEFAULT 0
);

-- ---------- تصاویر ----------
CREATE TABLE IF NOT EXISTS product_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL,
  media_path  TEXT,
  alt         TEXT,
  kind        TEXT DEFAULT 'gallery',   -- gallery | cover | buyer
  user_id     INTEGER,                  -- برای تصاویر خریداران
  sort        INTEGER DEFAULT 0,
  created_at  TEXT
);

-- ---------- تاریخچه قیمت ----------
CREATE TABLE IF NOT EXISTS price_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL,
  variant_id  INTEGER,
  price       INTEGER,
  old_price   INTEGER,
  created_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_ph_product ON price_history(product_id);

-- ---------- انبارها ----------
CREATE TABLE IF NOT EXISTS warehouses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type  TEXT DEFAULT 'main',   -- main | seller
  owner_id    INTEGER DEFAULT 0,
  name        TEXT NOT NULL,
  address     TEXT,
  phone       TEXT,
  is_default  INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'active',
  created_at  TEXT
);
CREATE TABLE IF NOT EXISTS warehouse_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_id  INTEGER NOT NULL,
  product_id    INTEGER,
  variant_id    INTEGER,
  qty           INTEGER DEFAULT 0,
  price         INTEGER DEFAULT 0,
  updated_at    TEXT,
  UNIQUE(warehouse_id, variant_id, product_id)
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_id  INTEGER,
  product_id    INTEGER, variant_id INTEGER,
  change        INTEGER NOT NULL,
  reason        TEXT,                -- purchase | sale | return | adjust | order | cancel
  reference     TEXT,
  user_id       INTEGER,
  created_at    TEXT
);

-- ---------- تخفیف پلکانی ----------
CREATE TABLE IF NOT EXISTS tier_discounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL,
  variant_id  INTEGER,
  min_qty     INTEGER NOT NULL,
  price       INTEGER,           -- قیمت هر واحد
  percent     REAL
);

-- ---------- کوپن ----------
CREATE TABLE IF NOT EXISTS coupons (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT UNIQUE NOT NULL,
  type         TEXT DEFAULT 'percent',   -- percent | fixed
  value        INTEGER DEFAULT 0,
  max_discount INTEGER DEFAULT 0,
  min_cart     INTEGER DEFAULT 0,
  usage_limit  INTEGER DEFAULT 0,
  per_user     INTEGER DEFAULT 1,
  used_count   INTEGER DEFAULT 0,
  user_id      INTEGER,                  -- مخصوص یک کاربر
  product_ids  TEXT DEFAULT '[]',
  seller_ids   TEXT DEFAULT '[]',
  starts_at    TEXT, expires_at TEXT,
  status       TEXT DEFAULT 'active',
  created_by   INTEGER,
  created_at   TEXT
);

-- ---------- روش ارسال ----------
CREATE TABLE IF NOT EXISTS shipping_methods (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  description     TEXT,
  base_price      INTEGER DEFAULT 0,
  free_above      INTEGER DEFAULT 0,
  extra_weight_price INTEGER DEFAULT 0,   -- به ازای هر کیلو اضافه
  extra_weight_from  INTEGER DEFAULT 0,   -- گرم
  eta_days        INTEGER DEFAULT 3,
  cod_allowed     INTEGER DEFAULT 0,
  seller_id       INTEGER,                 -- null = عمومی
  sort            INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'active'
);

-- ---------- مراکز دریافت حضوری ----------
CREATE TABLE IF NOT EXISTS pickup_centers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  address     TEXT,
  phone       TEXT,
  lat         REAL, lng REAL,
  work_hours  TEXT,
  status      TEXT DEFAULT 'active'
);

-- ---------- سبد خرید ----------
CREATE TABLE IF NOT EXISTS carts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER,
  session_id   TEXT,
  coupon_code  TEXT,
  coupon_value INTEGER DEFAULT 0,
  wallet_used  INTEGER DEFAULT 0,
  points_used  INTEGER DEFAULT 0,
  points_discount INTEGER DEFAULT 0,
  shipping_method_id INTEGER,
  pickup_id    INTEGER,
  address_id   INTEGER,
  note         TEXT,
  is_abandoned INTEGER DEFAULT 0,
  notified_at  TEXT,
  updated_at   TEXT,
  created_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_carts_user ON carts(user_id);
CREATE INDEX IF NOT EXISTS idx_carts_session ON carts(session_id);

CREATE TABLE IF NOT EXISTS cart_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_id     INTEGER NOT NULL,
  product_id  INTEGER NOT NULL,
  variant_id  INTEGER,
  seller_id   INTEGER,
  qty         INTEGER DEFAULT 1,
  price       INTEGER DEFAULT 0,        -- قیمت واحد در لحظه افزودن
  old_price   INTEGER DEFAULT 0,
  options     TEXT DEFAULT '[]',        -- [{id,title,price,qty}]
  affiliate_id INTEGER,                 -- همکار فروش
  created_at  TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cart_items ON cart_items(cart_id);

-- ---------- سفارش ----------
CREATE TABLE IF NOT EXISTS orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  code             TEXT UNIQUE NOT NULL,
  user_id          INTEGER,
  guest_phone      TEXT,
  status           TEXT DEFAULT 'pending',  -- pending|paid|processing|shipping|delivered|canceled|returned
  payment_status   TEXT DEFAULT 'unpaid',   -- unpaid|paid|refunded|partial
  payment_method   TEXT,                    -- gateway key | wallet | cod | card2card
  gateway          TEXT,
  gateway_ref      TEXT,
  authority        TEXT,
  paid_at          TEXT,
  coupon_code      TEXT,
  subtotal         INTEGER DEFAULT 0,
  items_discount   INTEGER DEFAULT 0,
  coupon_discount  INTEGER DEFAULT 0,
  shipping_cost    INTEGER DEFAULT 0,
  vat              INTEGER DEFAULT 0,
  wallet_used      INTEGER DEFAULT 0,
  points_used      INTEGER DEFAULT 0,
  points_discount  INTEGER DEFAULT 0,
  commission_total INTEGER DEFAULT 0,
  total            INTEGER DEFAULT 0,
  shipping_method_id INTEGER,
  shipping_title   TEXT,
  pickup_id        INTEGER,
  address_snapshot TEXT,
  receiver_name    TEXT,
  receiver_phone   TEXT,
  postal_code      TEXT,
  lat REAL, lng REAL,
  customer_note    TEXT,
  admin_note       TEXT,
  invoice_no       TEXT,
  tracking_code    TEXT,
  affiliate_id     INTEGER,
  delivered_at     TEXT,
  canceled_at      TEXT,
  cancel_reason    TEXT,
  created_at       TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL,
  product_id    INTEGER,
  variant_id    INTEGER,
  seller_id     INTEGER,
  title         TEXT,
  variant_title TEXT,
  image         TEXT,
  qty           INTEGER DEFAULT 1,
  price         INTEGER DEFAULT 0,
  old_price     INTEGER DEFAULT 0,
  discount      INTEGER DEFAULT 0,
  options       TEXT DEFAULT '[]',
  options_total INTEGER DEFAULT 0,
  total         INTEGER DEFAULT 0,
  commission    INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'pending', -- pending|processing|shipping|delivered|canceled|returned
  tracking_code TEXT,
  shipped_at    TEXT,
  delivered_at  TEXT,
  review_id     INTEGER,
  created_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_order_items ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_oi_seller ON order_items(seller_id);

CREATE TABLE IF NOT EXISTS order_status_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL,
  status     TEXT,
  note       TEXT,
  user_id    INTEGER,
  created_at TEXT
);

-- ---------- تسویه فروشندگان ----------
CREATE TABLE IF NOT EXISTS settlements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id     INTEGER NOT NULL,
  order_item_id INTEGER,
  amount        INTEGER DEFAULT 0,
  commission    INTEGER DEFAULT 0,
  net           INTEGER DEFAULT 0,
  due_at        TEXT,
  status        TEXT DEFAULT 'pending', -- pending | paid
  paid_at       TEXT,
  created_at    TEXT
);

-- ---------- تراکنش‌ها ----------
CREATE TABLE IF NOT EXISTS transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,
  owner_type  TEXT DEFAULT 'user',   -- user | seller | system
  owner_id    INTEGER,
  type        TEXT NOT NULL,         -- deposit|withdraw|order|refund|commission|affiliate|adjust|charge_wallet|preinvoice
  amount      INTEGER NOT NULL,      -- مثبت = واریز، منفی = برداشت
  balance     INTEGER DEFAULT 0,
  gateway     TEXT,
  reference   TEXT,
  authority   TEXT,
  order_id    INTEGER,
  status      TEXT DEFAULT 'success', -- success|pending|failed|canceled
  description TEXT,
  meta        TEXT DEFAULT '{}',
  created_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at);

-- ---------- پیش‌فاکتور ----------
CREATE TABLE IF NOT EXISTS preinvoices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT UNIQUE NOT NULL,
  user_id     INTEGER,
  created_by  INTEGER,
  items       TEXT DEFAULT '[]',   -- [{title,qty,price,discount}]
  subtotal    INTEGER DEFAULT 0,
  discount    INTEGER DEFAULT 0,
  vat         INTEGER DEFAULT 0,
  total       INTEGER DEFAULT 0,
  note        TEXT,
  status      TEXT DEFAULT 'pending', -- pending|paid|canceled|expired
  expires_at  TEXT,
  paid_at     TEXT,
  created_at  TEXT
);

-- ---------- همکاری در فروش ----------
CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id  INTEGER NOT NULL,
  user_id       INTEGER NOT NULL,
  level         INTEGER DEFAULT 1,
  created_at    TEXT,
  UNIQUE(affiliate_id, user_id)
);
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  order_id      INTEGER,
  order_item_id INTEGER,
  product_id    INTEGER,
  buyer_id      INTEGER,
  level         TEXT DEFAULT 'bronze',
  percent       REAL DEFAULT 0,
  amount        INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'pending', -- pending|approved|paid|rejected
  created_at    TEXT
);
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER,
  product_id   INTEGER,
  ip           TEXT,
  created_at   TEXT
);

-- ---------- باشگاه مشتریان ----------
CREATE TABLE IF NOT EXISTS club_activities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  points      INTEGER DEFAULT 0,
  reason      TEXT,          -- purchase | review | register | referral | login | admin
  reference   TEXT,
  created_at  TEXT
);
CREATE TABLE IF NOT EXISTS club_levels (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  level       TEXT UNIQUE NOT NULL,
  title       TEXT,
  min_points  INTEGER DEFAULT 0,
  color       TEXT,
  perks       TEXT DEFAULT '[]',
  discount    REAL DEFAULT 0
);

-- ---------- نظرات ----------
CREATE TABLE IF NOT EXISTS reviews (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id   INTEGER NOT NULL,
  user_id      INTEGER,
  rating       INTEGER DEFAULT 5,
  title        TEXT,
  body         TEXT,
  pros         TEXT DEFAULT '[]',
  cons         TEXT DEFAULT '[]',
  recommend    INTEGER DEFAULT 1,
  is_buyer     INTEGER DEFAULT 0,
  helpful      INTEGER DEFAULT 0,
  status       TEXT DEFAULT 'pending', -- pending|approved|rejected
  admin_reply  TEXT,
  created_at   TEXT, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE TABLE IF NOT EXISTS review_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT, review_id INTEGER, media_path TEXT, created_at TEXT
);

-- ---------- پرسش و پاسخ ----------
CREATE TABLE IF NOT EXISTS questions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  user_id    INTEGER,
  body       TEXT NOT NULL,
  status     TEXT DEFAULT 'pending',
  created_at TEXT, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS answers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL,
  user_id     INTEGER,
  role_label  TEXT DEFAULT 'user',  -- user | admin | seller | buyer
  body        TEXT NOT NULL,
  created_at  TEXT
);

-- ---------- مجله ----------
CREATE TABLE IF NOT EXISTS post_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, slug TEXT UNIQUE, sort INTEGER DEFAULT 0, status TEXT DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, slug TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  author_type  TEXT DEFAULT 'admin',  -- admin | seller
  author_id    INTEGER,
  seller_id    INTEGER,
  category_id  INTEGER,
  title        TEXT NOT NULL,
  slug         TEXT UNIQUE NOT NULL,
  excerpt      TEXT,
  body         TEXT,
  cover        TEXT,
  video_url    TEXT,
  audio_url    TEXT,
  kind         TEXT DEFAULT 'text',   -- text | video | podcast
  tags         TEXT DEFAULT '[]',
  status       TEXT DEFAULT 'published', -- draft|pending|published
  views        INTEGER DEFAULT 0,
  seo_title    TEXT, seo_desc TEXT,
  published_at TEXT,
  created_at   TEXT, updated_at TEXT, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE TABLE IF NOT EXISTS post_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, product_id INTEGER NOT NULL, sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER,
  user_id    INTEGER,
  parent_id  INTEGER,
  body       TEXT,
  status     TEXT DEFAULT 'pending',
  created_at TEXT
);

-- ---------- استوری ----------
CREATE TABLE IF NOT EXISTS stories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type  TEXT DEFAULT 'admin',  -- admin | seller
  owner_id    INTEGER,
  media_path  TEXT,
  media_type  TEXT DEFAULT 'image',  -- image | video
  link        TEXT,
  product_ids TEXT DEFAULT '[]',
  duration    INTEGER DEFAULT 5,
  sort        INTEGER DEFAULT 0,
  views       INTEGER DEFAULT 0,
  likes       INTEGER DEFAULT 0,
  starts_at   TEXT,
  expires_at  TEXT,
  status      TEXT DEFAULT 'active',
  created_at  TEXT
);
CREATE TABLE IF NOT EXISTS story_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT, story_id INTEGER, user_id INTEGER, ip TEXT, created_at TEXT
);

-- ---------- صفحات / فرم‌ها / منو / FAQ ----------
CREATE TABLE IF NOT EXISTS pages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  body       TEXT,
  seo_title  TEXT, seo_desc TEXT,
  views      INTEGER DEFAULT 0,
  status     TEXT DEFAULT 'published',
  created_at TEXT, updated_at TEXT, deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS forms (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  slug         TEXT UNIQUE NOT NULL,
  description  TEXT,
  fields       TEXT DEFAULT '[]',   -- [{name,label,type,required,options}]
  success_msg  TEXT,
  notify_email TEXT,
  status       TEXT DEFAULT 'active',
  created_at   TEXT
);
CREATE TABLE IF NOT EXISTS form_submissions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id    INTEGER NOT NULL,
  user_id    INTEGER,
  data       TEXT DEFAULT '{}',
  ip         TEXT,
  status     TEXT DEFAULT 'new',
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, location TEXT UNIQUE, status TEXT DEFAULT 'active', created_at TEXT
);
CREATE TABLE IF NOT EXISTS menu_items (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_id   INTEGER NOT NULL,
  parent_id INTEGER,
  title     TEXT NOT NULL,
  url       TEXT,
  target    TEXT DEFAULT '_self',
  icon      TEXT,
  sort      INTEGER DEFAULT 0,
  status    TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS faqs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  question   TEXT NOT NULL,
  answer     TEXT,
  category   TEXT,
  sort       INTEGER DEFAULT 0,
  views      INTEGER DEFAULT 0,
  status     TEXT DEFAULT 'active',
  created_at TEXT
);

-- ---------- قالب / صفحه‌ساز ----------
CREATE TABLE IF NOT EXISTS templates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  route       TEXT DEFAULT 'home',     -- home | category | custom
  theme       TEXT DEFAULT 'classic',
  sections    TEXT DEFAULT '[]',
  is_active   INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'draft',
  created_by  INTEGER,
  created_at  TEXT, updated_at TEXT
);

-- ---------- مدیا ----------
CREATE TABLE IF NOT EXISTS media (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,
  owner_type  TEXT DEFAULT 'admin',
  folder      TEXT DEFAULT '/',
  filename    TEXT NOT NULL,
  path        TEXT NOT NULL,
  mime        TEXT,
  size        INTEGER DEFAULT 0,
  width       INTEGER, height INTEGER,
  alt         TEXT,
  watermark   INTEGER DEFAULT 0,
  downloads   INTEGER DEFAULT 0,
  created_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_media_folder ON media(folder);

-- ---------- تیکت ----------
CREATE TABLE IF NOT EXISTS tickets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT UNIQUE NOT NULL,
  subject       TEXT NOT NULL,
  body          TEXT,
  department    TEXT DEFAULT 'support',
  priority      TEXT DEFAULT 'normal',  -- low|normal|high|critical
  owner_type    TEXT DEFAULT 'user',    -- user | seller | admin
  owner_id      INTEGER,
  assignee_id   INTEGER,
  seller_id     INTEGER,
  product_id    INTEGER,
  order_id      INTEGER,
  status        TEXT DEFAULT 'open',    -- open | answered | closed | pending
  last_message_at TEXT,
  messages_count INTEGER DEFAULT 0,
  created_at    TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS ticket_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id  INTEGER NOT NULL,
  user_id    INTEGER,
  role_label TEXT DEFAULT 'user',
  body       TEXT,
  attachment TEXT,
  is_internal INTEGER DEFAULT 0,
  created_at TEXT
);

-- ---------- اعلان‌ها ----------
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  type       TEXT DEFAULT 'info',
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  icon       TEXT,
  read_at    TEXT,
  sms_sent   INTEGER DEFAULT 0,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);

-- ---------- نشست‌ها ----------
CREATE TABLE IF NOT EXISTS user_sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  sid          TEXT UNIQUE,
  ip           TEXT,
  city         TEXT,
  country      TEXT,
  device       TEXT,
  browser      TEXT,
  os           TEXT,
  is_current   INTEGER DEFAULT 0,
  login_at     TEXT,
  last_seen_at TEXT,
  revoked_at   TEXT
);

-- ---------- لاگ فعالیت ----------
CREATE TABLE IF NOT EXISTS activity_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER,
  actor_type   TEXT DEFAULT 'guest',
  action       TEXT NOT NULL,
  subject_type TEXT,
  subject_id   INTEGER,
  description  TEXT,
  ip           TEXT,
  meta         TEXT DEFAULT '{}',
  created_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);

-- ---------- آمار بازدید ----------
CREATE TABLE IF NOT EXISTS page_views (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  path       TEXT,
  user_id    INTEGER,
  ip         TEXT,
  ua         TEXT,
  referer    TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pv_created ON page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_pv_path ON page_views(path);

-- ---------- جستجو ----------
CREATE TABLE IF NOT EXISTS search_terms (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  term   TEXT UNIQUE NOT NULL,
  count  INTEGER DEFAULT 1,
  last_at TEXT
);

-- ---------- علاقمندی / بازدید اخیر / مقایسه / اعلان ----------
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, product_id INTEGER NOT NULL, created_at TEXT,
  UNIQUE(user_id, product_id)
);
CREATE TABLE IF NOT EXISTS recently_viewed (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT, product_id INTEGER NOT NULL, viewed_at TEXT
);
CREATE TABLE IF NOT EXISTS compare_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT, product_id INTEGER NOT NULL, created_at TEXT
);
CREATE TABLE IF NOT EXISTS product_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
  kind TEXT DEFAULT 'in_stock',   -- in_stock | on_sale
  status TEXT DEFAULT 'active',
  created_at TEXT,
  UNIQUE(user_id, product_id, kind)
);

-- ---------- نشانی‌ها ----------
CREATE TABLE IF NOT EXISTS addresses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  title       TEXT,
  receiver    TEXT,
  phone       TEXT,
  province    TEXT,
  city        TEXT,
  address     TEXT,
  postal_code TEXT,
  lat REAL, lng REAL,
  is_default  INTEGER DEFAULT 0,
  created_at  TEXT
);

-- ---------- کد یکبار مصرف ----------
CREATE TABLE IF NOT EXISTS otp_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  phone      TEXT NOT NULL,
  code       TEXT NOT NULL,
  purpose    TEXT DEFAULT 'login',  -- login | register | verify | withdraw | seller
  attempts   INTEGER DEFAULT 0,
  consumed_at TEXT,
  expires_at TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_otp ON otp_codes(phone, purpose);

-- ---------- پیامک‌های ارسال‌شده ----------
CREATE TABLE IF NOT EXISTS sms_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  provider   TEXT,
  phone      TEXT,
  body       TEXT,
  template   TEXT,
  status     TEXT DEFAULT 'sent',
  response   TEXT,
  created_at TEXT
);

-- ---------- نرخ ارز ----------
CREATE TABLE IF NOT EXISTS currencies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT UNIQUE NOT NULL,
  title      TEXT,
  rate       INTEGER DEFAULT 1,
  is_base    INTEGER DEFAULT 0,
  updated_at TEXT
);

-- ---------- بنر/اسلایدر ----------
CREATE TABLE IF NOT EXISTS banners (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT,
  image      TEXT,
  image_dark TEXT,
  link       TEXT,
  position   TEXT DEFAULT 'home',  -- home | top | sidebar | footer | product
  sort       INTEGER DEFAULT 0,
  starts_at  TEXT, ends_at TEXT,
  clicks     INTEGER DEFAULT 0,
  views      INTEGER DEFAULT 0,
  status     TEXT DEFAULT 'active',
  created_at TEXT
);

-- ---------- ناحیه‌های جغرافیایی ----------
CREATE TABLE IF NOT EXISTS provinces (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT, lat REAL, lng REAL
);
CREATE TABLE IF NOT EXISTS cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT, province_id INTEGER, name TEXT NOT NULL, slug TEXT, lat REAL, lng REAL
);

-- ---------- خبرنامه ----------
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT UNIQUE NOT NULL,
  name       TEXT,
  user_id    INTEGER,
  status     TEXT DEFAULT 'active',   -- active | unsubscribed
  token      TEXT,
  ip         TEXT,
  created_at TEXT, updated_at TEXT, unsubscribed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers(email);
