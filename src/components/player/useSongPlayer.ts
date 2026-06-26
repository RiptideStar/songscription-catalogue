"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { PreviewNote } from "@/lib/types";

/**
 * useSongPlayer — the shared playback engine for the single-surface catalogue.
 *
 * Wraps Tone.js (lazy-loaded, browser-only) and exposes a small, declarative
 * surface the UI can drive:
 *   - play / pause / toggle / seek / stop
 *   - `progress` (0–1) driven by a RAF loop, for the scrolling piano-roll
 *   - `loop` mode (osu!-style auto-loop preview)
 *
 * Audio-autoplay reality: browsers block AudioContext until a user gesture.
 * We expose `armed` (true once Tone.start() has succeeded after any gesture)
 * and an `arm()` helper. The hover-preview can begin *scrolling* immediately
 * and flip on *sound* the moment the page has been interacted with once.
 */

interface ToneTransport {
  start: (time?: number) => void;
  stop: () => void;
  pause: () => void;
  cancel: () => void;
  seconds: number;
  state: string;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
}

interface TonePolySynth {
  triggerAttackRelease: (
    note: string | number,
    duration: number,
    time: number,
    velocity?: number,
  ) => void;
  sync: () => TonePolySynth;
  dispose: () => void;
  toDestination: () => TonePolySynth;
  volume: { value: number };
}

interface ToneFrequency {
  toNote: () => string;
}

interface ToneStatic {
  start: () => Promise<void>;
  now: () => number;
  Transport: ToneTransport;
  PolySynth: new (synth?: new () => unknown) => TonePolySynth;
  Synth: new () => unknown;
  Frequency: (value: number, units: string) => ToneFrequency;
}

export interface SongPlayerState {
  playing: boolean;
  progress: number; // 0–1
  currentTime: number; // seconds
  totalDuration: number; // seconds
  armed: boolean; // AudioContext has started (sound is possible)
  ready: boolean; // notes scheduled, transport usable
}

export interface SongPlayerControls {
  play: () => Promise<void>;
  pause: () => void;
  toggle: () => void;
  stop: () => void;
  seek: (fraction: number) => void;
  setLoop: (loop: boolean) => void;
}

interface UseSongPlayerOptions {
  notes: PreviewNote[];
  loop?: boolean;
  /** Fires the first time playback actually starts (for play-count). */
  onFirstPlay?: () => void;
}

