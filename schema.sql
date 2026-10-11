-- Project Green Fever: run once in the Supabase SQL editor.

create sequence if not exists pgf_report_seq;

create table if not exists public.pgf_reports (
  id               uuid primary key default gen_random_uuid(),
  reference        text unique not null default (
                     'PGF-' || to_char(now() at time zone 'Africa/Johannesburg', 'YYYY')
                     || '-' || lpad(nextval('pgf_report_seq')::text, 5, '0')),
  created_at       timestamptz not null default now(),
  status           text not null default 'Received'
                   check (status in ('Received','Under review','Referred to relevant authority','Action reported','Closed')),
  category         text not null
                   check (category in ('Litter','Illegal dumping','Damaged public infrastructure',
                                       'Neglected public space','Overgrown vegetation','Other')),
  description      text not null,
  location_text    text,
  latitude         double precision,           -- only when the reporter explicitly shared it
  longitude        double precision,
  reporter_name    text,
  reporter_contact text,                       -- email or phone, only if supplied
  reporter_email   text,                       -- set only when contact is a valid email
  evidence_path    text,                       -- path in the PRIVATE storage bucket
  evidence_mime    text,
  evidence_bytes   integer,
  accuracy_confirmed boolean not null default false,
  idempotency_key  uuid unique,
  ip_hash          text,                       -- salted SHA-256, for rate limiting only
  admin_notified   boolean not null default false,
  confirmation_sent boolean not null default false
);

create index if not exists pgf_reports_ip_time on public.pgf_reports (ip_hash, created_at desc);

-- No policies are created: with RLS on, the public (anon) key can read/write nothing.
-- Only the server, using the service-role key, can access this table.
alter table public.pgf_reports enable row level security;

-- Private evidence bucket (public = false).
insert into storage.buckets (id, name, public)
values ('pgf-evidence', 'pgf-evidence', false)
on conflict (id) do nothing;

-- Handy check: reports where the admin email failed.
-- select reference, created_at from pgf_reports where admin_notified = false order by created_at;
