"use client";

import { useMemo, useState } from "react";
import type { SortKey, Transcription } from "@/lib/types";
import SongCard from "./SongCard";
import DiscoveryBar from "./DiscoveryBar";

interface CatalogueGridProps {
  /** Live list — owned by parent (CatalogueShell). Grid mutates via callbacks. */
  songs: Transcription[];
  onUpdate: (updated: Transcription) => void;
  onDelete: (id: string) => void;
}

/** Client-side sort matching storage.ts's applySort */
function sortSongs(songs: Transcription[], sort: SortKey): Transcription[] {
  const by = [...songs];
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

/** Empty state when the user has no songs at all */
function EmptyLibrary() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-5 select-none">
      <div className="relative flex items-center justify-center">
        <div className="absolute h-32 w-32 rounded-full bg-amber-400/5 blur-2xl" />
        <svg
          viewBox="0 0 64 64"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.2}
          className="h-16 w-16 text-neutral-700 relative"
        >
          <rect x="12" y="8" width="28" height="40" rx="2" />
          <path d="M24 48v6l8-4-8-4v4z" />
          <path d="M20 16h16M20 22h12M20 28h8" strokeLinecap="round" />
          <circle cx="46" cy="44" r="10" />
          <path d="M46 40v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <p className="font-serif text-xl text-neutral-300">Your library is empty</p>
        <p className="mt-1.5 text-sm text-neutral-600 max-w-xs">
          Upload a{" "}
          <code className="text-neutral-500 text-xs bg-neutral-800 px-1 py-0.5 rounded">
            .mid
          </code>{" "}
          file above to transcribe your first song and start building your
          practice catalogue.
        </p>
      </div>
      {/* Decorative ghost cards as hints */}
      <div className="mt-2 flex gap-2 flex-wrap justify-center">
        {[
          { label: "Moonlight Sonata", color: "#7c9fd4" },
          { label: "Clair de Lune", color: "#a87cc5" },
          { label: "Für Elise", color: "#6fba8a" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-neutral-800/70 bg-neutral-900/50 px-4 py-2.5 text-xs text-neutral-600 relative overflow-hidden pointer-events-none"
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-[3px]"
              style={{ backgroundColor: s.color, opacity: 0.5 }}
            />
            <span className="pl-1">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Empty state when search/filter produces no results */
function NoMatches({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      <svg
        viewBox="0 0 40 40"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        className="h-10 w-10 text-neutral-700"
      >
        <circle cx="17" cy="17" r="10" />
        <path strokeLinecap="round" d="M25 25l8 8" />
        <path strokeLinecap="round" d="M13 17h8M17 13v8" strokeOpacity={0.4} />
      </svg>
      <p className="text-sm text-neutral-500">
        No songs match{" "}
        <span className="text-neutral-300 font-medium">
          &ldquo;{query}&rdquo;
        </span>
      </p>
      <button
        type="button"
        onClick={onClear}
        className="text-xs text-amber-400/70 hover:text-amber-300 underline underline-offset-2 transition-colors"
      >
        Clear filter
      </button>
    </div>
  );
}

// Stagger cap: beyond this count, entrance animation is 0 delay (avoids jank)
const STAGGER_CAP = 24;
const STAGGER_STEP_MS = 35;

export default function CatalogueGrid({
  songs,
  onUpdate,
  onDelete,
}: CatalogueGridProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const displayed = useMemo(() => {
    let list = songs;
    if (favoritesOnly) list = list.filter((s) => s.is_favorite);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.title.toLowerCase().includes(q));
    }
    return sortSongs(list, sort);
  }, [songs, search, sort, favoritesOnly]);

  function clearFilter() {
    setSearch("");
    setFavoritesOnly(false);
  }

  const isEmpty = songs.length === 0;
  const noMatches = !isEmpty && displayed.length === 0;
  const hasFilter = search.trim() !== "" || favoritesOnly;

  return (
    <div className="flex flex-col gap-6">
      {/* Discovery bar — only when there are songs */}
      {!isEmpty && (
        <DiscoveryBar
          songs={displayed}
          search={search}
          sort={sort}
          favoritesOnly={favoritesOnly}
          onSearch={setSearch}
          onSort={setSort}
          onToggleFavorites={() => setFavoritesOnly((v) => !v)}
        />
      )}

      {isEmpty && <EmptyLibrary />}

      {noMatches && (
        <NoMatches
          query={hasFilter ? search || "favorites" : ""}
          onClear={clearFilter}
        />
      )}

      {!isEmpty && !noMatches && (
        <>
          {hasFilter && (
            <p className="text-xs text-neutral-600">
              {displayed.length}{" "}
              {displayed.length === 1 ? "song" : "songs"} found
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayed.map((song, i) => (
              <SongCard
                key={song.id}
                song={song}
                onFavoriteToggle={onUpdate}
                onDelete={onDelete}
                entranceDelay={i < STAGGER_CAP ? i * STAGGER_STEP_MS : 0}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
