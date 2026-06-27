"use client";

import { useState, useCallback } from "react";
import type { Transcription, SortKey } from "@/lib/types";
import { UploadDropzone } from "@/components/upload/UploadDropzone";
import { formatDuration, relativeTime, hexToRgba } from "@/lib/format";

// ─── Props ────────────────────────────────────────────────────────────────────

interface SongListProps {
  songs: Transcription[];
  totalCount: number;
  activeId: string | null;
  /** The committed (clicked-into-practice) song, if any. */
  committedId: string | null;
  query: string;
  sort: SortKey;
  favOnly: boolean;
  onQueryChange: (q: string) => void;
  onSortChange: (s: SortKey) => void;
  onFavOnlyChange: (v: boolean) => void;
  onSurprise: () => void;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onUploaded: (row: Transcription) => void;
  onUpdate: (updated: Transcription) => void;
  onDelete: (id: string) => void;
}

// ─── Difficulty dots ──────────────────────────────────────────────────────────

function DifficultyDots({ level }: { level: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`Difficulty ${level} of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={[
            "inline-block w-1.5 h-1.5 rounded-full",
            i < level ? "bg-amber-400" : "bg-white/10",
          ].join(" ")}
        />
      ))}
    </span>
  );
}

// ─── Song panel ───────────────────────────────────────────────────────────────

interface SongPanelProps {
  song: Transcription;
  isActive: boolean;
  isCommitted: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onUpdate: (updated: Transcription) => void;
  onDelete: (id: string) => void;
}

function SongPanel({
  song,
  isActive,
  isCommitted,
  onHover,
  onSelect,
  onUpdate,
  onDelete,
}: SongPanelProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [favPending, setFavPending] = useState(false);

  // Optimistic favorite toggle
  const handleFavClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (favPending) return;
      const next = !song.is_favorite;
      setFavPending(true);
      try {
        const res = await fetch(`/api/transcriptions/${song.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_favorite: next }),
        });
        if (res.ok) {
          const updated = (await res.json()) as Transcription;
          onUpdate(updated);
        }
      } finally {
        setFavPending(false);
      }
    },
    [song.id, song.is_favorite, favPending, onUpdate],
  );

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(true);
  }, []);

  const handleDeleteConfirm = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const res = await fetch(`/api/transcriptions/${song.id}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        onDelete(song.id);
      }
      setConfirmDelete(false);
    },
    [song.id, onDelete],
  );

  const handleDeleteCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
  }, []);

  // Whether to reveal the "→ practice" affordance: on hover-preview, not once
  // the song is already committed (practicing).
  const showPractice = isActive && !isCommitted;

  // Panel style: osu!-style pop-out when active. The pop is a touch more
  // significant than a plain hover so committing-by-click feels intentional.
  const panelStyle: React.CSSProperties = isActive
    ? {
        transform: "translateX(-10px) scale(1.025)",
        boxShadow: `0 0 0 1px ${hexToRgba(song.color, 0.6)}, 0 6px 26px ${hexToRgba(song.color, 0.32)}`,
        backgroundColor: "rgba(31, 26, 20, 0.95)",
      }
    : {};

  const accentBarStyle: React.CSSProperties = {
    backgroundColor: song.color,
    width: isActive ? "4px" : "3px",
    opacity: isActive ? 1 : 0.6,
  };

  return (
    <li className="group/panel">
      {/* The panel is a div-as-button (not a <button>) so the favorite/delete
          buttons can legally nest inside it — nested <button> is invalid HTML
          and triggers a hydration error. We restore button semantics with
          role/tabIndex + an Enter/Space key handler. */}
      <div
        role="button"
        tabIndex={0}
        className={[
          "relative w-full text-left flex items-stretch gap-0 cursor-pointer",
          "rounded-lg overflow-hidden transition-all duration-200 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
          isActive
            ? "bg-[#1f1a14]"
            : "bg-[#1a1610]/60 hover:bg-[#1f1a14]/80",
        ].join(" ")}
        style={panelStyle}
        onClick={() => onSelect(song.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(song.id);
          }
        }}
        onPointerEnter={() => onHover(song.id)}
        // Keyboard nav previews the focused song too, so the practice arrow and
        // hero preview behave the same whether you mouse or tab.
        onFocus={() => onHover(song.id)}
        aria-pressed={isActive}
        aria-label={`${song.title}${isActive ? ", currently selected" : ""}${isCommitted ? ", practicing" : ""}`}
      >
        {/* Left accent bar */}
        <span
          className="shrink-0 self-stretch transition-all duration-200"
          style={accentBarStyle}
          aria-hidden
        />

        {/* Practice affordance — a full-height accent-colored panel pinned to
            the row's right edge, with the arrow centered in it. It slides up +
            fades in as the row grows on hover. Reads as "click → practice".
            Hidden once the song is committed (practicing). */}
        <span
          className={[
            "pointer-events-none absolute inset-y-0 right-0 z-10 flex w-14 items-center justify-center",
            "transition-all duration-200 ease-out",
            showPractice
              ? "translate-y-0 opacity-100"
              : "translate-y-4 opacity-0",
          ].join(" ")}
          style={{
            backgroundColor: song.color,
            boxShadow: `-8px 0 20px ${hexToRgba(song.color, 0.35)}`,
          }}
          aria-hidden
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1a1610"
            strokeWidth={2.5}
            className="h-5 w-5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h13m0 0l-5-5m5 5l-5 5" />
          </svg>
        </span>

        {/* Panel body — grows a little taller on hover to make room for the
            arrow rising up from beneath. */}
        <span
          className={[
            "flex-1 min-w-0 flex flex-col gap-1 pl-3 transition-all duration-200 ease-out",
            showPractice ? "py-3.5 pr-[4.25rem]" : "py-2.5 pr-3",
          ].join(" ")}
        >
          {/* Title row */}
          <span className="flex items-start justify-between gap-2">
            <span
              className={[
                "font-serif text-sm leading-snug line-clamp-2 transition-colors duration-150",
                isActive ? "text-[#ece4d3]" : "text-[#a89e8c] group-hover/panel:text-[#ece4d3]",
              ].join(" ")}
            >
              {song.title}
            </span>

            {/* Favorite star */}
            <button
              type="button"
              onClick={handleFavClick}
              disabled={favPending}
              aria-label={song.is_favorite ? "Remove from favorites" : "Add to favorites"}
              aria-pressed={song.is_favorite}
              className={[
                "shrink-0 mt-0.5 transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 rounded",
                song.is_favorite
                  ? "text-amber-400 opacity-100"
                  : "text-white/20 opacity-0 group-hover/panel:opacity-100 hover:text-amber-400/70",
              ].join(" ")}
            >
              <svg
                viewBox="0 0 20 20"
                fill={song.is_favorite ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={song.is_favorite ? 0 : 1.5}
                className="w-3.5 h-3.5"
                aria-hidden
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </button>
          </span>

          {/* Stats row */}
          <span className="flex items-center gap-2 flex-wrap">
            {/* Duration */}
            <span className="font-mono text-[11px] tabular-nums text-[#a89e8c]">
              {formatDuration(song.duration_sec)}
            </span>

            {/* Key sig */}
            {song.key_sig && (
              <>
                <span className="text-white/15 text-[10px]">·</span>
                <span className="font-mono text-[11px] tabular-nums text-[#a89e8c]">
                  {song.key_sig}
                </span>
              </>
            )}

            {/* BPM */}
            {song.tempo_bpm !== null && (
              <>
                <span className="text-white/15 text-[10px]">·</span>
                <span className="font-mono text-[11px] tabular-nums text-[#a89e8c]">
                  {song.tempo_bpm} BPM
                </span>
              </>
            )}

            {/* Difficulty */}
            <span className="ml-auto">
              <DifficultyDots level={song.difficulty} />
            </span>
          </span>

          {/* Committed (practicing) indicator + delete */}
          <span className="flex items-center justify-between min-h-[14px]">
            {isCommitted ? (
              <span className="text-[10px] text-amber-400/80 font-mono tracking-wide">
                ▶ practicing
              </span>
            ) : (
              <span className="text-[10px] text-[#a89e8c]/50 font-mono">
                {relativeTime(song.created_at)}
              </span>
            )}

            {/* Delete affordance — appears on hover */}
            {!confirmDelete ? (
              <button
                type="button"
                onClick={handleDeleteClick}
                className={[
                  "text-white/20 hover:text-red-400 transition-colors duration-150",
                  "opacity-0 group-hover/panel:opacity-100",
                  "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400/50 rounded",
                ].join(" ")}
                aria-label={`Delete ${song.title}`}
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3" aria-hidden>
                  <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 1.16l.337 9.383A1.5 1.5 0 0 0 4.334 14.5h7.332a1.5 1.5 0 0 0 1.501-1.457l.337-9.383a.58.58 0 0 0-.01-1.16H11Z" />
                </svg>
              </button>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="text-[10px] text-red-400/90 font-mono">Delete?</span>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  className="text-[10px] text-red-400 hover:text-red-300 font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400/50 rounded"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={handleDeleteCancel}
                  className="text-[10px] text-[#a89e8c] hover:text-[#ece4d3] font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/50 rounded"
                >
                  No
                </button>
              </span>
            )}
          </span>
        </span>
      </div>
    </li>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SongList({
  songs,
  totalCount,
  activeId,
  committedId,
  query,
  sort,
  favOnly,
  onQueryChange,
  onSortChange,
  onFavOnlyChange,
  onSurprise,
  onHover,
  onSelect,
  onUploaded,
  onUpdate,
  onDelete,
}: SongListProps) {
  const isFiltered = songs.length !== totalCount;
  const isEmpty = totalCount === 0;
  const isFilteredEmpty = !isEmpty && songs.length === 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="font-serif text-[15px] text-[#ece4d3] tracking-tight">Library</h2>
        <span className="font-mono text-[11px] tabular-nums text-[#a89e8c]">
          {songs.length}
          {isFiltered && (
            <span className="text-[#a89e8c]/60"> of {totalCount}</span>
          )}
        </span>
      </div>

      {/* ── Upload dropzone ── */}
      <div className="shrink-0 px-3 pb-2">
        <UploadDropzone onUploaded={onUploaded} compact />
      </div>

      {/* ── Search ── */}
      <div className="shrink-0 px-3 pb-2">
        <div className="relative">
          {/* Search icon */}
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#a89e8c]/60 pointer-events-none" aria-hidden>
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
            </svg>
          </span>

          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search songs…"
            className={[
              "w-full bg-[#1a1610] border border-[#2c251c] rounded-lg",
              "pl-8 pr-8 py-1.5 text-sm text-[#ece4d3] placeholder:text-[#a89e8c]/40",
              "transition-all duration-150",
              "focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30",
            ].join(" ")}
          />

          {/* Clear button */}
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#a89e8c]/60 hover:text-[#ece4d3] transition-colors"
              aria-label="Clear search"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden>
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Controls row ── */}
      <div className="shrink-0 px-3 pb-3 flex items-center gap-2">
        {/* Sort select */}
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          className={[
            "flex-1 min-w-0 bg-[#1a1610] border border-[#2c251c] rounded-lg",
            "px-2.5 py-1.5 text-xs text-[#a89e8c]",
            "focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30",
            "transition-all duration-150 cursor-pointer",
          ].join(" ")}
          aria-label="Sort songs"
        >
          <option value="recent">Recent</option>
          <option value="title">Title</option>
          <option value="difficulty">Difficulty</option>
          <option value="duration">Duration</option>
          <option value="played">Most Played</option>
        </select>

        {/* Favorites toggle */}
        <button
          type="button"
          onClick={() => onFavOnlyChange(!favOnly)}
          aria-pressed={favOnly}
          aria-label="Show favorites only"
          className={[
            "shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono",
            "border transition-all duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
            favOnly
              ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
              : "bg-[#1a1610] border-[#2c251c] text-[#a89e8c] hover:border-amber-500/30 hover:text-amber-400/70",
          ].join(" ")}
        >
          <svg viewBox="0 0 20 20" fill={favOnly ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} className="w-3 h-3" aria-hidden>
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          Favs
        </button>

        {/* Surprise me */}
        <button
          type="button"
          onClick={onSurprise}
          aria-label="Surprise me — pick a random song"
          className={[
            "shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono",
            "bg-[#1a1610] border border-[#2c251c] text-[#a89e8c]",
            "hover:border-amber-500/30 hover:text-amber-400/70",
            "transition-all duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
          ].join(" ")}
        >
          {/* Dice icon */}
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3" aria-hidden>
            <path d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5zm1.5 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5-5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5-5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
          </svg>
          Roll
        </button>
      </div>

      {/* ── Song list / empty states ── */}
      {isEmpty ? (
        /* Empty library — upload is the hero */
        <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4 text-center">
          <p className="text-sm text-[#a89e8c] leading-relaxed">
            Your library is empty. Upload a .mid to begin.
          </p>
        </div>
      ) : isFilteredEmpty ? (
        /* Has songs but filters return nothing */
        <div className="flex-1 flex flex-col items-center justify-center px-4 gap-3 text-center">
          <p className="text-sm text-[#a89e8c]">No songs match.</p>
          <button
            type="button"
            onClick={() => {
              onQueryChange("");
              onFavOnlyChange(false);
            }}
            className={[
              "text-xs text-amber-400/80 hover:text-amber-400 font-mono",
              "border border-amber-500/30 hover:border-amber-500/60 rounded-lg px-3 py-1.5",
              "transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
            ].join(" ")}
          >
            Clear filters
          </button>
        </div>
      ) : (
        /* Scrolling song list */
        <ul
          // overflow-y-auto forces horizontal clipping too, so pad the left
          // generously to give a hovered row room to pop out (translateX)
          // without being clipped at the list's edge.
          className="flex-1 overflow-y-auto flex flex-col gap-1 pl-5 pr-2 pb-4"
          onPointerLeave={() => onHover(null)}
          aria-label="Song library"
        >
          {songs.map((song) => (
            <SongPanel
              key={song.id}
              song={song}
              isActive={song.id === activeId}
              isCommitted={song.id === committedId}
              onHover={onHover}
              onSelect={onSelect}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
