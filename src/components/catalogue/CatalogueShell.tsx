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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [selectedId, setSelectedId] = useState<string | null>(initialSongId);
  // Whether the active song is "committed" (clicked) → drives Practice state.
  const [committed, setCommitted] = useState(false);
  // While committed (practicing), the right side collapses to just the committed
  // song card. Moving the mouse over the right side re-opens the full library;
  // moving it away collapses again. `listHovered` tracks pointer-over-aside.
  const [listHovered, setListHovered] = useState(false);
  // After a commit the cursor is usually still parked over the aside, so a stray
  // pointer-move would instantly re-open the list we just collapsed. We only arm
  // re-open once the pointer has actually *left* the aside — then a deliberate
  // move back onto it re-opens. A ref (not state) so it never triggers a render.
  const reopenArmed = useRef(false);

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

  // ── Esc exits practice mode ─────────────────────────────────────────────────
  // Drops back to preview of the same song (keeps selection + the roll on screen)
  // and re-opens the collapsed library. Ignored while typing in the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !committed) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      setCommitted(false);
      setListHovered(false);
      reopenArmed.current = true;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [committed]);

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

  // While practicing, the sidebar collapses to a thin edge strip so the hero
  // (full Practice mode) fills the page, unless the pointer is over the strip
  // (then the full library re-opens for browsing). Guard on the committed song
  // still existing so we never collapse around a since-deleted selection.
  const committedSong = committed
    ? songs.find((s) => s.id === selectedId) ?? null
    : null;
  const listCollapsed = committed && !listHovered && committedSong !== null;

  // ── Selection handlers ─────────────────────────────────────────────────────
  // Hover = preview: switch the hero while hovered and drop out of practice mode.
  // The preview is *sticky* — when the pointer leaves the list (id === null) we
  // keep showing the last hovered song rather than snapping back to the deep-
  // linked selection. So moving the mouse onto the hero to watch/scrub keeps the
  // song you were just previewing. A fresh hover replaces it; a click commits it.
  const handleHover = useCallback(
    (id: string | null) => {
      if (id === null) return; // pointer left the list — hold the last preview
      setHoveredId(id);
      setCommitted(false);
    },
    [],
  );

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      setCommitted(true);
      setHoveredId(null);
      // Collapse the right side to the committed song immediately on commit,
      // even though the cursor is still over the list. Disarm re-open so the
      // collapse sticks until the pointer leaves and deliberately returns —
      // otherwise a stray move would bounce the list back open at once.
      setListHovered(false);
      reopenArmed.current = false;
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
      {/* While practicing, the aside collapses to a thin edge strip so the hero
          (full Practice mode) fills the whole page. Moving the pointer to the
          right edge slides the full library back in. When open it floats over the
          hero (z-10) so a popped-out row can slide left without being clipped. */}
      <aside
        className={[
          "relative z-10 shrink-0 border-l border-room-line bg-room/60 backdrop-blur-sm",
          "transition-[width] duration-300 ease-out",
          listCollapsed
            ? "w-3 hover:w-3 cursor-w-resize"
            : "w-[300px] sm:w-[340px] lg:w-[380px]",
        ].join(" ")}
        aria-label={listCollapsed ? "Show song library" : undefined}
        onPointerMove={() => {
          // Only re-open once the pointer has left the aside and come back —
          // arming happens in onPointerLeave. Stops the just-collapsed list
          // from springing open under a cursor that never left after the click.
          if (committed && !listHovered && reopenArmed.current) {
            setListHovered(true);
          }
        }}
        onPointerLeave={() => {
          setListHovered(false);
          reopenArmed.current = true;
        }}
      >
        {listCollapsed ? (
          // Thin re-open handle: an accent sliver hinting the library is hidden
          // here. Hovering the strip (pointer-enter → onPointerMove) slides it
          // back open.
          <span
            className="pointer-events-none absolute inset-y-0 right-0 w-px bg-room-line"
            aria-hidden
          />
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
