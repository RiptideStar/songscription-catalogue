"use client";

/**
 * CatalogueShell — the single-surface, osu!-style catalogue.
 *
 * Layout: a left HERO that previews the active song (scrolling piano-roll +
 * transport, dominant visual hierarchy) and a right SONG LIST (osu! song-select)
 * pinned to the edge.
 *
 * Interaction model:
 *   - No deep link               → the hero shows the welcome state.
 *   - HOVER a song in the list   → it becomes the *preview* (auto-loops in hero).
 *   - CLICK a song               → it *commits* (selected) → Practice mode.
 *   - Mouse leaves the list      → preview falls back to the selected song, if any.
 *
 * The "active" song shown in the hero is: hovered ?? selected ?? null.
 * Selection is deep-linked via ?song=<id> so refresh/share is stable.
 *
 * This component owns song-list state (uploads/favorite/delete) and selection;
 * child components (SongList, Hero) are presentational + emit events up.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Transcription, SortKey } from "@/lib/types";
import { formatDuration, hexToRgba } from "@/lib/format";
import SongList from "./SongList";
import Hero from "../player/Hero";

/**
 * CollapsedPracticeCard — fills the entire right side with just the committed
 * (practicing) song while the pointer is away. Echoes the song row's accent
 * styling at full-panel scale. Moving the pointer over the aside re-opens the
 * full library (handled by the parent), so this is purely presentational.
 */
function CollapsedPracticeCard({ song }: { song: Transcription }) {
  return (
    <div
      className="flex h-full w-full flex-col justify-between p-6"
      style={{
        background: `linear-gradient(160deg, ${hexToRgba(song.color, 0.18)} 0%, rgba(26,22,16,0.6) 55%)`,
      }}
      aria-label={`Practicing ${song.title}`}
    >
      {/* Accent rail + practicing badge */}
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: song.color, boxShadow: `0 0 10px ${song.color}` }}
          aria-hidden
        />
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-amber-400/80">
          Practicing
        </span>
      </div>

      {/* Title + stats, vertically centered for emphasis */}
      <div className="flex flex-1 flex-col justify-center">
        <h2
          className="font-serif text-3xl font-light leading-tight text-ivory"
          style={{ textShadow: `0 0 28px ${hexToRgba(song.color, 0.4)}` }}
        >
          {song.title}
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-ivory-dim/60">
          <span className="tabular-nums">{formatDuration(song.duration_sec)}</span>
          {song.key_sig && <span className="text-ivory-dim/45">{song.key_sig}</span>}
          {song.tempo_bpm !== null && (
            <span className="tabular-nums text-ivory-dim/45">{song.tempo_bpm} BPM</span>
          )}
        </div>
      </div>

      {/* Spacer keeps the title block vertically centered within the panel. */}
      <span aria-hidden />
    </div>
  );
}

interface CatalogueShellProps {
  initialSongs: Transcription[];
  /** Maps song id → public MIDI URL (resolved server-side). */
  midiUrls: Record<string, string>;
  /** The ?song selection resolved server-side (null = default to newest). */
  initialSongId: string | null;
}

