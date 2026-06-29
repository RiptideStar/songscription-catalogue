"use client";

import { useEffect, useRef, useCallback } from "react";
import type { PreviewNote } from "@/lib/types";

/**
 * ScrollingPianoRoll — the hero visualization for the single-surface catalogue.
 *
 * Unlike the static roll, the playhead is PINNED at a fixed x (PLAYHEAD_FRAC of
 * the width) and the notes scroll leftward past it as the song plays. This is
 * the osu!/DAW "notes flow toward the bar" feel. Time maps to x relative to the
 * current playhead time; pitch maps to y. Notes light up as they cross the head.
 *
 * Driven entirely by the `progress` prop (0–1) from useSongPlayer, so it stays
 * frame-synced with audio with zero internal clock.
 */

interface ScrollingPianoRollProps {
  notes: PreviewNote[];
  color: string;
  /** 0–1 playback position. */
  progress: number;
  /** Seconds of song visible across the full width. Smaller = more zoomed in. */
  windowSeconds?: number;
  /** Dim the whole roll (e.g. idle / not playing). */
  idle?: boolean;
}

const PLAYHEAD_FRAC = 0.28; // playhead sits 28% from the left
const PITCH_PAD = 2; // semitones of headroom above/below

function isC(midi: number): boolean {
  return midi % 12 === 0;
}
function isBlack(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

function parseColorToRgb(color: string): [number, number, number] {
  const hslMatch = color.match(/hsl\(\s*([\d.]+)\s+?([\d.]+)%\s+([\d.]+)%\s*\)/);
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]) / 360;
    const s = parseFloat(hslMatch[2]) / 100;
    const l = parseFloat(hslMatch[3]) / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (t: number) => {
      const tn = ((t % 1) + 1) % 1;
      if (tn < 1 / 6) return p + (q - p) * 6 * tn;
      if (tn < 1 / 2) return q;
      if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
      return p;
    };
    return [
      Math.round(hue2rgb(h + 1 / 3) * 255),
      Math.round(hue2rgb(h) * 255),
      Math.round(hue2rgb(h - 1 / 3) * 255),
    ];
  }
  const hex = color.match(/^#?([0-9a-f]{6})$/i);
  if (hex) {
    return [
      parseInt(hex[1].slice(0, 2), 16),
      parseInt(hex[1].slice(2, 4), 16),
      parseInt(hex[1].slice(4, 6), 16),
    ];
  }
  return [202, 164, 106];
}

/**
 * A live "hit" — spawned the instant a note's onset crosses the playhead, then
 * decays over HIT_LIFE seconds. `born` is a performance.now() stamp so the
 * bloom decays on a wall clock independent of the progress-driven redraws.
 */
interface Hit {
  y: number; // lane center at spawn
  born: number; // performance.now()
  velocity: number; // drives bloom size/brightness
}

const HIT_LIFE = 0.45; // seconds a bloom stays alive

