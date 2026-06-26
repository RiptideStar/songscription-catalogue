/** A transcribed song in the user's catalogue. Mirrors the DB row exactly. */
export interface Transcription {
  id: string;
  title: string;
  created_at: string;

  // storage
  file_path: string;
  file_size: number;

  // parsed MIDI metadata
  duration_sec: number;
  tempo_bpm: number | null;
  key_sig: string | null;
  time_sig: string | null;
  track_count: number;
  note_count: number;
  lowest_note: number | null;
  highest_note: number | null;
  difficulty: number; // 1–5

  // presentation
  color: string;

  // learner / practice metadata
  is_favorite: boolean;
  last_played_at: string | null;
  play_count: number;
}

/** Parsed MIDI facts produced at upload time, before we know the row id. */
export interface ParsedMidi {
  duration_sec: number;
  tempo_bpm: number | null;
  key_sig: string | null;
  time_sig: string | null;
  track_count: number;
  note_count: number;
  lowest_note: number | null;
  highest_note: number | null;
  difficulty: number;
  color: string;
  /** Note events for the piano-roll preview. */
  notes: PreviewNote[];
}

/** A single note for the piano-roll preview (compact, JSON-serialisable). */
export interface PreviewNote {
  midi: number; // MIDI note number
  time: number; // seconds from start
  duration: number; // seconds
  velocity: number; // 0–1
}

export type SortKey = "recent" | "title" | "difficulty" | "duration" | "played";