export function useSongPlayer({
  notes,
  loop = false,
  onFirstPlay,
}: UseSongPlayerOptions): SongPlayerState & SongPlayerControls {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [armed, setArmed] = useState(false);

  const toneRef = useRef<ToneStatic | null>(null);
  const synthRef = useRef<TonePolySynth | null>(null);
  const rafRef = useRef<number | null>(null);
  const scheduledRef = useRef(false);
  const playedFirstRef = useRef(false);
  const loopRef = useRef(loop);

  const totalDuration =
    notes.length > 0
      ? Math.max(...notes.map((n) => n.time + n.duration), 0.1)
      : 0;
  const totalRef = useRef(totalDuration);
  totalRef.current = totalDuration;

  // ── RAF: read Transport.seconds → drive progress ───────────────────────────
  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startRaf = useCallback(() => {
    const Tone = toneRef.current;
    if (!Tone) return;
    const tick = () => {
      const total = totalRef.current || 1;
      const raw = Tone.Transport.seconds;

      // Loop mode: Tone handles the wrap via Transport.loop; just clamp display.
      if (loopRef.current) {
        const t = raw % total;
        setCurrentTime(t);
        setProgress(t / total);
        if (Tone.Transport.state === "started") {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setPlaying(false);
        }
        return;
      }

      const t = Math.min(raw, total);
      setCurrentTime(t);
      setProgress(t / total);

      // End of song (non-loop): stop cleanly, reset to start.
      if (raw >= total) {
        Tone.Transport.stop();
        Tone.Transport.seconds = 0;
        setCurrentTime(0);
        setProgress(0);
        setPlaying(false);
        rafRef.current = null;
        return;
      }

      if (Tone.Transport.state === "started") {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setPlaying(false);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Schedule notes onto the (synced) Transport ─────────────────────────────
  const scheduleNotes = useCallback(
    (Tone: ToneStatic, synth: TonePolySynth) => {
      if (scheduledRef.current) return;
      scheduledRef.current = true;
      for (const note of notes) {
        const noteName = Tone.Frequency(note.midi, "midi").toNote();
        synth.triggerAttackRelease(
          noteName,
          note.duration,
          note.time,
          note.velocity,
        );
      }
    },
    [notes],
  );

  const ensureTone = useCallback(async (): Promise<ToneStatic> => {
    if (!toneRef.current) {
      const ToneModule = await import("tone");
      toneRef.current = ToneModule as unknown as ToneStatic;
    }
    return toneRef.current;
  }, []);

  // ── Play ───────────────────────────────────────────────────────────────────
  const play = useCallback(async () => {
    if (notes.length === 0) return;
    const Tone = await ensureTone();
    await Tone.start();
    setArmed(true);

    if (!playedFirstRef.current) {
      playedFirstRef.current = true;
      onFirstPlay?.();
    }

    if (!synthRef.current) {
      const Synth = Tone.Synth as new () => unknown;
      const poly = new Tone.PolySynth(Synth);
      poly.toDestination();
      poly.sync();
      synthRef.current = poly;
    }

    // Loop config — set every play so it tracks the latest `loop` value.
    Tone.Transport.loop = loopRef.current;
    Tone.Transport.loopStart = 0;
    Tone.Transport.loopEnd = totalRef.current;

    if (!scheduledRef.current) {
      Tone.Transport.cancel();
    }
    scheduleNotes(Tone, synthRef.current);

    Tone.Transport.start();
    setPlaying(true);
    startRaf();
  }, [notes.length, ensureTone, onFirstPlay, scheduleNotes, startRaf]);

  // ── Pause ──────────────────────────────────────────────────────────────────
  const pause = useCallback(() => {
    const Tone = toneRef.current;
    if (!Tone) return;
    Tone.Transport.pause();
    stopRaf();
    setPlaying(false);
  }, [stopRaf]);

  const toggle = useCallback(() => {
    if (playing) pause();
    else void play();
  }, [playing, pause, play]);

  // ── Stop (reset to 0) ──────────────────────────────────────────────────────
  const stop = useCallback(() => {
    const Tone = toneRef.current;
    stopRaf();
    if (Tone) {
      Tone.Transport.stop();
      Tone.Transport.seconds = 0;
    }
    setPlaying(false);
    setCurrentTime(0);
    setProgress(0);
  }, [stopRaf]);

  // ── Seek ───────────────────────────────────────────────────────────────────
  const seek = useCallback((fraction: number) => {
    const total = totalRef.current;
    const t = fraction * total;
    setCurrentTime(t);
    setProgress(fraction);
    const Tone = toneRef.current;
    if (!Tone) return;
    Tone.Transport.seconds = t;
  }, []);

  // ── setLoop ────────────────────────────────────────────────────────────────
  const setLoop = useCallback((next: boolean) => {
    loopRef.current = next;
    const Tone = toneRef.current;
    if (Tone) {
      Tone.Transport.loop = next;
      Tone.Transport.loopStart = 0;
      Tone.Transport.loopEnd = totalRef.current;
    }
  }, []);

  // Keep loopRef in sync if the prop changes.
  useEffect(() => {
    setLoop(loop);
  }, [loop, setLoop]);

  // ── Reset when the song (notes) changes ────────────────────────────────────
  useEffect(() => {
    scheduledRef.current = false;
    playedFirstRef.current = false;
    synthRef.current?.dispose();
    synthRef.current = null;
    setCurrentTime(0);
    setProgress(0);
    setPlaying(false);
    stopRaf();
    const Tone = toneRef.current;
    if (Tone) {
      Tone.Transport.stop();
      Tone.Transport.cancel();
      Tone.Transport.seconds = 0;
    }
  }, [notes, stopRaf]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
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

  return {
    playing,
    progress,
    currentTime,
    totalDuration,
    armed,
    ready: notes.length > 0,
    play,
    pause,
    toggle,
    stop,
    seek,
    setLoop,
  };
}
