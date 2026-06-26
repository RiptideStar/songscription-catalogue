"use client";

import { useState, useEffect } from "react";
import type { PreviewNote } from "@/lib/types";

interface UseMidiNotesResult {
  notes: PreviewNote[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetch and parse a .mid file client-side using @tonejs/midi.
 * Returns flattened PreviewNote[] across all tracks, sorted by time.
 *
 * We dynamically import @tonejs/midi to ensure it never runs on the server
 * (it accesses browser globals during initialisation).
 */
export function useMidiNotes(midiUrl: string): UseMidiNotesResult {
  const [notes, setNotes] = useState<PreviewNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // Fetch the raw .mid bytes
        const res = await fetch(midiUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching MIDI`);
        const buffer = await res.arrayBuffer();

        // Dynamic import keeps @tonejs/midi out of the SSR bundle
        const { Midi } = await import("@tonejs/midi");
        const midi = new Midi(buffer);

        // Flatten all tracks' notes into PreviewNote[]
        const all: PreviewNote[] = [];
        for (const track of midi.tracks) {
          for (const note of track.notes) {
            all.push({
              midi: note.midi,
              time: Number(note.time.toFixed(4)),
              duration: Number(note.duration.toFixed(4)),
              velocity: Number(note.velocity.toFixed(3)),
            });
          }
        }

        // Sort by onset time
        all.sort((a, b) => a.time - b.time);

        if (!cancelled) {
          setNotes(all);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load MIDI");
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [midiUrl]);

  return { notes, loading, error };
}
