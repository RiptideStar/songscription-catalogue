import { listTranscriptions } from "@/lib/storage";
import type { Transcription } from "@/lib/types";
import CatalogueShell from "@/components/catalogue/CatalogueShell";

/**
 * Catalogue home page — server component.
 * Fetches the initial song list so the first paint shows real data (no flash).
 * Client-side state (uploads, favorites, deletes) is handled by CatalogueShell.
 */
export default async function Home() {
  // Fetch at request time; Next.js caches per-segment automatically.
  // Falls back to empty array so the page still renders if Supabase is cold.
  let songs: Transcription[] = [];
  try {
    songs = await listTranscriptions({ sort: "recent" });
  } catch {
    // silently degrade — the shell renders an empty state
  }

  return (
    <main className="min-h-screen bg-room">
      {/* ── Header ── */}
      <header className="border-b border-room-line bg-room/80 backdrop-blur-md sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-xl font-medium tracking-tight text-neutral-100">
              Songscription
            </h1>
            <p className="text-xs text-neutral-600 mt-0.5 hidden sm:block">
              Your personal piano transcription library
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-700 tabular-nums">
              {songs.length} {songs.length === 1 ? "song" : "songs"}
            </span>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Hero tagline — only when there are songs */}
        {songs.length > 0 && (
          <div className="mb-8">
            <h2 className="font-serif text-3xl font-medium text-neutral-100 leading-tight">
              Your library
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {songs.length} transcription{songs.length !== 1 ? "s" : ""}
              {" · "}
              {songs.filter((s) => s.is_favorite).length} favorited
            </p>
          </div>
        )}

        {/* Empty-state hero — welcoming first-time experience */}
        {songs.length === 0 && (
          <div className="mb-10 text-center pt-4">
            <h2 className="font-serif text-4xl font-medium text-neutral-100 leading-tight">
              Start with a song
            </h2>
            <p className="mt-3 text-base text-neutral-500 max-w-md mx-auto">
              Upload a <code className="text-amber-400/80 bg-neutral-800/60 px-1.5 py-0.5 rounded text-sm">.mid</code> file to parse its structure, track tempo and key, and build your practice catalogue.
            </p>
          </div>
        )}

        {/* CatalogueShell: upload zone + catalogue grid, fully client-managed */}
        <CatalogueShell initialSongs={songs} />
      </div>
    </main>
  );
}
