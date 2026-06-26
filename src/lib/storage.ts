import { createAdminClient } from "@/utils/supabase/server";
import type { ParsedMidi, SortKey, Transcription } from "./types";

/**
 * Storage boundary for the catalogue. Everything that reads or writes a
 * transcription goes through here, so the rest of the app never imports Supabase
 * directly and the backend stays swappable.
 */

const BUCKET = "midi";

export interface ListOptions {
  search?: string;
  sort?: SortKey;
  favoritesOnly?: boolean;
  key?: string; // filter by key signature
}

export interface CreateInput {
  title: string;
  fileBytes: Buffer;
  fileSize: number;
  parsed: ParsedMidi;
}

function applySort<T extends Transcription>(rows: T[], sort: SortKey): T[] {
  const by = [...rows];
  switch (sort) {
    case "title":
      return by.sort((a, b) => a.title.localeCompare(b.title));
    case "difficulty":
      return by.sort((a, b) => b.difficulty - a.difficulty);
    case "duration":
      return by.sort((a, b) => b.duration_sec - a.duration_sec);
    case "played":
      return by.sort(
        (a, b) =>
          new Date(b.last_played_at ?? 0).getTime() -
          new Date(a.last_played_at ?? 0).getTime(),
      );
    case "recent":
    default:
      return by.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
  }
}

/** List the catalogue with optional search / filter / sort applied. */
export async function listTranscriptions(
  opts: ListOptions = {},
): Promise<Transcription[]> {
  const supabase = createAdminClient();
  let query = supabase.from("transcriptions").select("*");

  if (opts.favoritesOnly) query = query.eq("is_favorite", true);
  if (opts.key) query = query.eq("key_sig", opts.key);
  if (opts.search) query = query.ilike("title", `%${opts.search}%`);

  const { data, error } = await query;
  if (error) throw new Error(`listTranscriptions: ${error.message}`);

  return applySort((data ?? []) as Transcription[], opts.sort ?? "recent");
}

/** Fetch one transcription by id, or null if it doesn't exist. */
export async function getTranscription(
  id: string,
): Promise<Transcription | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("transcriptions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getTranscription: ${error.message}`);
  return (data as Transcription) ?? null;
}

/** Upload the .mid blob + insert its metadata row. Returns the created row. */
export async function createTranscription(
  input: CreateInput,
): Promise<Transcription> {
  const supabase = createAdminClient();
  // Cap the slug so the storage key stays well under the 1024-char limit even
  // for an absurdly long title (the full title still lives in the DB column).
  const safe = input.title
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .toLowerCase()
    .slice(0, 80);
  const path = `${Date.now()}-${safe}.mid`;

  const upload = await supabase.storage
    .from(BUCKET)
    .upload(path, input.fileBytes, {
      contentType: "audio/midi",
      upsert: false,
    });
  if (upload.error) throw new Error(`upload: ${upload.error.message}`);

  const { parsed } = input;
  const { data, error } = await supabase
    .from("transcriptions")
    .insert({
      title: input.title,
      file_path: path,
      file_size: input.fileSize,
      duration_sec: parsed.duration_sec,
      tempo_bpm: parsed.tempo_bpm,
      key_sig: parsed.key_sig,
      time_sig: parsed.time_sig,
      track_count: parsed.track_count,
      note_count: parsed.note_count,
      lowest_note: parsed.lowest_note,
      highest_note: parsed.highest_note,
      difficulty: parsed.difficulty,
      color: parsed.color,
    })
    .select("*")
    .single();

  if (error) {
    // Roll back the orphaned blob so storage and DB stay consistent.
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(`createTranscription: ${error.message}`);
  }
  return data as Transcription;
}

/** Patch mutable fields (favorite toggle, practice bumps). */
export async function updateTranscription(
  id: string,
  patch: Partial<
    Pick<Transcription, "is_favorite" | "title" | "last_played_at" | "play_count">
  >,
): Promise<Transcription> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("transcriptions")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateTranscription: ${error.message}`);
  return data as Transcription;
}

/** Record a practice play: atomically bump count + stamp last_played_at. */
export async function recordPlay(id: string): Promise<Transcription> {
  const supabase = createAdminClient();
  // Atomic increment via RPC (see migration 0002) — no read-then-write race.
  const { data, error } = await supabase.rpc("record_play", { p_id: id });
  if (error) throw new Error(`recordPlay: ${error.message}`);
  if (!data) throw new Error("recordPlay: not found");
  // rpc returns the row (single record).
  return (Array.isArray(data) ? data[0] : data) as Transcription;
}

/** Delete the row and its blob. */
export async function deleteTranscription(id: string): Promise<void> {
  const supabase = createAdminClient();
  const row = await getTranscription(id);
  if (!row) return;
  // Delete the row first — it's the source of truth. If the blob removal then
  // fails we're left with a harmless orphaned file, never a row that points at
  // a missing blob (which would 404 the detail view).
  const { error } = await supabase.from("transcriptions").delete().eq("id", id);
  if (error) throw new Error(`deleteTranscription: ${error.message}`);
  await supabase.storage.from(BUCKET).remove([row.file_path]);
}

/** Public URL for streaming a stored .mid (bucket is public). */
export function publicMidiUrl(filePath: string): string {
  const supabase = createAdminClient();
  return supabase.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl;
}
