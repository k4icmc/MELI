-- ============================================================
-- schema.sql — banco da vitrine (Supabase → SQL Editor)
-- Como usar: copie TODO este arquivo, cole no SQL Editor do Supabase
-- e clique em RUN. Pode rodar de novo sem quebrar nada.
--
-- AVISO IMPORTANTE: como o site é estático (sem servidor próprio), as
-- políticas abaixo liberam leitura E escrita para quem tiver a chave
-- pública do site. Qualquer pessoa com a chave pode alterar os dados.
-- ============================================================
create extension if not exists "pgcrypto";

-- ---------- CATEGORIAS ----------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text,
  description text,
  status text not null default 'ativa' check (status in ('ativa','inativa')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- PRODUTOS ----------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(12,2) not null default 0 check (price >= 0),
  category_id uuid references public.categories(id) on delete set null,
  category_name text,
  purchase_url text,
  images jsonb not null default '[]'::jsonb,
  status text not null default 'ativo' check (status in ('ativo','inativo','rascunho')),
  is_promo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- CONFIGURAÇÕES DA LOJA (linha única, id = 1) ----------
create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),
  site_name text,
  logo_url text,
  footer_text text,
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id) values (1) on conflict (id) do nothing;

-- ---------- updated_at automático ----------
create or replace function public.tocar_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_categories_updated on public.categories;
create trigger trg_categories_updated before update on public.categories
for each row execute function public.tocar_updated_at();

drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products
for each row execute function public.tocar_updated_at();

drop trigger if exists trg_settings_updated on public.site_settings;
create trigger trg_settings_updated before update on public.site_settings
for each row execute function public.tocar_updated_at();

-- ---------- ÍNDICES ----------
create index if not exists idx_products_status on public.products (status);
create index if not exists idx_products_category on public.products (category_id);

-- ---------- SEGURANÇA (RLS) — aberta de propósito; veja o aviso no topo ----------
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.site_settings enable row level security;

-- Categorias
drop policy if exists "categorias ler" on public.categories;
create policy "categorias ler" on public.categories for select to anon, authenticated using (true);
drop policy if exists "categorias inserir" on public.categories;
create policy "categorias inserir" on public.categories for insert to anon, authenticated with check (true);
drop policy if exists "categorias atualizar" on public.categories;
create policy "categorias atualizar" on public.categories for update to anon, authenticated using (true) with check (true);
drop policy if exists "categorias excluir" on public.categories;
create policy "categorias excluir" on public.categories for delete to anon, authenticated using (true);

-- Produtos
drop policy if exists "produtos ler" on public.products;
create policy "produtos ler" on public.products for select to anon, authenticated using (true);
drop policy if exists "produtos inserir" on public.products;
create policy "produtos inserir" on public.products for insert to anon, authenticated with check (true);
drop policy if exists "produtos atualizar" on public.products;
create policy "produtos atualizar" on public.products for update to anon, authenticated using (true) with check (true);
drop policy if exists "produtos excluir" on public.products;
create policy "produtos excluir" on public.products for delete to anon, authenticated using (true);

-- Configurações da loja
drop policy if exists "loja ler" on public.site_settings;
create policy "loja ler" on public.site_settings for select to anon, authenticated using (true);
drop policy if exists "loja inserir" on public.site_settings;
create policy "loja inserir" on public.site_settings for insert to anon, authenticated with check (true);
drop policy if exists "loja atualizar" on public.site_settings;
create policy "loja atualizar" on public.site_settings for update to anon, authenticated using (true) with check (true);
drop policy if exists "loja excluir" on public.site_settings;
create policy "loja excluir" on public.site_settings for delete to anon, authenticated using (true);

-- ---------- IMAGENS (bucket público) ----------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "imagens ler" on storage.objects;
create policy "imagens ler" on storage.objects for select to anon, authenticated using (bucket_id = 'product-images');
drop policy if exists "imagens enviar" on storage.objects;
create policy "imagens enviar" on storage.objects for insert to anon, authenticated with check (bucket_id = 'product-images');
drop policy if exists "imagens excluir" on storage.objects;
create policy "imagens excluir" on storage.objects for delete to anon, authenticated using (bucket_id = 'product-images');
