# Songscription — Catalogue

A catalogue for a piano-learning app, built as a single osu!-style song-select surface. Upload a `.mid` file (the stand-in for "you just transcribed a song"), it joins your library on the right, and hovering it previews the song in a big auto-looping scrolling piano-roll on the left. Click to commit it to practice mode.

Built for the Songscription full-stack take-home. Live demo link is in the submission email — the experience (hover-to-preview, the auto-looping scrolling roll, the audio) is best seen running, so I'd start there.

## What it does

- **Upload** `.mid` files via drag-and-drop or click. The file is parsed server-side, the blob goes to Supabase Storage, and the metadata lands in Postgres. Optimistic UI on the catalogue.
- **Browse** the library as an osu!-style song-select list on the right. Each panel shows the real parsed facts (key, tempo, duration, difficulty) and a per-song accent color derived from the file's fingerprint, with a satisfying pop-and-glow on the active song.
- **Hover to preview**: the big left hero is the star — a real-time **scrolling piano-roll of the actual notes** with a pinned playhead, auto-looping **playback** (Tone.js). Metadata is intentionally a whisper so the music dominates.
- **Discover** with search, sort (recent / A–Z / difficulty / duration / recently played), a favorites filter, and a "Surprise me" shuffle for the days you don't know what to practice.
- **Click to commit** a song to practice mode (a polished placeholder for the real piano-roll practice engine). The selection deep-links via `?song=` so it survives refresh and is shareable.

It persists. Refresh and everything is still there, because it's all in Supabase.

## Backend: Supabase (Postgres + Storage)

I went with Supabase because it's what Songscription uses, and it's the right tool here: a relational table for the queryable metadata plus object storage for the raw `.mid` blobs, in one service.

### Data model — `transcriptions`

Every song is one row. The interesting design choice is **what to store**: I parse the MIDI once on upload and persist the summary facts a learner actually scans (tempo, key, time signature, duration, note count, pitch range, track count), plus a derived `difficulty` (1–5) and a derived `color` accent. The raw note events are NOT stored in the row — they'd bloat it and they're only needed when a song is previewed, so I re-parse the blob client-side on hover. That keeps list queries tiny and fast.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | pk |
| `title` | text | from filename or user override |
| `created_at` | timestamptz | |
| `file_path` | text | key in the `midi` storage bucket |
| `file_size` | int | bytes |
| `duration_sec` | real | parsed |
| `tempo_bpm` | int \| null | many MIDIs declare none |
| `key_sig` | text \| null | e.g. "C major" |
| `time_sig` | text \| null | e.g. "4/4" |
| `track_count` | int | tracks with notes |
| `note_count` | int | |
| `lowest_note` / `highest_note` | int \| null | MIDI note numbers → shown as "E2 – F5" |
| `difficulty` | int (1–5) | derived from note density + range + polyphony |
| `color` | text | derived accent, stable per file |
| `is_favorite` | bool | |
| `last_played_at` | timestamptz \| null | bumped on playback |
| `play_count` | int | bumped on playback |

Indexed on `created_at`, `is_favorite` (partial), `last_played_at`, and `lower(title)` so the sorts and search stay cheap as the library grows.

The migration is in [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). Writes go through the service-role key server-side; the public client gets read-only access via RLS (there's no auth in this app by design).

### Storage boundary

Nothing in the UI touches Supabase directly. Everything reads/writes through [`src/lib/storage.ts`](src/lib/storage.ts), so the backend is swappable and the data access is in one place.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · Supabase · `@tonejs/midi` (parsing) · `tone` (playback) · Fraunces / Inter / JetBrains Mono.

## Running it locally

```bash
npm install

# .env.local
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# apply the schema to your Supabase project
supabase link --project-ref <your-ref>
supabase db push

# seed the 3 sample songs with mock practice data (optional)
npm run seed

npm run dev   # http://localhost:3000
```

## Project layout

```
src/
  app/
    page.tsx                  single-surface catalogue (server-fetched list + MIDI URLs)
    api/transcriptions/       REST route handlers (list, upload, get, patch, delete, play)
  components/
    catalogue/
      CatalogueShell.tsx      master-detail owner: selection, hover-preview, ?song deep-link
      SongList.tsx            osu!-style right song-select list (search / sort / favorites)
    player/
      Hero.tsx                dominant left hero: scrolling roll, transport, practice commit
      ScrollingPianoRoll.tsx  canvas roll with a pinned playhead, notes scroll past
      useSongPlayer.ts        Tone.js engine (play/seek/loop, RAF-driven progress)
    detail/                   piano-roll helpers, MIDI loader, practice placeholder (reused)
    upload/                   drag-and-drop dropzone
  lib/
    midi.ts                   MIDI parsing + difficulty/color derivation
    storage.ts               the Supabase boundary
    types.ts                  shared types
    format.ts                duration / relative-time / note-name helpers
  utils/supabase/            clients (browser publishable, server service-role)
supabase/migrations/         schema
scripts/seed.mjs             sample data seeder
```
