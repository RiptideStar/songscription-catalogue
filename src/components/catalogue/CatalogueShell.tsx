"use client";

/**
 * CatalogueShell — the single-surface, osu!-style catalogue.
 *
 * Layout: a left HERO that previews the active song (scrolling piano-roll +
 * transport, dominant visual hierarchy) and a right SONG LIST (osu! song-select)
 * pinned to the edge.
 *
 * Interaction model:
 *   - HOVER a song in the list   → it becomes the *preview* (auto-loops in hero).
 *   - CLICK a song               → it *commits* (selected) → Practice mode.
 *   - Mouse leaves the list      → preview falls back to the selected song.
 *
 * The "active" song shown in the hero is: hovered ?? selected ?? first.
 * Selection is deep-linked via ?song=<id> so refresh/share is stable.
 *
 * This component owns song-list state (uploads/favorite/delete) and selection;
 * child components (SongList, Hero) are presentational + emit events up.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Transcription, SortKey } from "@/lib/types";
import SongList from "./SongList";
import Hero from "../player/Hero";

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
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSongId ?? initialSongs[0]?.id ?? null,
  );
  // Whether the active song is "committed" (clicked) → drives Practice state.
  const [committed, setCommitted] = useState(false);

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
      if (urlId && songs.some((s) => s.id === urlId)) {
        setSelectedId(urlId);
        setCommitted(false);
      }
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
  const activeId = hoveredId ?? selectedId ?? visibleSongs[0]?.id ?? null;
  const activeSong = songs.find((s) => s.id === activeId) ?? null;
  // Hover overrides commit: previewing a *different* song un-commits the view.
  const isCommitted = committed && hoveredId === null;

  // ── Selection handlers ─────────────────────────────────────────────────────
  const handleHover = useCallback((id: string | null) => {
    setHoveredId(id);
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      setHoveredId(null);
      setCommitted(true);
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
      setSongs((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (selectedId === id) {
          const fallback = next[0]?.id ?? null;
          setSelectedId(fallback);
          setCommitted(false);
          updateUrl(fallback);
        }
        return next;
      });
    },
    [selectedId, updateUrl],
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
          onPractice={() => activeSong && handleSelect(activeSong.id)}
        />
      </section>

      {/* ── RIGHT: Song list (osu! song-select) ── */}
      <aside className="w-[300px] shrink-0 border-l border-room-line bg-room/60 backdrop-blur-sm sm:w-[340px] lg:w-[380px]">
        <SongList
          songs={visibleSongs}
          totalCount={songs.length}
          activeId={activeId}
          selectedId={selectedId}
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
      </aside>
    </div>
  );
}