export default function CatalogueShell({
  initialSongs,
  midiUrls,
  initialSongId,
}: CatalogueShellProps) {
  const [songs, setSongs] = useState<Transcription[]>(initialSongs);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialSongId);
  // Whether the active song is "committed" (clicked) → drives Practice state.
  const [committed, setCommitted] = useState(false);
  // While committed (practicing), the right side collapses to just the committed
  // song card. Moving the mouse over the right side re-opens the full library;
  // moving it away collapses again. `listHovered` tracks pointer-over-aside.
  const [listHovered, setListHovered] = useState(false);

  // Discovery state (search / sort / filter)
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [favOnly, setFavOnly] = useState(false);

  // ── Deep-link sync ──────────────────────────────────────────────────────────
  // We write the URL with the History API directly (no useSearchParams — that
  // would force the whole tree out of SSR). Back/forward is handled via popstate.
  const updateUrl = useCallback((id: string | null) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (id) params.set("song", id);
    else params.delete("song");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/?${qs}` : "/");
  }, []);

  // Sync selection when the user navigates back/forward.
  useEffect(() => {
    const onPop = () => {
      const urlId = new URLSearchParams(window.location.search).get("song");
      const nextId =
        urlId && songs.some((s) => s.id === urlId) ? urlId : null;
      setHoveredId(null);
      setSelectedId(nextId);
      setCommitted(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [songs]);

  // ── Filtered + sorted list for display ─────────────────────────────────────
  const visibleSongs = useMemo(() => {
    let list = songs;
    if (favOnly) list = list.filter((s) => s.is_favorite);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((s) => s.title.toLowerCase().includes(q));
    }
    const sorted = [...list];
    switch (sort) {
      case "title":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "difficulty":
        sorted.sort((a, b) => b.difficulty - a.difficulty);
        break;
      case "duration":
        sorted.sort((a, b) => b.duration_sec - a.duration_sec);
        break;
      case "played":
        sorted.sort((a, b) => b.play_count - a.play_count);
        break;
      default: // recent
        sorted.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
    }
    return sorted;
  }, [songs, favOnly, query, sort]);

  // ── Active song resolution ─────────────────────────────────────────────────
  // Hover previews without committing. If nothing is hovered or selected, the
  // hero remains in its welcome state.
  const activeId = hoveredId ?? selectedId;
  const activeSong = songs.find((s) => s.id === activeId) ?? null;
  const isCommitted = committed;

  // Right side collapses to just the committed song while practicing, unless the
  // pointer is over it (then the full library re-opens for browsing).
  const committedSong = committed
    ? songs.find((s) => s.id === selectedId) ?? null
    : null;
  const listCollapsed = committed && !listHovered && committedSong !== null;

  // ── Selection handlers ─────────────────────────────────────────────────────
  // Hover = preview: switch the hero while hovered and drop out of practice mode.
  const handleHover = useCallback(
    (id: string | null) => {
      setHoveredId(id);
      if (id !== null) {
        setCommitted(false);
      }
    },
    [],
  );

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      setCommitted(true);
      setHoveredId(null);
      // Collapse the right side to the committed song immediately on commit,
      // even though the cursor is still over the list. Re-opens on the next
      // pointer move over the aside (see onPointerMove below).
      setListHovered(false);
      updateUrl(id);
    },
    [updateUrl],
  );

  // ── Mutations ──────────────────────────────────────────────────────────────
  const handleUploaded = useCallback(
    (row: Transcription) => {
      setSongs((prev) => [row, ...prev]);
      setSelectedId(row.id);
      setCommitted(false);
      updateUrl(row.id);
    },
    [updateUrl],
  );

  const handleUpdate = useCallback((updated: Transcription) => {
    setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      setHoveredId((current) => (current === id ? null : current));
      setSelectedId((current) => {
        if (current === id) {
          setCommitted(false);
          updateUrl(null);
          return null;
        }
        return current;
      });
      setSongs((prev) => prev.filter((s) => s.id !== id));
    },
    [updateUrl],
  );

  const handleSurprise = useCallback(() => {
    if (visibleSongs.length === 0) return;
    // deterministic-ish shuffle: pick something other than the current active
    const pool = visibleSongs.filter((s) => s.id !== activeId);
    const pick = (pool.length > 0 ? pool : visibleSongs)[
      Math.floor((Date.now() / 1000) % (pool.length || visibleSongs.length))
    ];
    if (pick) handleSelect(pick.id);
  }, [visibleSongs, activeId, handleSelect]);

  return (
    <div className="flex h-[calc(100vh-0px)] w-full overflow-hidden">
      {/* ── LEFT: Hero (dominant) ── */}
      <section className="relative flex-1 min-w-0">
        <Hero
          song={activeSong}
          midiUrl={activeSong ? midiUrls[activeSong.id] ?? null : null}
          committed={isCommitted}
          totalCount={songs.length}
          onUpdate={handleUpdate}
        />
      </section>

      {/* ── RIGHT: Song list (osu! song-select) ── */}
      {/* relative z-10 so a popped-out row (which slides left on hover) floats
          over the hero on the left, instead of being clipped beneath it.
          While practicing, this collapses to just the committed song; moving the
          pointer over it re-opens the full library. */}
      <aside
        className="relative z-10 w-[300px] shrink-0 border-l border-room-line bg-room/60 backdrop-blur-sm sm:w-[340px] lg:w-[380px]"
        onPointerMove={() => {
          if (committed && !listHovered) setListHovered(true);
        }}
        onPointerLeave={() => setListHovered(false)}
      >
        {listCollapsed && committedSong ? (
          <CollapsedPracticeCard song={committedSong} />
        ) : (
          <SongList
            songs={visibleSongs}
            totalCount={songs.length}
            activeId={activeId}
            committedId={committed ? selectedId : null}
            query={query}
            sort={sort}
            favOnly={favOnly}
            onQueryChange={setQuery}
            onSortChange={setSort}
            onFavOnlyChange={setFavOnly}
            onSurprise={handleSurprise}
            onHover={handleHover}
            onSelect={handleSelect}
            onUploaded={handleUploaded}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        )}
      </aside>
    </div>
  );
}
