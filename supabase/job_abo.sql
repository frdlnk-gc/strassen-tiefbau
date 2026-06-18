-- Bewerberpool / Job-Abo aus dem Portal-Quiz (strassen-tiefbau.green-careers.de)
-- Im Supabase SQL-Editor des Projekts tfoopogxaqvfwbonabpi ausführen.

create table if not exists public.job_abo (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  vorname     text not null,
  nachname    text not null,
  email       text not null,
  telefon     text,
  kanal       text not null default 'email',   -- 'email' | 'whatsapp'
  beruf       text,
  plz         text,
  erfahrung   text,
  quelle      text default 'portal_quiz',
  aktiv       boolean not null default true     -- für späteres Abmelden/Opt-out
);

create index if not exists job_abo_email_idx on public.job_abo (email);
create index if not exists job_abo_plz_idx   on public.job_abo (plz);
create index if not exists job_abo_beruf_idx on public.job_abo (beruf);

-- RLS: anon darf NUR einfügen (Self-Signup vom Portal), nicht lesen.
alter table public.job_abo enable row level security;

drop policy if exists "anon kann job_abo anlegen" on public.job_abo;
create policy "anon kann job_abo anlegen"
  on public.job_abo for insert
  to anon
  with check (true);

-- Lesen/Verwalten nur über Service-Role (Backend/Versand-Job), keine SELECT-Policy für anon.
