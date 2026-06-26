/*
  Seed the catalogue with the three sample .mid files through the real pipeline:
  parse the MIDI, upload the blob to Supabase Storage, insert the metadata row,
  then stamp mock practice data (favorites, last-played, play counts) so the
  catalogue feels lived-in for screenshots and the 0/3/300 question.

  Run:  node scripts/seed.mjs
  Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
*/
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createClient } from "@supabase/supabase-js";
import pkg from "@tonejs/midi";

const { Midi } = pkg;
const root = dirname(dirname(fileURLToPath(import.meta.url)));

// ── load env from .env.local ────────────────────────────────────────────────
function loadEnv() {
  const txt = readFileSync(join(root, ".env.local"), "utf8");
  const env = {};
  for (const line of txt.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
const env = loadEnv();
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// ── parse helpers (mirror src/lib/midi.ts) ──────────────────────────────────
function deriveDifficulty(noteCount, durationSec, span, trackCount) {
  if (!noteCount || !durationSec) return 1;
  const density = Math.min(noteCount / durationSec / 8, 1);
  const spanScore = Math.min(span / 48, 1);
  const poly = Math.min(trackCount / 4, 1);
  const raw = density * 0.55 + spanScore * 0.3 + poly * 0.15;
  return Math.max(1, Math.min(5, Math.round(raw * 4) + 1));
}
function deriveColor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  const warm = 15 + (h % 45);
  const hue = h % 7 === 0 ? 200 + (h % 40) : warm;
  return `hsl(${hue} 55% 60%)`;
}
function parse(buf, title) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const midi = new Midi(ab);
  let notes = 0, lo = Infinity, hi = -Infinity;
  for (const t of midi.tracks)
    for (const n of t.notes) {
      notes++;
      lo = Math.min(lo, n.midi);
      hi = Math.max(hi, n.midi);
    }
  const ts = midi.header.timeSignatures[0];
  const ks = midi.header.keySignatures[0];
  const tracks = midi.tracks.filter((t) => t.notes.length).length || 1;
  return {
    duration_sec: Number(midi.duration.toFixed(2)),
    tempo_bpm: midi.header.tempos[0] ? Math.round(midi.header.tempos[0].bpm) : null,
    key_sig: ks ? `${ks.key}${ks.scale ? " " + ks.scale : ""}` : null,
    time_sig: ts ? `${ts.timeSignature[0]}/${ts.timeSignature[1]}` : null,
    track_count: tracks,
    note_count: notes,
    lowest_note: notes ? lo : null,
    highest_note: notes ? hi : null,
    difficulty: deriveDifficulty(notes, midi.duration, notes ? hi - lo : 0, tracks),
    color: deriveColor(title + notes + midi.duration),
  };
}

function titleCase(name) {
  return name
    .replace(/\.mid$/i, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Mock practice metadata so the library looks used. Keyed by filename stem.
const MOCK = {
  "beethoven-fur-elise": { is_favorite: true, play_count: 14, days_ago: 1 },
  "twinkle-twinkle": { is_favorite: false, play_count: 6, days_ago: 4 },
  "c-major-scale": { is_favorite: true, play_count: 23, days_ago: 0 },
};

async function main() {
  const samplesDir = join(root, "public", "samples");
  const files = readdirSync(samplesDir).filter((f) => f.endsWith(".mid"));

  // Wipe existing rows + blobs so seeding is idempotent.
  const { data: existing } = await supabase.from("transcriptions").select("file_path");
  if (existing?.length) {
    await supabase.storage.from("midi").remove(existing.map((r) => r.file_path));
    await supabase.from("transcriptions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    console.log(`Cleared ${existing.length} existing rows.`);
  }

  for (const file of files) {
    const stem = file.replace(/\.mid$/i, "");
    const buf = readFileSync(join(samplesDir, file));
    const title = titleCase(file);
    const parsed = parse(buf, title);
    const path = `seed-${stem}.mid`;

    const up = await supabase.storage.from("midi").upload(path, buf, {
      contentType: "audio/midi",
      upsert: true,
    });
    if (up.error) throw up.error;

    const mock = MOCK[stem] ?? { is_favorite: false, play_count: 0, days_ago: null };
    const lastPlayed =
      mock.days_ago === null
        ? null
        : new Date(Date.now() - mock.days_ago * 86400000).toISOString();

    const { error } = await supabase.from("transcriptions").insert({
      title,
      file_path: path,
      file_size: buf.byteLength,
      ...parsed,
      is_favorite: mock.is_favorite,
      play_count: mock.play_count,
      last_played_at: lastPlayed,
    });
    if (error) throw error;
    console.log(
      `Seeded "${title}" — ${parsed.note_count} notes, ${parsed.tempo_bpm ?? "?"} BPM, difficulty ${parsed.difficulty}`,
    );
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
