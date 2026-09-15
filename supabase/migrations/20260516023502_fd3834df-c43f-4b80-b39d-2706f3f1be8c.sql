
-- customers
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  address text,
  area text,
  company text,
  opening_balance numeric not null default 0,
  created_at timestamptz not null default now()
);
alter table public.customers enable row level security;
create policy "own customers" on public.customers for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.customers(user_id);

-- products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  company text,
  pack text,
  unit text,
  stock numeric not null default 0,
  purchase_price numeric not null default 0,
  sale_price numeric not null default 0,
  low_stock_threshold numeric not null default 0,
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;
create policy "own products" on public.products for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.products(user_id);

-- invoices
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  number integer not null,
  customer_id uuid not null,
  customer_name text not null,
  date timestamptz not null default now(),
  items jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  paid numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.invoices enable row level security;
create policy "own invoices" on public.invoices for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.invoices(user_id);
create index on public.invoices(customer_id);

-- last prices
create table public.last_prices (
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null,
  product_id uuid not null,
  price numeric not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, customer_id, product_id)
);
alter table public.last_prices enable row level security;
create policy "own last prices" on public.last_prices for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- company settings (one row per user)
create table public.company_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Your Pharma Distributors',
  address text not null default 'Main Market',
  phone text not null default '',
  invoice_counter integer not null default 1000,
  updated_at timestamptz not null default now()
);
alter table public.company_settings enable row level security;
create policy "own settings" on public.company_settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- auto-create company_settings on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.company_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
