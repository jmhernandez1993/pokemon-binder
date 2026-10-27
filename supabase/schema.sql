-- Gen 1 Binder schema. Paste into the Supabase SQL editor and run once.
--
-- Two kinds of data live in separate tables on purpose:
--   * cards, price_history : catalog + prices. Written only by scripts (service role key).
--   * ownership, binder_picks : YOUR records. Written only by the app, as you.
-- A price refresh or catalog re-seed has no write access path to ownership/paid fields.

create table if not exists public.cards (
  id                    text primary key,
  dex                   int  not null check (dex between 1 and 151),
  pokemon               text not null,
  card                  text not null,
  set_name              text,
  set_code              text not null,
  number                text not null,
  tier                  text,
  language              text not null check (language in ('EN', 'JP')),
  pickable              boolean not null default false,
  price_usd             numeric(10, 2),
  price_source          text,
  price_date            date,
  tcgplayer_url         text,
  tcgplayer_product_id  bigint,
  limitless_url         text
);

create table if not exists public.price_history (
  card_id     text not null references public.cards (id) on delete cascade,
  price_date  date not null,
  price_usd   numeric(10, 2) not null,
  primary key (card_id, price_date)
);

create table if not exists public.ownership (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id     text not null references public.cards (id) on delete cascade,
  owned       boolean not null default false,
  paid_usd    numeric(10, 2) check (paid_usd is null or paid_usd >= 0),
  updated_at  timestamptz not null default now(),
  primary key (user_id, card_id)
);

create table if not exists public.binder_picks (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  dex         int  not null check (dex between 1 and 151),
  card_id     text not null references public.cards (id) on delete cascade,
  updated_at  timestamptz not null default now(),
  primary key (user_id, dex)
);

-- Row level security: catalog is read-only to the app; your records are visible only to you.
alter table public.cards          enable row level security;
alter table public.price_history  enable row level security;
alter table public.ownership      enable row level security;
alter table public.binder_picks   enable row level security;

drop policy if exists "cards readable" on public.cards;
create policy "cards readable" on public.cards for select to authenticated using (true);

drop policy if exists "history readable" on public.price_history;
create policy "history readable" on public.price_history for select to authenticated using (true);

drop policy if exists "own rows" on public.ownership;
create policy "own rows" on public.ownership for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own picks" on public.binder_picks;
create policy "own picks" on public.binder_picks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists ownership_touch on public.ownership;
create trigger ownership_touch before update on public.ownership
  for each row execute function public.touch_updated_at();

drop trigger if exists picks_touch on public.binder_picks;
create trigger picks_touch before update on public.binder_picks
  for each row execute function public.touch_updated_at();
