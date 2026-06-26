"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Transcription } from "@/lib/types";
import { formatDuration, relativeTime, hexToRgba } from "@/lib/format";

interface SongCardProps {
  song: Transcription;
  onFavoriteToggle?: (updated: Transcription) => void;
  onDelete?: (id: string) => void;
  /** Stagger entrance delay in ms */
  entranceDelay?: number;
}

/** Five-dot difficulty indicator */
function DifficultyDots({ level }: { level: number }) {
  return (
    <span
      className="flex items-center gap-0.5"
      aria-label={`Difficulty ${level} of 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={`inline-block h-1.5 w-1.5 rounded-full transition-colors ${
            i < level ? "bg-amber-400" : "bg-neutral-700"
          }`}
        />
      ))}
    </span>
  );
}

export default function SongCard({
  song,
  onFavoriteToggle,
  onDelete,
  entranceDelay = 0,
}: SongCardProps) {
  const [isFav, setIsFav] = useState(song.is_favorite);
  const [favLoading, setFavLoading] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [visible, setVisible] = useState(entranceDelay === 0);

  // Staggered entrance — delay → opacity 0→1 + slight Y translate
  useEffect(() => {
    if (entranceDelay === 0) {
      setVisible(true);
      return;
    }
    const t = setTimeout(() => setVisible(true), entranceDelay);
    return () => clearTimeout(t);
  }, [entranceDelay]);

  const accentColor = song.color ?? "#caa46a";

  const cardStyle: React.CSSProperties = {
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(6px)",
    transition: "opacity 0.3s ease, transform 0.3s ease",
  };

  async function toggleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
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
      const updated: Transcription = await res.json();
      onFavoriteToggle?.(updated);
    } catch {
      setIsFav(!next); // revert
    } finally {
      setFavLoading(false);
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/transcriptions/${song.id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) throw new Error("delete failed");
      onDelete?.(song.id);
    } catch {
      setDeleting(false);
      setShowDelete(false);
    }
  }

  const duration = formatDuration(song.duration_sec);

  return (
    <article
      className="group relative flex flex-col rounded-xl overflow-hidden border border-neutral-800/60 bg-neutral-900/70 backdrop-blur-sm
        hover:-translate-y-0.5 hover:border-neutral-700/80 transition-[transform,border-color,box-shadow] duration-300 ease-out"
      style={{
        ...cardStyle,
        // Hover glow is applied via box-shadow — we set it as a CSS var trick via style
      }}
      onMouseLeave={() => setShowDelete(false)}
    >
      {/* Per-song accent stripe on the left edge */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl group-hover:w-[4px] transition-all duration-300"
        style={{ backgroundColor: accentColor, opacity: 0.8 }}
        aria-hidden
      />

      {/* Hover glow ring — inline so it can use the per-song color */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          boxShadow: `inset 0 0 0 1px ${hexToRgba(accentColor, 0.25)}, 0 4px 20px ${hexToRgba(accentColor, 0.07)}`,
        }}
        aria-hidden
      />

      {/* Card content — full-area link for navigation */}
      <Link
        href={`/song/${song.id}`}
        className="flex flex-col gap-3 pl-5 pr-4 pt-4 pb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 rounded-xl"
      >
        {/* Title row + action buttons */}
        <div className="flex items-start justify-between gap-2">
          <h2
            className="font-serif text-base font-medium leading-snug text-neutral-100 group-hover:text-white transition-colors line-clamp-2"
            title={song.title}
          >
            {song.title}
          </h2>

          {/* Actions — stop propagation so they don't navigate */}
          <div
            className="flex items-center gap-1 shrink-0"
            onClick={(e) => e.preventDefault()}
          >
            {/* Favorite star */}
            <button
              type="button"
              onClick={toggleFavorite}
              disabled={favLoading}
              aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
              className={`p-1 rounded-md transition-all duration-200 hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400 ${
                isFav
                  ? "text-amber-400"
                  : "text-neutral-600 hover:text-neutral-400"
              } ${favLoading ? "opacity-50 cursor-wait" : ""}`}
            >
              <svg
                viewBox="0 0 20 20"
                fill={isFav ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={1.5}
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
                />
              </svg>
            </button>

            {/* Delete — shows on hover, confirms inline */}
            {!showDelete ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowDelete(true);
                }}
                aria-label="Delete song"
                className="p-1 rounded-md text-neutral-700 hover:text-red-400/80 transition-colors duration-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400 opacity-0 group-hover:opacity-100"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  className="h-3.5 w-3.5"
                >
                  <path
                    strokeLinecap="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                aria-label="Confirm delete"
                className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-900/60 text-red-300 hover:bg-red-800/80 transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400 whitespace-nowrap"
              >
                {deleting ? "…" : "Delete?"}
              </button>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
          <span className="font-mono text-neutral-400 tabular-nums">
            {duration}
          </span>
          <span>{song.key_sig ?? "—"}</span>
          <span>
            {song.tempo_bpm != null ? `${song.tempo_bpm} BPM` : "—"}
          </span>
          <DifficultyDots level={song.difficulty} />
        </div>

        {/* Note count + last practiced */}
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span className="font-mono">{song.note_count.toLocaleString()} notes</span>
          {song.last_played_at && (
            <span className="text-neutral-500">
              {relativeTime(song.last_played_at)}
            </span>
          )}
        </div>
      </Link>
    </article>
  );
}
