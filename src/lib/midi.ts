import { Midi } from "@tonejs/midi";
import type { ParsedMidi, PreviewNote } from "./types";

// Cap the notes we ship to the client for the preview. A dense classical piece
// can have thousands of events; the piano-roll only needs enough to read.
const MAX_PREVIEW_NOTES = 1200;

const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

/** Human key name from @tonejs/midi's key signature event ("C", "major"). */
function formatKey(key?: string, scale?: string): string | null {
  if (!key) return null;
  const s = scale ? ` ${scale}` : "";
  return `${key}${s}`;
}

function midiToName(n: number): string {
  const name = NOTE_NAMES[n % 12];
  const octave = Math.floor(n / 12) - 1;
  return `${name}${octave}`;
}

/**
 * Difficulty heuristic (1–5). Combines three signals a learner feels:
 *  - note density (notes per second) → faster = harder
 *  - pitch range (span in semitones) → wider hand movement = harder
 *  - polyphony hint (notes / duration vs. tracks) → more simultaneous = harder
 * Tuned to land simple scales at 1–2 and dense piano works at 4–5.
 */
function deriveDifficulty(
  noteCount: number,
  durationSec: number,
  span: number,
  trackCount: number,
): number {
  if (noteCount === 0 || durationSec === 0) return 1;
  const density = noteCount / durationSec; // notes/sec
  const densityScore = Math.min(density / 8, 1); // ~8 nps = max
  const spanScore = Math.min(span / 48, 1); // 4 octaves = max
  const polyScore = Math.min(trackCount / 4, 1); // 4+ tracks = max
  const raw = densityScore * 0.55 + spanScore * 0.3 + polyScore * 0.15;
  return Math.max(1, Math.min(5, Math.round(raw * 4) + 1));
}

/**
 * Deterministic warm accent per song, derived from its musical fingerprint so
 * the same file always gets the same colour and the grid stays differentiable.
 * Hues are pulled toward the warm/amber/rust range to fit the studio aesthetic.
 */
function deriveColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) % 360;
  }
  // Bias hue into a warm band (15–55°) with a couple of cool escapes for variety.
  const warm = 15 + (h % 45); // 15–60
  const hue = h % 7 === 0 ? 200 + (h % 40) : warm; // ~1 in 7 gets a teal accent
  return `hsl(${hue} 55% 60%)`;
}

/** Parse a .mid buffer into the metadata + preview notes we store and show. */
export function parseMidi(buffer: ArrayBuffer, title: string): ParsedMidi {
  const midi = new Midi(buffer);

  const durationSec = midi.duration;
  const tempoEvent = midi.header.tempos[0];
  const tempoBpm = tempoEvent ? Math.round(tempoEvent.bpm) : null;

  const tsEvent = midi.header.timeSignatures[0];
  const timeSig = tsEvent
    ? `${tsEvent.timeSignature[0]}/${tsEvent.timeSignature[1]}`
    : null;

  const keyEvent = midi.header.keySignatures[0];
  const keySig = keyEvent ? formatKey(keyEvent.key, keyEvent.scale) : null;

  // Flatten every note across tracks.
  const allNotes: PreviewNote[] = [];
  let lowest = Infinity;
  let highest = -Infinity;
  for (const track of midi.tracks) {
    for (const note of track.notes) {
      allNotes.push({
        midi: note.midi,
        time: Number(note.time.toFixed(4)),
        duration: Number(note.duration.toFixed(4)),
        velocity: Number(note.velocity.toFixed(3)),
      });
      if (note.midi < lowest) lowest = note.midi;
      if (note.midi > highest) highest = note.midi;
    }
  }

  const noteCount = allNotes.length;
  const lowestNote = noteCount ? lowest : null;
  const highestNote = noteCount ? highest : null;
  const span = noteCount ? highest - lowest : 0;
  const trackCount = midi.tracks.filter((t) => t.notes.length > 0).length || 1;

  // Downsample preview notes if needed, preserving time order.
  let previewNotes = allNotes.sort((a, b) => a.time - b.time);
  if (previewNotes.length > MAX_PREVIEW_NOTES) {
    const step = previewNotes.length / MAX_PREVIEW_NOTES;
    const sampled: PreviewNote[] = [];
    for (let i = 0; i < previewNotes.length; i += step) {
      sampled.push(previewNotes[Math.floor(i)]);
    }
    previewNotes = sampled;
  }

  return {
    duration_sec: Number(durationSec.toFixed(2)),
    tempo_bpm: tempoBpm,
    key_sig: keySig,
    time_sig: timeSig,
    track_count: trackCount,
    note_count: noteCount,
    lowest_note: lowestNote,
    highest_note: highestNote,
    difficulty: deriveDifficulty(noteCount, durationSec, span, trackCount),
    color: deriveColor(title + noteCount + durationSec),
    notes: previewNotes,
  };
}

export { midiToName };
