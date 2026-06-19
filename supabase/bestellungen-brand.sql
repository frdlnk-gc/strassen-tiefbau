-- =============================================================================
-- Erweiterung der Tabelle `bestellungen` um die Eintritts-Marke.
-- Im Supabase SQL Editor (Projekt ref tfoopogxaqvfwbonabpi) 1× ausführen. Idempotent.
--
-- 'grey'  = GreyCareers (Tiefbau, orange)   -> Grey-gebrandete Mails
-- 'green' = GreenCareers (GaLaBau, grün)    -> Green-gebrandete Mails
-- =============================================================================

alter table public.bestellungen add column if not exists brand text not null default 'grey';
alter table public.bestellungen add column if not exists auth_user_id uuid;   -- falls noch nicht vorhanden

create index if not exists bestellungen_brand_idx on public.bestellungen (brand);
