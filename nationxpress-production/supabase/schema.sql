-- NationXpress Enterprises production starter schema.
-- Run in Supabase SQL Editor. Create the first staff user in Authentication > Users.
-- Then insert that user's UUID into staff_profiles using a separate SQL statement.
-- Do NOT put the service_role key in browser code.
create extension if not exists pgcrypto;

create table if not exists public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'NationXpress Staff',
  role text not null default 'staff' check(role in ('admin','staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_nx_staff()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.staff_profiles sp
    where sp.user_id = (select auth.uid()) and sp.active = true
  );
$$;
revoke all on function public.is_nx_staff() from public;
grant execute on function public.is_nx_staff() to authenticated;

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  vendor text not null check (length(trim(vendor)) between 2 and 80),
  docket text not null check (length(trim(docket)) between 1 and 90),
  shipment_date date not null,
  weight_kg numeric(12,2) not null check (weight_kg >= 0),
  from_party text not null check (length(trim(from_party)) between 1 and 200),
  ship_to_party text not null check (length(trim(ship_to_party)) between 1 and 200),
  from_location text not null default '',
  ship_to_location text not null default '',
  art integer not null check (art >= 0),
  status text not null default 'Pending' check (status in ('Pending','In transit','Delivered','Exception')),
  billing_status text not null default 'Pending' check (billing_status in ('Pending','Billed','Reconciled')),
  notes text not null default '' check (length(notes) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(vendor,docket)
);
create index if not exists shipments_date_idx on public.shipments(shipment_date desc);
create index if not exists shipments_party_idx on public.shipments(from_party);

create table if not exists public.party_rates (
  id uuid primary key default gen_random_uuid(),
  vendor text not null check (length(trim(vendor)) between 2 and 80),
  party text not null check (length(trim(party)) between 1 and 200),
  cost_per_kg numeric(12,2) not null check (cost_per_kg >= 0),
  sell_per_kg numeric(12,2) not null check (sell_per_kg >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(vendor,party)
);

create table if not exists public.quote_leads (
  id uuid primary key default gen_random_uuid(),
  company text not null check (length(trim(company)) between 2 and 120),
  contact_name text not null check (length(trim(contact_name)) between 2 and 120),
  email text not null check (length(email) between 5 and 200 and position('@' in email)>1),
  phone text not null check (length(phone) between 10 and 20),
  origin_pin text not null check (origin_pin ~ '^[0-9]{6}$'),
  destination_pin text not null check (destination_pin ~ '^[0-9]{6}$'),
  weight_kg numeric(12,2) not null check(weight_kg>0 and weight_kg<=1000000),
  service text not null check(service in ('Surface freight','Air freight','Express courier','Corporate / recurring')),
  notes text not null default '' check(length(notes)<=2000),
  created_at timestamptz not null default now()
);
create index if not exists quote_leads_created_idx on public.quote_leads(created_at desc);

create or replace function public.set_nx_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists shipments_updated_at on public.shipments;
create trigger shipments_updated_at before update on public.shipments for each row execute function public.set_nx_updated_at();
drop trigger if exists rates_updated_at on public.party_rates;
create trigger rates_updated_at before update on public.party_rates for each row execute function public.set_nx_updated_at();

alter table public.staff_profiles enable row level security;
alter table public.shipments enable row level security;
alter table public.party_rates enable row level security;
alter table public.quote_leads enable row level security;

revoke all on public.staff_profiles,public.shipments,public.party_rates,public.quote_leads from anon, authenticated;
grant select on public.staff_profiles to authenticated;
grant select,insert,update,delete on public.shipments,public.party_rates to authenticated;
grant select on public.quote_leads to authenticated;
grant insert on public.quote_leads to anon;

-- Staff can only read their own role; nobody can self-promote using client credentials.
drop policy if exists "staff own profile" on public.staff_profiles;
create policy "staff own profile" on public.staff_profiles for select to authenticated using ((select auth.uid())=user_id);

-- Shipments and pricing remain invisible to anonymous web visitors and unauthorized users.
drop policy if exists "staff shipment read" on public.shipments;
create policy "staff shipment read" on public.shipments for select to authenticated using ((select public.is_nx_staff()));
drop policy if exists "staff shipment insert" on public.shipments;
create policy "staff shipment insert" on public.shipments for insert to authenticated with check ((select public.is_nx_staff()));
drop policy if exists "staff shipment update" on public.shipments;
create policy "staff shipment update" on public.shipments for update to authenticated using ((select public.is_nx_staff())) with check ((select public.is_nx_staff()));
drop policy if exists "staff shipment delete" on public.shipments;
create policy "staff shipment delete" on public.shipments for delete to authenticated using ((select public.is_nx_staff()));

drop policy if exists "staff rates read" on public.party_rates;
create policy "staff rates read" on public.party_rates for select to authenticated using ((select public.is_nx_staff()));
drop policy if exists "staff rates insert" on public.party_rates;
create policy "staff rates insert" on public.party_rates for insert to authenticated with check ((select public.is_nx_staff()));
drop policy if exists "staff rates update" on public.party_rates;
create policy "staff rates update" on public.party_rates for update to authenticated using ((select public.is_nx_staff())) with check ((select public.is_nx_staff()));
drop policy if exists "staff rates delete" on public.party_rates;
create policy "staff rates delete" on public.party_rates for delete to authenticated using ((select public.is_nx_staff()));

-- Anyone can submit an enquiry, but only verified staff can read the private inbox.
-- Production hardening: protect public submissions with Turnstile + an edge function and rate limits.
drop policy if exists "public may submit a quote" on public.quote_leads;
create policy "public may submit a quote" on public.quote_leads for insert to anon with check (true);
drop policy if exists "staff may read quotes" on public.quote_leads;
create policy "staff may read quotes" on public.quote_leads for select to authenticated using ((select public.is_nx_staff()));

-- IMPORTANT FIRST STAFF BOOTSTRAP (run separately, after creating the user in Supabase Authentication):
-- insert into public.staff_profiles(user_id,display_name,role,active)
-- values ('PASTE-SUPABASE-AUTH-USER-UUID-HERE','NationXpress Admin','admin',true);