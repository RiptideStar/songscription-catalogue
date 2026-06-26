"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SortKey, Transcription } from "@/lib/types";

interface DiscoveryBarProps {
  songs: Transcription[];
  search: string;
  sort: SortKey;
  favoritesOnly: boolean;
  onSearch: (q: string) => void;
  onSort: (s: SortKey) => void;
  onToggleFavorites: () => void;
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "title", label: "A – Z" },
  { value: "difficulty", label: "Difficulty" },
  { value: "duration", label: "Duration" },
  { value: "played", label: "Recently played" },
];

export default function DiscoveryBar({
  songs,
  search,
  sort,
  favoritesOnly,
  onSearch,
  onSort,
  onToggleFavorites,
}: DiscoveryBarProps) {
  const router = useRouter();
  const [localSearch, setLocalSearch] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // keep local in sync when parent resets
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setLocalSearch(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearch(val);
      }, 250);
    },
    [onSearch],
  );

  function surpriseMe() {
    if (songs.length === 0) return;
    const pick = songs[Math.floor(Math.random() * songs.length)];
    router.push(`/song/${pick.id}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px]">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path strokeLinecap="round" d="M13.5 13.5l3 3" />
          </svg>
        </span>
        <input
          type="search"
          placeholder="Search songs…"
          value={localSearch}
          onChange={handleSearchChange}
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900/80 pl-9 pr-3 py-2 text-sm text-neutral-200 placeholder-neutral-600
            focus:outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400/40
            transition-colors duration-150"
        />
      </div>

      {/* Sort */}
      <div className="relative">
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
          className="appearance-none rounded-lg border border-neutral-800 bg-neutral-900/80 pl-3 pr-8 py-2 text-sm text-neutral-300
            focus:outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400/40
            cursor-pointer transition-colors duration-150"
          aria-label="Sort by"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500">
          <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3">
            <path d="M6 8L1 3h10z" />
          </svg>
        </span>
      </div>

      {/* Favorites toggle */}
      <button
        type="button"
        onClick={onToggleFavorites}
        aria-pressed={favoritesOnly}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/60
          ${
            favoritesOnly
              ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
              : "border-neutral-800 bg-neutral-900/80 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700"
          }`}
      >
        <svg
          viewBox="0 0 20 20"
          fill={favoritesOnly ? "currentColor" : "none"}
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
        Favorites
      </button>

      {/* Surprise me */}
      <button
        type="button"
        onClick={surpriseMe}
        disabled={songs.length === 0}
        title={songs.length === 0 ? "Upload songs first" : "Pick a random song to practice"}
        className="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/80 px-3 py-2 text-sm text-neutral-400
          hover:border-amber-400/40 hover:text-amber-300 hover:bg-amber-400/5
          disabled:opacity-30 disabled:cursor-not-allowed
          transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/60"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h3l1 2H4v2h4l1 2H4v2h5.5l.5 1H4v2h8.5l1.5-2-1.5-2H16v-2h-2l-1.5-2H16V6h-3.5L11 4H16" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 14l2 2M14 16l2-2" />
        </svg>
        Surprise me
      </button>
    </div>
  );
}
