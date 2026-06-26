import { listTranscriptions, publicMidiUrl } from "@/lib/storage";
import type { Transcription } from "@/lib/types";
import CatalogueShell from "@/components/catalogue/CatalogueShell";

/**
 * Catalogue home — server component. Single surface: the whole experience
 * (browse + preview + practice entry) lives here. We resolve public MIDI URLs
 * server-side so the client can stream/parse any song the moment it's hovered.
 *
 * The initial `?song` selection is read here (server-side) and passed down as a
 * prop, so CatalogueShell never needs `useSearchParams()`. A missing or invalid
 * deep link intentionally stays null so the left side can show the welcome
 * state instead of auto-selecting the first song.
 */
interface HomeProps {
  searchParams: Promise<{ song?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { song: initialSongId } = await searchParams;

  let songs: Transcription[] = [];
  try {
    songs = await listTranscriptions({ sort: "recent" });
  } catch {
    // Degrade gracefully to the empty state if Supabase is unreachable.
  }

  const midiUrls: Record<string, string> = {};
  for (const s of songs) {
    try {
      midiUrls[s.id] = publicMidiUrl(s.file_path);
    } catch {
      // skip — Hero handles a missing URL
    }
  }

  // Only honour a ?song that actually exists; no deep link means welcome.
  const validInitialId =
    initialSongId && songs.some((s) => s.id === initialSongId)
      ? initialSongId
      : null;

  return (
    <main className="h-screen overflow-hidden bg-room text-ivory">
      <CatalogueShell
        initialSongs={songs}
        midiUrls={midiUrls}
        initialSongId={validInitialId}
      />
    </main>
  );
}
