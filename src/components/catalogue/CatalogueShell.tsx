"use client";

/**
 * CatalogueShell — thin client owner of the song list.
 *
 * Responsibilities:
 *  - Holds the canonical `songs` array in React state (initialised from SSR data).
 *  - Passes `onUploaded` to UploadDropzone so new uploads appear instantly.
 *  - Passes mutation callbacks (update / delete) down to CatalogueGrid.
 *
 * The UploadDropzone component is built by another step; we import it lazily
 * to avoid blocking the initial paint, and we declare its props interface here
 * so TypeScript stays happy even before that file exists.
 */

import dynamic from "next/dynamic";
import { ComponentType, useState } from "react";
import type { Transcription } from "@/lib/types";
import CatalogueGrid from "./CatalogueGrid";

// --- UploadDropzone contract (implemented by @/components/upload/UploadDropzone) ---
interface UploadDropzoneProps {
  onUploaded: (row: Transcription) => void;
  compact?: boolean;
}

const UploadDropzone = dynamic<UploadDropzoneProps>(
  () =>
    import("@/components/upload/UploadDropzone").then((mod) => {
      // The upload step exports as a named export "UploadDropzone".
      // next/dynamic needs a { default: Component } shape.
      const anyMod = mod as unknown as Record<string, ComponentType<UploadDropzoneProps>>;
      const component = anyMod["UploadDropzone"];
      return { default: component };
    }),
  { ssr: false, loading: () => <UploadPlaceholder /> },
);

function UploadPlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900/30 px-6 py-4 text-center">
      <p className="text-xs text-neutral-700">Loading uploader…</p>
    </div>
  );
}

interface CatalogueShellProps {
  initialSongs: Transcription[];
}

export default function CatalogueShell({ initialSongs }: CatalogueShellProps) {
  const [songs, setSongs] = useState<Transcription[]>(initialSongs);

  function handleUploaded(row: Transcription) {
    // Prepend so the newest upload appears first
    setSongs((prev) => [row, ...prev]);
  }

  function handleUpdate(updated: Transcription) {
    setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  function handleDelete(id: string) {
    setSongs((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <>
      <div className="mt-6">
        <UploadDropzone onUploaded={handleUploaded} compact />
      </div>

      <div className="mt-10">
        <CatalogueGrid
          songs={songs}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      </div>
    </>
  );
}
