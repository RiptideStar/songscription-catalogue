"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Transcription } from "@/lib/types";
import { formatDuration, relativeTime, midiNoteName } from "@/lib/format";
import { useMidiNotes } from "./useMidiNotes";
import PianoRoll from "./PianoRoll";
import PlaybackBar from "./PlaybackBar";
import PracticePlaceholder from "./PracticePlaceholder";

interface SongDetailProps {
  song: Transcription;
  midiUrl: string;
}

/** Five-dot difficulty indicator */
function DifficultyDots({ level }: { level: number }) {
  return (
    <span
      className="flex items-center gap-1"
      aria-label={`Difficulty ${level} of 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={`inline-block h-2 w-2 rounded-full transition-colors ${
            i < level ? "bg-amber-400" : "bg-neutral-700"
          }`}
        />
      ))}
    </span>
  );
}

/** A single labelled metadata field */
function MetaField({
  label,
  value,
}: {
  label: string;
  value: string | React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-widest text-neutral-600 font-sans">
        {label}
      </span>
      <span className="text-sm text-neutral-300 font-sans">{value ?? "—"}</span>
    </div>
  );
}

export default function SongDetail({ song, midiUrl }: SongDetailProps) {
  const router = useRouter();
  const { notes, loading, error } = useMidiNotes(midiUrl);

  const [isFav, setIsFav] = useState(song.is_favorite);
  const [favLoading, setFavLoading] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [playProgress, setPlayProgress] = useState(0);

  const accentColor = song.color ?? "#caa46a";

  // ── Favorite toggle ──────────────────────────────────────────────────────
  async function toggleFavorite() {
    if (favLoading) return;
    setFavLoading(true);
    const next = !isFav;
    setIsFav(next); // optimistic
    try {
      const res = await fetch(`/api/transcriptions/${song.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: next }),
      });
      if (!res.ok) throw new Error("patch failed");
    } catch {
      setIsFav(!next); // revert
    } finally {
      setFavLoading(false);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/transcriptions/${song.id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) throw new Error("delete failed");
      router.push("/");
    } catch {
      setDeleting(false);
      setShowDelete(false);
    }
  }

  // ── First-play callback: POST to record a play ───────────────────────────
  const handleFirstPlay = useCallback(async () => {
    try {
      await fetch(`/api/transcriptions/${song.id}/play`, { method: "POST" });
    } catch {
      // non-critical — don't surface to user
    }
  }, [song.id]);

  // ── Derived metadata ─────────────────────────────────────────────────────
  const pitchRange =
    song.lowest_note != null && song.highest_note != null
      ? `${midiNoteName(song.lowest_note)} – ${midiNoteName(song.highest_note)}`
      : null;

  const fileSizeLabel =
    song.file_size < 1024
      ? `${song.file_size} B`
      : song.file_size < 1024 * 1024
      ? `${(song.file_size / 1024).toFixed(1)} KB`
      : `${(song.file_size / (1024 * 1024)).toFixed(2)} MB`;

  return (
    <article className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="space-y-3">
        {/* Accent line */}
        <div
          className="h-0.5 w-12 rounded-full"
          style={{ backgroundColor: accentColor }}
          aria-hidden
        />

        <div className="flex items-start justify-between gap-4">
          <h1
            className="font-serif text-3xl font-semibold leading-tight text-neutral-100 sm:text-4xl"
            style={{ textShadow: `0 0 32px ${accentColor}22` }}
          >
            {song.title}
          </h1>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0 pt-1">
            {/* Favorite */}
            <button
              type="button"
              onClick={toggleFavorite}
              disabled={favLoading}
              aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
              className={`p-2 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60
                ${isFav ? "text-amber-400" : "text-neutral-600 hover:text-neutral-400"}
                ${favLoading ? "opacity-50" : ""}`}
            >
              <svg
                viewBox="0 0 20 20"
                fill={isFav ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={1.5}
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
                />
              </svg>
            </button>

            {/* Delete */}
            {!showDelete ? (
              <button
                type="button"
                onClick={() => setShowDelete(true)}
                aria-label="Delete song"
                className="p-2 rounded-lg text-neutral-700 hover:text-red-400 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="h-5 w-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                  />
                </svg>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDelete(false)}
                  className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1 rounded text-xs font-medium bg-red-900/70 text-red-300 hover:bg-red-800 transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400"
                >
                  {deleting ? "Deleting…" : "Confirm delete"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick stats bar */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-neutral-500">
          <span className="font-mono tabular-nums text-neutral-400">
            {formatDuration(song.duration_sec)}
          </span>
          {song.key_sig && <span>{song.key_sig}</span>}
          {song.tempo_bpm != null && <span>{song.tempo_bpm} BPM</span>}
          <DifficultyDots level={song.difficulty} />
          {song.play_count > 0 && (
            <span className="text-neutral-600">
              {song.play_count} play{song.play_count !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </header>

      {/* ── Piano Roll ──────────────────────────────────────────────────── */}
      <section aria-label="Piano roll">
        <h2 className="mb-3 text-xs uppercase tracking-widest text-neutral-600 font-sans">
          Piano Roll
        </h2>
        {loading && (
          <div className="flex items-center justify-center h-28 rounded-lg bg-neutral-900/60 border border-neutral-800/40">
            <span className="text-xs text-neutral-600 animate-pulse">
              Loading MIDI…
            </span>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-20 rounded-lg bg-red-950/30 border border-red-900/30 text-xs text-red-400">
            Could not load MIDI: {error}
          </div>
        )}
        {!loading && !error && (
          <PianoRoll
            notes={notes}
            color={accentColor}
            progress={playProgress}
          />
        )}
      </section>

      {/* ── Playback ────────────────────────────────────────────────────── */}
      <section aria-label="Playback controls">
        <h2 className="mb-3 text-xs uppercase tracking-widest text-neutral-600 font-sans">
          Playback
        </h2>
        <PlaybackBar
          notes={notes}
          onProgress={setPlayProgress}
          onFirstPlay={handleFirstPlay}
        />
      </section>

      {/* ── Metadata grid ───────────────────────────────────────────────── */}
      <section aria-label="Song metadata">
        <h2 className="mb-4 text-xs uppercase tracking-widest text-neutral-600 font-sans">
          Details
        </h2>
        <div
          className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-xl border border-neutral-800/60 bg-neutral-900/50 p-5 sm:grid-cols-3"
        >
          <MetaField label="Duration" value={formatDuration(song.duration_sec)} />
          <MetaField label="Tempo" value={song.tempo_bpm != null ? `${song.tempo_bpm} BPM` : null} />
          <MetaField label="Key" value={song.key_sig} />
          <MetaField label="Time sig." value={song.time_sig} />
          <MetaField label="Tracks" value={String(song.track_count)} />
          <MetaField label="Notes" value={song.note_count.toLocaleString()} />
          <MetaField label="Pitch range" value={pitchRange} />
          <MetaField
            label="Difficulty"
            value={<DifficultyDots level={song.difficulty} />}
          />
          <MetaField label="File size" value={fileSizeLabel} />
          <MetaField
            label="Added"
            value={relativeTime(song.created_at)}
          />
          <MetaField
            label="Play count"
            value={String(song.play_count)}
          />
          <MetaField
            label="Last practiced"
            value={song.last_played_at ? relativeTime(song.last_played_at) : "Never"}
          />
        </div>
      </section>

      {/* ── Practice placeholder ────────────────────────────────────────── */}
      <section aria-label="Practice mode">
        <h2 className="mb-3 text-xs uppercase tracking-widest text-neutral-600 font-sans">
          Practice
        </h2>
        <PracticePlaceholder />
      </section>
    </article>
  );
}
