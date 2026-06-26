"use client";

import { useEffect, useRef, useCallback } from "react";
import type { PreviewNote } from "@/lib/types";

interface PianoRollProps {
  notes: PreviewNote[];
  /** HSL/hex/named color accent for the song */
  color: string;
  /** Playhead position 0–1; undefined = no playhead */
  progress?: number;
}

const SEMITONE_HEIGHT = 5; // px per semitone at 1x scale
const KEY_GUTTER_WIDTH = 28; // px for the piano-key strip on the left
const MIN_NOTE_WIDTH = 3; // px minimum note rect width

/** Is this midi number a "C" (root of octave)? */
function isC(midi: number): boolean {
  return midi % 12 === 0;
}

/** Is this midi number a black key? */
function isBlack(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

/**
 * Parse any CSS color string into an rgb triple so we can compose rgba() values.
 * Falls back to a warm amber if parsing fails.
 */
function parseColorToRgb(color: string): [number, number, number] {
  // Handles hsl(...) — let the browser convert via a hidden element trick isn't
  // available in canvas context, so we use a simple approximation for hsl.
  const hslMatch = color.match(/hsl\(\s*([\d.]+)\s+?([\d.]+)%\s+([\d.]+)%\s*\)/);
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]) / 360;
    const s = parseFloat(hslMatch[2]) / 100;
    const l = parseFloat(hslMatch[3]) / 100;
    // HSL → RGB conversion
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (t: number) => {
      const tNorm = ((t % 1) + 1) % 1;
      if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
      if (tNorm < 1 / 2) return q;
      if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
      return p;
    };
    return [
      Math.round(hue2rgb(h + 1 / 3) * 255),
      Math.round(hue2rgb(h) * 255),
      Math.round(hue2rgb(h - 1 / 3) * 255),
    ];
  }
  // Hex color
  const hexMatch = color.match(/^#?([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
      ];
    }
    if (hex.length >= 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
  }
  // Fallback: warm amber
  return [202, 164, 106];
}

export default function PianoRoll({ notes, color, progress }: PianoRollProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Cache parsed color across renders
  const rgbRef = useRef<[number, number, number]>(parseColorToRgb(color));

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio ?? 1;
    const cssWidth = canvas.clientWidth;
    if (cssWidth === 0) return;

    // Determine pitch range from notes (with sensible fallbacks)
    let loNote = 36; // C2
    let hiNote = 84; // C6
    if (notes.length > 0) {
      loNote = Math.max(0, Math.min(...notes.map((n) => n.midi)) - 3);
      hiNote = Math.min(127, Math.max(...notes.map((n) => n.midi)) + 3);
    }
    const pitchSpan = hiNote - loNote + 1;
    const cssHeight = Math.max(80, pitchSpan * SEMITONE_HEIGHT + 8);

    // Size canvas for retina
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const [r, g, b] = rgbRef.current;
    const rollWidth = cssWidth - KEY_GUTTER_WIDTH;

    // Total song duration for time → x mapping
    const totalDuration = notes.length > 0 ? Math.max(...notes.map((n) => n.time + n.duration)) : 1;

    const timeToX = (t: number) => KEY_GUTTER_WIDTH + (t / totalDuration) * rollWidth;
    const pitchToY = (midi: number) => (hiNote - midi) * SEMITONE_HEIGHT;

    // ── Background ──────────────────────────────────────────────────────
    ctx.fillStyle = "#1a1612";
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // ── Horizontal pitch lanes (alternating warm stripes) ────────────────
    for (let midi = loNote; midi <= hiNote; midi++) {
      const y = pitchToY(midi);
      if (isBlack(midi)) {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
      } else if (isC(midi)) {
        ctx.fillStyle = `rgba(${r},${g},${b},0.06)`;
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.02)";
      }
      ctx.fillRect(KEY_GUTTER_WIDTH, y, rollWidth, SEMITONE_HEIGHT);
    }

    // ── Octave grid lines ────────────────────────────────────────────────
    for (let midi = loNote; midi <= hiNote; midi++) {
      if (isC(midi)) {
        const y = pitchToY(midi) + SEMITONE_HEIGHT; // line at bottom of C
        ctx.strokeStyle = `rgba(${r},${g},${b},0.2)`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(KEY_GUTTER_WIDTH, y);
        ctx.lineTo(cssWidth, y);
        ctx.stroke();
      }
    }

    // ── Piano key gutter ─────────────────────────────────────────────────
    for (let midi = loNote; midi <= hiNote; midi++) {
      const y = pitchToY(midi);
      const black = isBlack(midi);
      const c = isC(midi);

      // White or black key background
      ctx.fillStyle = black ? "#2a2420" : c ? "#3a3028" : "#252220";
      ctx.fillRect(0, y, KEY_GUTTER_WIDTH - 2, SEMITONE_HEIGHT);

      // C label
      if (c) {
        const octave = Math.floor(midi / 12) - 1;
        ctx.fillStyle = `rgba(${r},${g},${b},0.7)`;
        ctx.font = `bold ${Math.max(7, SEMITONE_HEIGHT - 1)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(`C${octave}`, KEY_GUTTER_WIDTH - 4, y + SEMITONE_HEIGHT / 2);
      }

      // Right border of gutter
      ctx.strokeStyle = `rgba(${r},${g},${b},0.15)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(KEY_GUTTER_WIDTH - 1, y);
      ctx.lineTo(KEY_GUTTER_WIDTH - 1, y + SEMITONE_HEIGHT);
      ctx.stroke();
    }

    // ── Note rects ───────────────────────────────────────────────────────
    const noteH = Math.max(2, SEMITONE_HEIGHT - 1);
    for (const note of notes) {
      if (note.midi < loNote || note.midi > hiNote) continue;
      const x = timeToX(note.time);
      const w = Math.max(MIN_NOTE_WIDTH, (note.duration / totalDuration) * rollWidth - 1);
      const y = pitchToY(note.midi) + 0.5;
      const alpha = 0.55 + note.velocity * 0.45;

      ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
      // Rounded rect
      const radius = Math.min(2, noteH / 2, w / 2);
      ctx.beginPath();
      ctx.roundRect(x, y, w, noteH, radius);
      ctx.fill();
    }

    // ── Playhead ─────────────────────────────────────────────────────────
    if (progress !== undefined && progress >= 0 && progress <= 1) {
      const px = KEY_GUTTER_WIDTH + progress * rollWidth;
      ctx.strokeStyle = "#fff";
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, cssHeight);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Playhead glow
      ctx.strokeStyle = `rgba(${r},${g},${b},0.5)`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, cssHeight);
      ctx.stroke();
    }
    // `color` intentionally omitted: draw() reads the parsed rgb from rgbRef,
    // which is refreshed by the effect below before redrawing on color change.
  }, [notes, progress]);

  // Redraw whenever inputs change
  useEffect(() => {
    rgbRef.current = parseColorToRgb(color);
    draw();
  }, [draw, color]);

  // Redraw on container resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  if (notes.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 rounded-lg bg-neutral-900/60 border border-neutral-800/40 text-neutral-600 text-sm font-sans">
        No notes to display
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-lg block"
      style={{ imageRendering: "pixelated" }}
      aria-label="Piano roll visualization"
      role="img"
    />
  );
}