export default function ScrollingPianoRoll({
  notes,
  color,
  progress,
  windowSeconds = 6,
  idle = false,
}: ScrollingPianoRollProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rgbRef = useRef<[number, number, number]>(parseColorToRgb(color));
  const sizeRef = useRef({ w: 0, h: 0 });

  // ── Note-hit blooms ──────────────────────────────────────────────────────────
  // Discrete sparks fired the moment a note onset sweeps past the playhead. We
  // track the song time at the previous draw; any note whose onset falls in the
  // (prevT, nowT] window just crossed, so we spawn a bloom for it. A lightweight
  // self-driven RAF keeps the blooms decaying smoothly between progress updates
  // and shuts itself off once none are alive (zero idle cost).
  const hitsRef = useRef<Hit[]>([]);
  const prevTimeRef = useRef<number>(0);
  const bloomRafRef = useRef<number | null>(null);
  // Honor reduced-motion: skip the kinetic bloom entirely (the static near-
  // playhead glow already conveys the hit). Read once on mount.
  const reducedMotionRef = useRef(false);
  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Precompute pitch range once per notes set.
  const rangeRef = useRef<{ lo: number; hi: number; total: number }>({
    lo: 48,
    hi: 72,
    total: 1,
  });
  useEffect(() => {
    if (notes.length > 0) {
      const lo = Math.max(0, Math.min(...notes.map((n) => n.midi)) - PITCH_PAD);
      const hi = Math.min(127, Math.max(...notes.map((n) => n.midi)) + PITCH_PAD);
      const total = Math.max(...notes.map((n) => n.time + n.duration), 0.1);
      rangeRef.current = { lo, hi, total };
    }
  }, [notes]);

  useEffect(() => {
    rgbRef.current = parseColorToRgb(color);
  }, [color]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio ?? 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;

    if (sizeRef.current.w !== w || sizeRef.current.h !== h) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      sizeRef.current = { w, h };
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const [r, g, b] = rgbRef.current;
    const { lo, hi, total } = rangeRef.current;
    const span = hi - lo + 1;
    const laneH = h / span;
    const pitchToY = (midi: number) => (hi - midi) * laneH;

    const playheadX = w * PLAYHEAD_FRAC;
    const nowT = progress * total;
    const pxPerSec = w / windowSeconds;
    // x for a note at absolute time t: playhead + (t - now) * pxPerSec
    const timeToX = (t: number) => playheadX + (t - nowT) * pxPerSec;

    // ── Detect note onsets that crossed the playhead since the last draw ─────────
    // Spawn a bloom for each. Skip when idle (no playback) or when the clock
    // jumped backward (loop wrap / seek) to avoid a burst of false hits.
    if (!idle && !reducedMotionRef.current) {
      const prevT = prevTimeRef.current;
      const advanced = nowT > prevT && nowT - prevT < 1; // small forward step only
      if (advanced) {
        const span = hi - lo + 1;
        const laneH = h / span;
        for (const note of notes) {
          if (note.time > prevT && note.time <= nowT) {
            hitsRef.current.push({
              y: (hi - note.midi) * laneH + laneH / 2,
              born: performance.now(),
              velocity: note.velocity,
            });
          }
        }
      }
    }
    prevTimeRef.current = nowT;

    // ── Background ──
    ctx.fillStyle = "#14110d";
    ctx.fillRect(0, 0, w, h);

    // ── Pitch lanes ──
    for (let midi = lo; midi <= hi; midi++) {
      const y = pitchToY(midi);
      if (isBlack(midi)) ctx.fillStyle = "rgba(0,0,0,0.30)";
      else if (isC(midi)) ctx.fillStyle = `rgba(${r},${g},${b},0.05)`;
      else ctx.fillStyle = "rgba(255,255,255,0.015)";
      ctx.fillRect(0, y, w, laneH + 0.5);
    }

    // ── Octave gridlines ──
    for (let midi = lo; midi <= hi; midi++) {
      if (isC(midi)) {
        const y = pitchToY(midi) + laneH;
        ctx.strokeStyle = `rgba(${r},${g},${b},0.12)`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }

    // ── Notes ──
    const noteH = Math.max(2, laneH - 1.5);
    const dimMul = idle ? 0.45 : 1;
    for (const note of notes) {
      const x = timeToX(note.time);
      const noteW = Math.max(4, note.duration * pxPerSec - 1);
      if (x + noteW < 0 || x > w) continue; // cull offscreen
      const y = pitchToY(note.midi) + 0.75;

      // A note is *sounding* when the playhead sits inside its bar — held for the
      // note's full duration. Sounding notes get a sustained bright highlight (a
      // lit white core + glow), so a long held note stays lit until it releases.
      const sounding =
        !idle && x <= playheadX && x + noteW >= playheadX;

      // Notes near/under the playhead glow brighter ("hit" feel).
      const dist = Math.abs(x - playheadX);
      const hot = Math.max(0, 1 - dist / (pxPerSec * 0.5)); // within ~0.5s
      const baseAlpha = (0.5 + note.velocity * 0.4) * dimMul;
      const alpha = Math.min(1, baseAlpha + hot * 0.4 * dimMul);

      const radius = Math.min(3, noteH / 2, noteW / 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.roundRect(x, y, noteW, noteH, radius);
      ctx.fill();

      // Sustained highlight while the note is sounding: brighten the whole bar
      // toward white and lay a glow under it. Persists for the note's duration.
      if (sounding) {
        ctx.save();
        ctx.shadowColor = `rgba(${r},${g},${b},0.85)`;
        ctx.shadowBlur = 16;
        // Lit fill: blend the note color up toward white for a "key pressed" look.
        const lr = Math.round(r + (255 - r) * 0.45);
        const lg = Math.round(g + (255 - g) * 0.45);
        const lb = Math.round(b + (255 - b) * 0.45);
        ctx.fillStyle = `rgba(${lr},${lg},${lb},${(0.95 * dimMul).toFixed(2)})`;
        ctx.beginPath();
        ctx.roundRect(x, y, noteW, noteH, radius);
        ctx.fill();
        ctx.restore();

        // Crisp leading edge at the playhead — the part being "struck" right now.
        const edgeW = Math.min(noteW, 3);
        ctx.fillStyle = `rgba(255,255,255,${(0.9 * dimMul).toFixed(2)})`;
        ctx.beginPath();
        ctx.roundRect(playheadX - edgeW / 2, y, edgeW, noteH, radius);
        ctx.fill();
      }

      // Glow halo for hot notes.
      if (hot > 0.15 && !idle) {
        ctx.save();
        ctx.shadowColor = `rgba(${r},${g},${b},${(hot * 0.8).toFixed(2)})`;
        ctx.shadowBlur = 10 * hot;
        ctx.fillStyle = `rgba(${r},${g},${b},${(hot * 0.5).toFixed(2)})`;
        ctx.beginPath();
        ctx.roundRect(x, y, noteW, noteH, radius);
        ctx.fill();
        ctx.restore();
      }
    }

    // ── Note-hit blooms ──
    // A radial flash pinned at the playhead, expanding + fading over HIT_LIFE.
    // Drawn additively so overlapping hits stack into a brighter pulse.
    if (hitsRef.current.length > 0) {
      const now = performance.now();
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const alive: Hit[] = [];
      for (const hit of hitsRef.current) {
        const age = (now - hit.born) / 1000;
        if (age >= HIT_LIFE) continue;
        alive.push(hit);
        const t = age / HIT_LIFE; // 0→1 over the life
        const ease = 1 - (1 - t) * (1 - t); // ease-out
        const fade = 1 - t; // linear opacity falloff
        const maxR = (14 + hit.velocity * 26) * (0.6 + 0.4 * (h / 320));
        const radius = maxR * (0.25 + 0.75 * ease);

        // Radial bloom centered on the playhead at the note's lane.
        const grd = ctx.createRadialGradient(
          playheadX, hit.y, 0,
          playheadX, hit.y, radius,
        );
        const core = (0.55 * fade).toFixed(3);
        grd.addColorStop(0, `rgba(255,255,255,${(0.5 * fade).toFixed(3)})`);
        grd.addColorStop(0.35, `rgba(${r},${g},${b},${core})`);
        grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(playheadX, hit.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // A bright spark dot at the impact point that pops then shrinks.
        const dotR = Math.max(1.5, (3.5 + hit.velocity * 3) * (1 - ease * 0.6));
        ctx.fillStyle = `rgba(255,255,255,${(0.9 * fade).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(playheadX, hit.y, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      hitsRef.current = alive;
    }

    // ── Playhead ──
    if (!idle) {
      // Soft glow column
      const grd = ctx.createLinearGradient(playheadX - 24, 0, playheadX + 8, 0);
      grd.addColorStop(0, "rgba(0,0,0,0)");
      grd.addColorStop(1, `rgba(${r},${g},${b},0.10)`);
      ctx.fillStyle = grd;
      ctx.fillRect(playheadX - 24, 0, 32, h);

      ctx.strokeStyle = `rgba(${r},${g},${b},0.9)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255,255,255,0.5)`;
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();
    }
  }, [notes, progress, windowSeconds, idle]);

  // Redraw on every progress change (driven by parent RAF via useSongPlayer).
  // After drawing, if any blooms are still alive, run a short self-driven RAF so
  // they keep decaying smoothly even between progress updates (and after the song
  // ends / pauses). The loop shuts itself off the moment no blooms remain.
  useEffect(() => {
    draw();

    if (bloomRafRef.current !== null) return; // a decay loop is already running
    const step = () => {
      if (hitsRef.current.length === 0) {
        bloomRafRef.current = null;
        return;
      }
      draw();
      bloomRafRef.current = requestAnimationFrame(step);
    };
    if (hitsRef.current.length > 0) {
      bloomRafRef.current = requestAnimationFrame(step);
    }
    return () => {
      if (bloomRafRef.current !== null) {
        cancelAnimationFrame(bloomRafRef.current);
        bloomRafRef.current = null;
      }
    };
  }, [draw]);

  // Redraw on resize.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      sizeRef.current = { w: 0, h: 0 }; // force re-measure
      draw();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full"
      aria-label="Scrolling piano roll"
      role="img"
    />
  );
}
