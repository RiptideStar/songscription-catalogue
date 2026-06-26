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
  play: () => void;
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scheduledRef = useRef(false);
  const playedFirstRef = useRef(false);
  const loopRef = useRef(loop);

  // Wall-clock anchor for the VISUAL scroll. The roll animates from this clock,
  // decoupled from audio, so hover-preview always scrolls even before the
  // browser unlocks the AudioContext. `elapsedAt` is seconds-into-song captured
  // at the last pause/seek; `startedAt` is the performance.now() when we resumed.
  const startedAtRef = useRef(0);
  const elapsedAtRef = useRef(0);
  const audioRef = useRef(false); // is Tone audio actually running right now

  const totalDuration =
    notes.length > 0
      ? Math.max(...notes.map((n) => n.time + n.duration), 0.1)
      : 0;
  const totalRef = useRef(totalDuration);
  totalRef.current = totalDuration;

  // ── Visual clock ─────────────────────────────────────────────────────────────
  // Driven by a WALL CLOCK (performance.now), decoupled from audio, so the roll
  // scrolls even before the AudioContext unlocks. We drive it with BOTH a
  // setInterval (authoritative — keeps ticking even when the tab is backgrounded
  // and requestAnimationFrame is suspended) AND rAF (for buttery-smooth updates
  // while the tab is visible). One shared `tick` reads the clock and updates
  // state; both drivers just call it.
  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startRaf = useCallback(() => {
    const tick = () => {
      const total = totalRef.current || 1;
      const now = performance.now();
      let elapsed = elapsedAtRef.current + (now - startedAtRef.current) / 1000;

      if (loopRef.current) {
        elapsed = elapsed % total;
        setCurrentTime(elapsed);
        setProgress(elapsed / total);
        return;
      }

      if (elapsed >= total) {
        // End of song (non-loop): stop cleanly, reset to start.
        const Tone = toneRef.current;
        if (Tone) {
          Tone.Transport.stop();
          Tone.Transport.seconds = 0;
        }
        audioRef.current = false;
        elapsedAtRef.current = 0;
        setCurrentTime(0);
        setProgress(0);
        setPlaying(false);
        stopRaf();
        return;
      }

      setCurrentTime(elapsed);
      setProgress(elapsed / total);
    };

    const rafLoop = () => {
      tick();
      rafRef.current = requestAnimationFrame(rafLoop);
    };

    stopRaf();
    // Authoritative ticker (survives tab backgrounding).
    intervalRef.current = setInterval(tick, 60);
    // Smoothness layer while visible.
    rafRef.current = requestAnimationFrame(rafLoop);
  }, [stopRaf]);

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

  // Best-effort: bring up Tone audio and align it to the visual clock. Safe to
  // call repeatedly; resolves silently if the browser still blocks audio.
  const tryStartAudio = useCallback(async () => {
    try {
      const Tone = await ensureTone();
      await Tone.start();
      if (Tone.Transport.state === "started" && audioRef.current) return;
      setArmed(true);

      if (!synthRef.current) {
        const Synth = Tone.Synth as new () => unknown;
        const poly = new Tone.PolySynth(Synth);
        poly.toDestination();
        poly.sync();
        synthRef.current = poly;
      }

      Tone.Transport.loop = loopRef.current;
      Tone.Transport.loopStart = 0;
      Tone.Transport.loopEnd = totalRef.current;

      if (!scheduledRef.current) Tone.Transport.cancel();
      scheduleNotes(Tone, synthRef.current);

      // Align audio to where the visual clock currently is.
      const now = performance.now();
      const elapsed = elapsedAtRef.current + (now - startedAtRef.current) / 1000;
      Tone.Transport.seconds = loopRef.current
        ? elapsed % (totalRef.current || 1)
        : Math.min(elapsed, totalRef.current);
      Tone.Transport.start();
      audioRef.current = true;
    } catch {
      // Audio still locked — visual keeps running; we retry on next play/gesture.
    }
  }, [ensureTone, scheduleNotes]);

  // ── Play ───────────────────────────────────────────────────────────────────
  // Starts the VISUAL immediately (no await), then layers audio in best-effort.
  const play = useCallback(() => {
    if (notes.length === 0) return;

    // Anchor the wall clock and start the scroll right now — no gesture needed.
    startedAtRef.current = performance.now();
    setPlaying(true);
    startRaf();

    if (!playedFirstRef.current) {
      playedFirstRef.current = true;
      onFirstPlay?.();
    }

    // Audio is best-effort and never blocks the visual.
    void tryStartAudio();
  }, [notes.length, onFirstPlay, startRaf, tryStartAudio]);

  // ── Pause ──────────────────────────────────────────────────────────────────
  const pause = useCallback(() => {
    // Freeze the wall clock: remember elapsed so resume continues from here.
    const now = performance.now();
    elapsedAtRef.current =
      elapsedAtRef.current + (now - startedAtRef.current) / 1000;
    stopRaf();
    const Tone = toneRef.current;
    if (Tone) Tone.Transport.pause();
    audioRef.current = false;
    setPlaying(false);
  }, [stopRaf]);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, pause, play]);

  // ── Stop (reset to 0) ──────────────────────────────────────────────────────
  const stop = useCallback(() => {
    stopRaf();
    elapsedAtRef.current = 0;
    const Tone = toneRef.current;
    if (Tone) {
      Tone.Transport.stop();
      Tone.Transport.seconds = 0;
    }
    audioRef.current = false;
    setPlaying(false);
    setCurrentTime(0);
    setProgress(0);
  }, [stopRaf]);

  // ── Seek ───────────────────────────────────────────────────────────────────
  const seek = useCallback((fraction: number) => {
    const total = totalRef.current;
    const t = fraction * total;
    // Re-anchor the wall clock to the seeked position.
    elapsedAtRef.current = t;
    startedAtRef.current = performance.now();
    setCurrentTime(t);
    setProgress(fraction);
    const Tone = toneRef.current;
    if (Tone) Tone.Transport.seconds = t;
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
    audioRef.current = false;
    elapsedAtRef.current = 0;
    startedAtRef.current = performance.now();
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

  // ── Tab-visibility resilience ────────────────────────────────────────────────
  // requestAnimationFrame is throttled/suspended while the tab is hidden, which
  // would freeze the visual clock and desync it from the audio. When the tab
  // returns, re-anchor the wall clock to Tone's actual position (if audio is
  // running) and restart the RAF so the playhead resumes smoothly in sync.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!playing) return;
      const Tone = toneRef.current;
      if (Tone && audioRef.current) {
        elapsedAtRef.current = Tone.Transport.seconds;
      }
      startedAtRef.current = performance.now();
      startRaf();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [playing, startRaf]);

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
