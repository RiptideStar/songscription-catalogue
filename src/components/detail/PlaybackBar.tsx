"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { PreviewNote } from "@/lib/types";

interface PlaybackBarProps {
  notes: PreviewNote[];
  onProgress: (progress: number) => void;
  onFirstPlay?: () => void;
}

// ---------------------------------------------------------------------------
// Types to avoid `any` on Tone internals
// ---------------------------------------------------------------------------
interface ToneTransport {
  start: (time?: number) => void;
  stop: () => void;
  pause: () => void;
  cancel: () => void;
  seconds: number;
  state: string;
}

interface TonePolySynth {
  triggerAttackRelease: (note: string | number, duration: number, time: number, velocity?: number) => void;
  dispose: () => void;
  toDestination: () => TonePolySynth;
}

interface ToneStatic {
  start: () => Promise<void>;
  now: () => number;
  Transport: ToneTransport;
  PolySynth: new () => TonePolySynth;
  Synth: new () => unknown;
}

/** Format seconds as m:ss */
function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function PlaybackBar({ notes, onProgress, onFirstPlay }: PlaybackBarProps) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekValue, setSeekValue] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Refs hold Tone.js objects so they persist without triggering re-renders
  const toneRef = useRef<ToneStatic | null>(null);
  const synthRef = useRef<TonePolySynth | null>(null);
  const rafRef = useRef<number | null>(null);
  const startOffsetRef = useRef(0); // seconds offset when we last pressed play
  const playedFirstRef = useRef(false);
  const scheduledRef = useRef(false);

  const totalDuration = notes.length > 0
    ? Math.max(...notes.map((n) => n.time + n.duration), 0.1)
    : 0;

  // ── RAF loop: read Transport.seconds → drive progress ───────────────────
  const startRaf = useCallback(() => {
    const Tone = toneRef.current;
    if (!Tone) return;
    const tick = () => {
      const t = Math.min(Tone.Transport.seconds, totalDuration);
      setCurrentTime(t);
      if (!dragging) {
        setSeekValue(t / (totalDuration || 1));
        onProgress(t / (totalDuration || 1));
      }
      if (Tone.Transport.state === "started") {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setPlaying(false);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [totalDuration, dragging, onProgress]);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ── Schedule notes onto the Transport ───────────────────────────────────
  const scheduleNotes = useCallback((Tone: ToneStatic, synth: TonePolySynth) => {
    if (scheduledRef.current) return;
    scheduledRef.current = true;

    for (const note of notes) {
      // Convert midi number → frequency (Tone.js accepts midi numbers)
      synth.triggerAttackRelease(
        note.midi,
        note.duration,
        note.time,
        note.velocity,
      );
    }
  }, [notes]);

  // ── Play ─────────────────────────────────────────────────────────────────
  const play = useCallback(async () => {
    // Lazy-load Tone.js (browser only, dynamic import guards SSR)
    if (!toneRef.current) {
      // tone is pure ESM — named exports only, no default
      const ToneModule = await import("tone");
      toneRef.current = ToneModule as unknown as ToneStatic;
    }
    const Tone = toneRef.current;

    // Browser requires user gesture before AudioContext starts
    await Tone.start();

    if (!playedFirstRef.current) {
      playedFirstRef.current = true;
      onFirstPlay?.();
    }

    // Build synth once
    if (!synthRef.current) {
      // PolySynth wraps a Synth under the hood for polyphony
      // We cast via unknown to bridge the constructor typing gap
      const Synth = Tone.Synth as new () => unknown;
      const poly = new (Tone.PolySynth as unknown as new (SynthClass?: new () => unknown) => TonePolySynth)(Synth);
      poly.toDestination();
      synthRef.current = poly;
    }

    scheduleNotes(Tone, synthRef.current);

    // Seek to current offset and start transport
    Tone.Transport.cancel();
    Tone.Transport.seconds = startOffsetRef.current;
    Tone.Transport.start();

    setPlaying(true);
    startRaf();
  }, [scheduleNotes, onFirstPlay, startRaf]);

  // ── Pause ────────────────────────────────────────────────────────────────
  const pause = useCallback(() => {
    const Tone = toneRef.current;
    if (!Tone) return;
    startOffsetRef.current = Tone.Transport.seconds;
    Tone.Transport.pause();
    stopRaf();
    setPlaying(false);
  }, [stopRaf]);

  // ── Seek ─────────────────────────────────────────────────────────────────
  const seekTo = useCallback((fraction: number) => {
    const t = fraction * totalDuration;
    startOffsetRef.current = t;
    setCurrentTime(t);
    setSeekValue(fraction);
    onProgress(fraction);

    const Tone = toneRef.current;
    if (!Tone) return;
    if (Tone.Transport.state === "started") {
      Tone.Transport.seconds = t;
    }
  }, [totalDuration, onProgress]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopRaf();
      const Tone = toneRef.current;
      if (Tone) {
        Tone.Transport.stop();
        Tone.Transport.cancel();
      }
      synthRef.current?.dispose();
    };
  }, [stopRaf]);

  // Re-schedule if notes change (new MIDI loaded)
  useEffect(() => {
    scheduledRef.current = false;
    // If we have a synth, rebuild it so old events are cleared
    synthRef.current?.dispose();
    synthRef.current = null;
    // Reset position
    startOffsetRef.current = 0;
    setCurrentTime(0);
    setSeekValue(0);
    onProgress(0);
    const Tone = toneRef.current;
    if (Tone) {
      Tone.Transport.stop();
      Tone.Transport.cancel();
      Tone.Transport.seconds = 0;
    }
    setPlaying(false);
    stopRaf();
  }, [notes, onProgress, stopRaf]);

  const disabled = notes.length === 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-neutral-900/70 border border-neutral-800/60 px-5 py-4">
      {/* Time display */}
      <div className="flex items-center justify-between text-xs font-mono text-neutral-500 tabular-nums select-none">
        <span className="text-neutral-400">{fmt(currentTime)}</span>
        <span>{fmt(totalDuration)}</span>
      </div>

      {/* Seek bar */}
      <div className="relative flex items-center">
        <input
          type="range"
          min={0}
          max={1}
          step={0.0001}
          value={seekValue}
          disabled={disabled}
          onMouseDown={() => setDragging(true)}
          onTouchStart={() => setDragging(true)}
          onMouseUp={() => setDragging(false)}
          onTouchEnd={() => setDragging(false)}
          onChange={(e) => seekTo(parseFloat(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer
            bg-neutral-800 accent-amber-400
            disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Seek"
        />
        {/* Progress fill overlay */}
        <div
          className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-amber-500/60"
          style={{ width: `${seekValue * 100}%` }}
          aria-hidden
        />
      </div>

      {/* Transport controls */}
      <div className="flex items-center justify-center gap-4">
        {/* Rewind to start */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => seekTo(0)}
          aria-label="Rewind to start"
          className="p-2 rounded-lg text-neutral-500 hover:text-neutral-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M3.5 4a.5.5 0 00-.5.5v11a.5.5 0 001 0V4a.5.5 0 00-.5-.5zM6.5 10l8.5-5.5v11L6.5 10z" />
          </svg>
        </button>

        {/* Play / Pause */}
        <button
          type="button"
          disabled={disabled}
          onClick={playing ? pause : play}
          aria-label={playing ? "Pause" : "Play"}
          className="flex items-center justify-center w-11 h-11 rounded-full bg-amber-500 hover:bg-amber-400 active:scale-95 transition-all duration-150
            text-neutral-950 shadow-lg shadow-amber-900/30
            disabled:opacity-40 disabled:cursor-not-allowed
            focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          {playing ? (
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M5 4h3v12H5V4zm7 0h3v12h-3V4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 translate-x-0.5">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
          )}
        </button>

        {/* Seek to end */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => { pause(); seekTo(1); }}
          aria-label="Skip to end"
          className="p-2 rounded-lg text-neutral-500 hover:text-neutral-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M16.5 4a.5.5 0 01.5.5v11a.5.5 0 01-1 0V4a.5.5 0 01.5-.5zM5 4.5L13.5 10 5 15.5V4.5z" />
          </svg>
        </button>
      </div>

      {disabled && (
        <p className="text-center text-xs text-neutral-600">Loading MIDI…</p>
      )}
    </div>
  );
}
