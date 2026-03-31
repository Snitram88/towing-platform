create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('customer', 'driver', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.driver_verification_status as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.booking_status as enum (
    'draft',
    'quoted',
    'searching_driver',
    'driver_assigned',
    'driver_en_route',
    'driver_arrived',
    'in_service',
    'completed',
    'canceled_by_customer',
    'canceled_by_driver',
    'canceled_by_admin'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_status as enum ('unpaid', 'pending', 'paid', 'failed', 'refunded');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.wallet_owner_type as enum ('customer', 'driver');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.wallet_transaction_type as enum (
    'topup',
    'booking_payment',
    'earning_credit',
    'withdrawal',
    'adjustment',
    'refund'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.document_review_status as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'customer',
  full_name text not null default '',
  email text unique,
  phone text unique,
  avatar_url text,
  is_blocked boolean not null default false,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drivers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  verification_status public.driver_verification_status not null default 'pending',
  is_online boolean not null default false,
  is_available boolean not null default false,
  verified_badge boolean not null default false,
  current_lat double precision,
  current_lng double precision,
  last_location_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicle_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tonnage_min numeric(10,2) not null,
  tonnage_max numeric(10,2) not null,
  description text not null default '',
  base_fare numeric(12,2) not null default 0,
  per_km_rate numeric(12,2) not null default 0,
  per_min_rate numeric(12,2) not null default 0,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_vehicles (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(profile_id) on delete cascade,
  vehicle_type_id uuid not null references public.vehicle_types(id) on delete restrict,
  registration_number text not null,
  make text,
  model text,
  color text,
  year integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (driver_id, registration_number)
);

create table if not exists public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(profile_id) on delete cascade,
  document_type text not null,
  file_path text not null,
  review_status public.document_review_status not null default 'pending',
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(profile_id) on delete cascade,
  driver_id uuid references public.drivers(profile_id) on delete set null,
  vehicle_type_id uuid not null references public.vehicle_types(id) on delete restrict,
  booking_status public.booking_status not null default 'draft',
  payment_status public.payment_status not null default 'unpaid',
  pickup_address text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  drop_address text not null,
  drop_lat double precision not null,
  drop_lng double precision not null,
  estimated_distance_meters integer not null default 0,
  estimated_duration_seconds integer not null default 0,
  quoted_amount numeric(12,2) not null default 0,
  final_amount numeric(12,2),
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  old_status public.booking_status,
  new_status public.booking_status not null,
  changed_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  owner_type public.wallet_owner_type not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  balance numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_type, owner_id)
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  transaction_type public.wallet_transaction_type not null,
  amount numeric(12,2) not null,
  reference_type text,
  reference_id uuid,
  status text not null default 'posted',
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.static_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  content text not null default '',
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  vehicle_type_id uuid not null unique references public.vehicle_types(id) on delete cascade,
  minimum_charge numeric(12,2) not null default 0,
  base_fare numeric(12,2) not null default 0,
  per_km_rate numeric(12,2) not null default 0,
  per_min_rate numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cancellation_rules (
  id integer primary key default 1 check (id = 1),
  free_cancellation_minutes integer not null default 5,
  customer_cancellation_fee numeric(12,2) not null default 10,
  driver_cancellation_fee numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_drivers_verification_status on public.drivers(verification_status);
create index if not exists idx_drivers_online_available on public.drivers(is_online, is_available);
create index if not exists idx_driver_vehicles_driver_id on public.driver_vehicles(driver_id);
create index if not exists idx_driver_documents_driver_id on public.driver_documents(driver_id);
create index if not exists idx_bookings_customer_id on public.bookings(customer_id);
create index if not exists idx_bookings_driver_id on public.bookings(driver_id);
create index if not exists idx_bookings_status on public.bookings(booking_status);
create index if not exists idx_booking_status_history_booking_id on public.booking_status_history(booking_id);
create index if not exists idx_wallets_owner on public.wallets(owner_type, owner_id);
create index if not exists idx_wallet_transactions_wallet_id on public.wallet_transactions(wallet_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
before update on public.customers
for each row
execute function public.set_updated_at();

drop trigger if exists trg_drivers_updated_at on public.drivers;
create trigger trg_drivers_updated_at
before update on public.drivers
for each row
execute function public.set_updated_at();

drop trigger if exists trg_vehicle_types_updated_at on public.vehicle_types;
create trigger trg_vehicle_types_updated_at
before update on public.vehicle_types
for each row
execute function public.set_updated_at();

drop trigger if exists trg_driver_vehicles_updated_at on public.driver_vehicles;
create trigger trg_driver_vehicles_updated_at
before update on public.driver_vehicles
for each row
execute function public.set_updated_at();

drop trigger if exists trg_driver_documents_updated_at on public.driver_documents;
create trigger trg_driver_documents_updated_at
before update on public.driver_documents
for each row
execute function public.set_updated_at();

drop trigger if exists trg_bookings_updated_at on public.bookings;
create trigger trg_bookings_updated_at
before update on public.bookings
for each row
execute function public.set_updated_at();

drop trigger if exists trg_wallets_updated_at on public.wallets;
create trigger trg_wallets_updated_at
before update on public.wallets
for each row
execute function public.set_updated_at();

drop trigger if exists trg_static_pages_updated_at on public.static_pages;
create trigger trg_static_pages_updated_at
before update on public.static_pages
for each row
execute function public.set_updated_at();

drop trigger if exists trg_pricing_rules_updated_at on public.pricing_rules;
create trigger trg_pricing_rules_updated_at
before update on public.pricing_rules
for each row
execute function public.set_updated_at();

drop trigger if exists trg_cancellation_rules_updated_at on public.cancellation_rules;
create trigger trg_cancellation_rules_updated_at
before update on public.cancellation_rules
for each row
execute function public.set_updated_at();

create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
begin
  requested_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'customer');

  insert into public.profiles (
    id,
    role,
    full_name,
    email,
    phone
  )
  values (
    new.id,
    case
      when requested_role in ('customer', 'driver', 'admin') then requested_role::public.app_role
      else 'customer'::public.app_role
    end,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), ''),
    new.email,
    nullif(coalesce(new.phone, new.raw_user_meta_data ->> 'phone'), '')
  )
  on conflict (id) do nothing;

  if requested_role = 'driver' then
    insert into public.drivers (profile_id)
    values (new.id)
    on conflict (profile_id) do nothing;

    insert into public.wallets (owner_type, owner_id, balance)
    values ('driver', new.id, 0)
    on conflict (owner_type, owner_id) do nothing;

  elsif requested_role = 'customer' then
    insert into public.customers (profile_id)
    values (new.id)
    on conflict (profile_id) do nothing;

    insert into public.wallets (owner_type, owner_id, balance)
    values ('customer', new.id, 0)
    on conflict (owner_type, owner_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.drivers enable row level security;
alter table public.vehicle_types enable row level security;
alter table public.driver_vehicles enable row level security;
alter table public.driver_documents enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_status_history enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.static_pages enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.cancellation_rules enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
on public.profiles
for select
to authenticated
using (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists profiles_update_own_or_admin on public.profiles;
create policy profiles_update_own_or_admin
on public.profiles
for update
to authenticated
using (auth.uid() = id or public.is_admin(auth.uid()))
with check (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists customers_select_own_or_admin on public.customers;
create policy customers_select_own_or_admin
on public.customers
for select
to authenticated
using (auth.uid() = profile_id or public.is_admin(auth.uid()));

drop policy if exists customers_update_own_or_admin on public.customers;
create policy customers_update_own_or_admin
on public.customers
for update
to authenticated
using (auth.uid() = profile_id or public.is_admin(auth.uid()))
with check (auth.uid() = profile_id or public.is_admin(auth.uid()));

drop policy if exists drivers_select_own_or_admin on public.drivers;
create policy drivers_select_own_or_admin
on public.drivers
for select
to authenticated
using (auth.uid() = profile_id or public.is_admin(auth.uid()));

drop policy if exists drivers_update_own_or_admin on public.drivers;
create policy drivers_update_own_or_admin
on public.drivers
for update
to authenticated
using (auth.uid() = profile_id or public.is_admin(auth.uid()))
with check (auth.uid() = profile_id or public.is_admin(auth.uid()));

drop policy if exists vehicle_types_read_all on public.vehicle_types;
create policy vehicle_types_read_all
on public.vehicle_types
for select
to anon, authenticated
using (is_active = true or public.is_admin(auth.uid()));

drop policy if exists vehicle_types_admin_manage on public.vehicle_types;
create policy vehicle_types_admin_manage
on public.vehicle_types
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists driver_vehicles_select_own_or_admin on public.driver_vehicles;
create policy driver_vehicles_select_own_or_admin
on public.driver_vehicles
for select
to authenticated
using (driver_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists driver_vehicles_manage_own_or_admin on public.driver_vehicles;
create policy driver_vehicles_manage_own_or_admin
on public.driver_vehicles
for all
to authenticated
using (driver_id = auth.uid() or public.is_admin(auth.uid()))
with check (driver_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists driver_documents_select_own_or_admin on public.driver_documents;
create policy driver_documents_select_own_or_admin
on public.driver_documents
for select
to authenticated
using (driver_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists driver_documents_manage_own_or_admin on public.driver_documents;
create policy driver_documents_manage_own_or_admin
on public.driver_documents
for all
to authenticated
using (driver_id = auth.uid() or public.is_admin(auth.uid()))
with check (driver_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists bookings_select_participants_or_admin on public.bookings;
create policy bookings_select_participants_or_admin
on public.bookings
for select
to authenticated
using (
  customer_id = auth.uid()
  or driver_id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists bookings_insert_customer_or_admin on public.bookings;
create policy bookings_insert_customer_or_admin
on public.bookings
for insert
to authenticated
with check (
  customer_id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists bookings_update_participants_or_admin on public.bookings;
create policy bookings_update_participants_or_admin
on public.bookings
for update
to authenticated
using (
  customer_id = auth.uid()
  or driver_id = auth.uid()
  or public.is_admin(auth.uid())
)
with check (
  customer_id = auth.uid()
  or driver_id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists booking_status_history_select_participants_or_admin on public.booking_status_history;
create policy booking_status_history_select_participants_or_admin
on public.booking_status_history
for select
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and (
        b.customer_id = auth.uid()
        or b.driver_id = auth.uid()
        or public.is_admin(auth.uid())
      )
  )
);

drop policy if exists booking_status_history_insert_participants_or_admin on public.booking_status_history;
create policy booking_status_history_insert_participants_or_admin
on public.booking_status_history
for insert
to authenticated
with check (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and (
        b.customer_id = auth.uid()
        or b.driver_id = auth.uid()
        or public.is_admin(auth.uid())
      )
  )
);

drop policy if exists wallets_select_owner_or_admin on public.wallets;
create policy wallets_select_owner_or_admin
on public.wallets
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists wallet_transactions_select_owner_or_admin on public.wallet_transactions;
create policy wallet_transactions_select_owner_or_admin
on public.wallet_transactions
for select
to authenticated
using (
  exists (
    select 1
    from public.wallets w
    where w.id = wallet_id
      and (
        w.owner_id = auth.uid()
        or public.is_admin(auth.uid())
      )
  )
);

drop policy if exists static_pages_read_published on public.static_pages;
create policy static_pages_read_published
on public.static_pages
for select
to anon, authenticated
using (is_published = true or public.is_admin(auth.uid()));

drop policy if exists static_pages_admin_manage on public.static_pages;
create policy static_pages_admin_manage
on public.static_pages
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists pricing_rules_read_all on public.pricing_rules;
create policy pricing_rules_read_all
on public.pricing_rules
for select
to anon, authenticated
using (true);

drop policy if exists pricing_rules_admin_manage on public.pricing_rules;
create policy pricing_rules_admin_manage
on public.pricing_rules
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists cancellation_rules_read_all on public.cancellation_rules;
create policy cancellation_rules_read_all
on public.cancellation_rules
for select
to anon, authenticated
using (true);

drop policy if exists cancellation_rules_admin_manage on public.cancellation_rules;
create policy cancellation_rules_admin_manage
on public.cancellation_rules
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

insert into public.vehicle_types (
  name,
  tonnage_min,
  tonnage_max,
  description,
  base_fare,
  per_km_rate,
  per_min_rate,
  display_order
)
values
  ('Light Duty', 0.00, 1.50, 'Small vehicles and compact cars', 50, 2.50, 0.50, 1),
  ('Medium Duty', 1.51, 3.50, 'Sedans, vans, and small SUVs', 80, 3.00, 0.75, 2),
  ('Heavy Duty', 3.51, 10.00, 'Large SUVs, pickups, and heavy vehicles', 120, 4.00, 1.00, 3)
on conflict (name) do nothing;

insert into public.static_pages (slug, title, content, is_published)
values
  ('terms', 'Terms & Conditions', 'Terms content goes here.', true),
  ('privacy', 'Privacy Policy', 'Privacy content goes here.', true),
  ('contact', 'Contact Us', 'Contact information goes here.', true)
on conflict (slug) do nothing;

insert into public.cancellation_rules (
  id,
  free_cancellation_minutes,
  customer_cancellation_fee,
  driver_cancellation_fee
)
values
  (1, 5, 10, 0)
on conflict (id) do nothing;

insert into public.pricing_rules (
  vehicle_type_id,
  minimum_charge,
  base_fare,
  per_km_rate,
  per_min_rate
)
select
  vt.id,
  vt.base_fare,
  vt.base_fare,
  vt.per_km_rate,
  vt.per_min_rate
from public.vehicle_types vt
on conflict (vehicle_type_id) do nothing;
