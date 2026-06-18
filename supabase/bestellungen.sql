-- =============================================================================
-- Tabelle: bestellungen  (Arbeitgeber-Käufe aus kaufen-einmal.html / kaufen-abo.html)
-- Im Supabase SQL Editor des GC-OS-Projekts (ref tfoopogxaqvfwbonabpi) 1× ausführen.
-- Idempotent.
-- =============================================================================

create table if not exists public.bestellungen (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  mode            text not null,                      -- 'einmal' | 'abo'
  paket           text not null,                      -- 'smart' | 'premium' | 'exzellenz'
  anzahl          int  not null default 1,            -- Anzahl Stellen (Menge)
  laufzeit        text,                               -- '6m' | '12m' (nur Abo)
  monate          int,                                -- 1 (einmal) bzw. 6/12 (abo)

  netto_pro_einheit numeric(10,2) not null,           -- Einmalpreis bzw. Monatspreis netto (rabattiert)
  gesamt_netto      numeric(10,2) not null,           -- Gesamt über Laufzeit netto
  qty_rabatt_pct    numeric(5,2) default 0,
  code_rabatt_pct   numeric(5,2) default 0,
  ref               text,                             -- Empfehlungs-/Vertriebs-Kürzel (?ref=)

  zahlungsart     text not null,                      -- 'card' | 'paypal' | 'sepa' | 'rechnung'
  status          text not null default 'wartet_zahlung',
                  -- 'wartet_zahlung' (Rechnung offen) | 'bezahlt' | 'freigegeben' | 'storniert'

  kunde_name      text not null,
  kunde_firma     text not null,
  kunde_email     text not null,
  kunde_tel       text,
  kunde_ustid     text,

  customer_id     uuid references public.customers(id) on delete set null,  -- später verknüpfbar
  stripe_session_id text,
  notiz           text
);

create index if not exists bestellungen_status_idx  on public.bestellungen (status);
create index if not exists bestellungen_created_idx on public.bestellungen (created_at desc);
create index if not exists bestellungen_ref_idx     on public.bestellungen (ref);

-- RLS: nur Service-Role (Edge Function) und eingeloggte Admins (Backend) dürfen lesen/schreiben.
alter table public.bestellungen enable row level security;

drop policy if exists "bestellungen_admin_all" on public.bestellungen;
create policy "bestellungen_admin_all" on public.bestellungen
  for all to authenticated using (true) with check (true);

-- anon (Portal-Frontend) hat KEINEN Direktzugriff – Schreiben läuft nur über die
-- Edge Function mit Service-Role-Key. Bewusst keine anon-Policy.
