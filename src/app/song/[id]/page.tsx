import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranscription, publicMidiUrl } from "@/lib/storage";
import SongDetail from "@/components/detail/SongDetail";

// Next.js 15: params is a Promise
interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SongPage({ params }: PageProps) {
  const { id } = await params;
  const song = await getTranscription(id);

  if (!song) {
    notFound();
  }

  const midiUrl = publicMidiUrl(song.file_path);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Top nav bar with back link */}
      <nav className="sticky top-0 z-10 border-b border-neutral-800/60 bg-neutral-950/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="group flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 rounded"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10H5m5-5l-5 5 5 5" />
            </svg>
            Catalogue
          </Link>

          <span
            className="ml-auto text-sm font-serif text-neutral-400 truncate max-w-[60vw]"
            aria-current="page"
          >
            {song.title}
          </span>
        </div>
      </nav>

      {/* Detail content */}
      <SongDetail song={song} midiUrl={midiUrl} />
    </div>
  );
}
