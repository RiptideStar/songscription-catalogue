-- Songscription catalogue — schema + storage
-- Single-user app (no auth). The service-role key handles all writes server-side.

-- ── transcriptions ─────────────────────────────────────────────────────────
create table if not exists public.transcriptions (
  id            uuid primary key default gen_random_uuid(),
  title         text        not null,
  created_at    timestamptz not null default now(),

  -- storage
  file_path     text        not null,        -- key in the `midi` bucket
  file_size     integer     not null,        -- bytes

  -- parsed MIDI metadata (the stuff a learner actually cares about)
  duration_sec  real        not null default 0,
  tempo_bpm     integer,                      -- null if the file declares none
  key_sig       text,                         -- e.g. "C major", null if undeclared
  time_sig      text,                         -- e.g. "4/4"
  track_count   integer     not null default 1,
  note_count    integer     not null default 0,
  lowest_note   integer,                      -- MIDI note number (21–108ish)
  highest_note  integer,
  difficulty    integer     not null default 1 check (difficulty between 1 and 5),

  -- derived presentation
  color         text        not null default '#caa46a', -- per-song accent for the grid

  -- learner / practice metadata (mock-but-real for a single user)
  is_favorite   boolean     not null default false,
  last_played_at timestamptz,
  play_count    integer     not null default 0
);

create index if not exists transcriptions_created_at_idx on public.transcriptions (created_at desc);
create index if not exists transcriptions_favorite_idx   on public.transcriptions (is_favorite) where is_favorite;
create index if not exists transcriptions_last_played_idx on public.transcriptions (last_played_at desc nulls last);
create index if not exists transcriptions_title_idx       on public.transcriptions (lower(title));

-- ── storage bucket for the raw .mid blobs ───────────────────────────────────
insert into storage.buckets (id, name, public)
values ('midi', 'midi', true)
on conflict (id) do nothing;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- The server uses the service-role key, which bypasses RLS. We still enable RLS
-- and add read-only anon policies so the public client can list/read directly,
-- while writes stay server-side only. (No auth in this app by design.)
alter table public.transcriptions enable row level security;

drop policy if exists "anon can read transcriptions" on public.transcriptions;
create policy "anon can read transcriptions"
  on public.transcriptions for select
  to anon
  using (true);

-- Public read of the bucket objects (bucket is public, but be explicit).
drop policy if exists "anon can read midi objects" on storage.objects;
create policy "anon can read midi objects"
  on storage.objects for select
  to anon
  using (bucket_id = 'midi');
