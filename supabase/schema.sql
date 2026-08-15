-- =========================================================
--  نماء كارد | Namaa VCC — Supabase schema
--  شغّل الملف ده مرة واحدة في SQL Editor
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- الإعدادات العامة ----------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  usd_rate_egp numeric not null default 52,        -- تكلفة الدولار عليك (شراء USDT/تمويل Bitnob)
  network_rate_egp numeric not null default 50,    -- سعر تحويل شبكة Visa التقريبي (EGP/USD) لحساب قيمة الكارت
  margin_percent numeric not null default 12,      -- هامش ربحك %
  fixed_fee_egp numeric not null default 15,       -- رسوم ثابتة لكل عملية
  fx_buffer_percent numeric not null default 5,    -- هامش أمان لتحويل يوتيوب EGP على كارت USD
  min_card_usd numeric not null default 2,
  max_card_usd numeric not null default 250,       -- حد Lite Card عند Bitnob
  card_tier text not null default 'lite' check (card_tier in ('lite','full')),
  require_otp boolean not null default true,
  card_validity_hours int not null default 72,     -- بعدها الكارت يتجمّد تلقائيًا
  support_whatsapp text default '',
  updated_at timestamptz default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------- الباقات ----------
create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  description text default '',
  youtube_price_egp numeric default null,  -- المبلغ اللي هيتخصم على يوتيوب (للعرض)
  card_usd numeric not null,               -- قيمة الكارت بالدولار
  price_egp numeric not null,              -- اللي العميل يدفعه بكاشير
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz default now()
);

-- ---------- الطلبات ----------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text unique not null,
  package_id uuid references public.packages(id) on delete set null,
  customer_name text not null,
  first_name_en text not null,
  last_name_en text not null,
  phone text not null,
  dial_code text not null default '+20',
  email text not null,
  -- حقول KYC الإضافية لو card_tier = full
  id_type text default null,       -- national_id | passport | drivers_license
  id_number text default null,
  date_of_birth date default null,
  address_line1 text default null,
  city text default null,
  state text default null,
  postal_code text default null,
  country text not null default 'EGY',
  -- المبالغ
  amount_egp numeric not null,
  card_usd numeric not null,
  -- الحالة
  status text not null default 'pending',
  -- pending | paid | issuing | card_ready | used | expired | failed | refund_needed | cancelled
  fail_reason text default null,
  kashier_ref text default null,
  kashier_payload jsonb default null,
  -- OTP
  otp_hash text default null,
  otp_expires_at timestamptz default null,
  otp_attempts int not null default 0,
  created_at timestamptz default now(),
  paid_at timestamptz default null,
  updated_at timestamptz default now()
);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_created_idx on public.orders(created_at desc);

-- ---------- الكروت ----------
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  order_id uuid unique not null references public.orders(id) on delete cascade,
  bitnob_card_id text unique default null,
  bitnob_customer_id text default null,
  tier text not null default 'lite',
  card_brand text default 'visa',
  masked_pan text default null,
  last4 text default null,
  status text not null default 'processing',
  -- processing | active | frozen | terminated | failed
  funded_usd numeric default null,
  encrypted_details text default null,   -- AES-256-GCM(json بيانات الكارت الكاملة)
  view_count int not null default 0,
  first_viewed_at timestamptz default null,
  first_used_at timestamptz default null,
  frozen_at timestamptz default null,
  terminated_at timestamptz default null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- سجلات الويبهوك ----------
create table if not exists public.webhook_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,          -- kashier | bitnob | n8n
  event text default null,
  payload jsonb default null,
  ok boolean default true,
  note text default null,
  created_at timestamptz default now()
);
create index if not exists webhook_logs_created_idx on public.webhook_logs(created_at desc);

-- ---------- الأدمنز ----------
create table if not exists public.admins (
  email text primary key,
  created_at timestamptz default now()
);
-- ضيف إيميلك هنا بعد ما تعمله Auth user من لوحة Supabase:
-- insert into public.admins(email) values ('you@example.com');

-- =========================================================
--  RLS: كل حاجة مقفولة — السيرفر بس (service role) هو اللي بيتعامل.
--  الاستثناء الوحيد: قراءة الباقات النشطة للصفحة العامة.
-- =========================================================
alter table public.settings enable row level security;
alter table public.packages enable row level security;
alter table public.orders enable row level security;
alter table public.cards enable row level security;
alter table public.webhook_logs enable row level security;
alter table public.admins enable row level security;

drop policy if exists "public read active packages" on public.packages;
create policy "public read active packages"
  on public.packages for select
  to anon, authenticated
  using (active = true);
