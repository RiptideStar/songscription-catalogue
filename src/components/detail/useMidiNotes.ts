"use client";

import { useState, useEffect } from "react";
import type { PreviewNote } from "@/lib/types";

interface UseMidiNotesResult {
  notes: PreviewNote[];
  loading: boolean;
  error: string | null;
}

interface MidiNotesState extends UseMidiNotesResult {
  url: string;
}

/**
 * Fetch and parse a .mid file client-side using @tonejs/midi.
 * Returns flattened PreviewNote[] across all tracks, sorted by time.
 *
 * We dynamically import @tonejs/midi to ensure it never runs on the server
 * (it accesses browser globals during initialisation).
 */
export function useMidiNotes(midiUrl: string): UseMidiNotesResult {
  const [state, setState] = useState<MidiNotesState>(() => ({
    url: midiUrl,
    notes: [],
    loading: Boolean(midiUrl),
    error: null,
  }));

  useEffect(() => {
    let cancelled = false;

    if (!midiUrl) {
      setState({ url: midiUrl, notes: [], loading: false, error: null });
      return () => {
        cancelled = true;
      };
    }

    async function load() {
      setState({ url: midiUrl, notes: [], loading: true, error: null });

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
          setState({ url: midiUrl, notes: all, loading: false, error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            url: midiUrl,
            notes: [],
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load MIDI",
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [midiUrl]);

  if (state.url !== midiUrl) {
    return { notes: [], loading: Boolean(midiUrl), error: null };
  }

  return {
    notes: state.notes,
    loading: state.loading,
    error: state.error,
  };
}
