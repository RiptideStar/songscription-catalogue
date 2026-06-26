"use client";

/**
 * Hero — the dominant left panel (~70% of screen) of the osu!-style catalogue.
 *
 * Shows the active song as a big scrolling piano roll with a transport bar
 * underneath. Metadata is intentionally minimal — a whisper. The vibe is
 * "lamplit practice room at night."
 *
 * Modes:
 *   - Preview (committed=false): auto-loops the active song; audio comes in
 *     after the user's first gesture (browser autoplay gating).
 *   - Practice (committed=true): loops stop, PracticePlaceholder appears.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { Transcription } from "@/lib/types";
import { useMidiNotes } from "@/components/detail/useMidiNotes";
import { useSongPlayer } from "@/components/player/useSongPlayer";
import ScrollingPianoRoll from "@/components/player/ScrollingPianoRoll";
import PracticePlaceholder from "@/components/detail/PracticePlaceholder";
import { formatDuration, midiNoteName, hexToRgba } from "@/lib/format";

// ── Props ──────────────────────────────────────────────────────────────────────

interface HeroProps {
  song: Transcription | null;
  midiUrl: string | null;
  committed: boolean;
  totalCount: number;
  onUpdate: (updated: Transcription) => void;
  onPractice: () => void;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Five filled/outline dots for difficulty 1–5. */
function DifficultyDots({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`Difficulty ${value} of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            background: i < value ? "#caa46a" : "rgba(202,164,106,0.2)",
          }}
        />
      ))}
    </span>
  );
}

/** Loading shimmer for the roll while MIDI is fetching. */
function RollShimmer() {
  return (
    <div
      className="h-full w-full rounded-lg overflow-hidden"
      style={{ background: "#14110d" }}
      aria-busy="true"
      aria-label="Loading piano roll"
    >
      <div className="h-full w-full animate-pulse">
        {/* Fake note rows */}
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="absolute left-0 right-0"
            style={{
              top: `${8 + i * 7.5}%`,
              height: "5%",
              opacity: 0.07 + (i % 3) * 0.03,
            }}
          >
            <div
              className="h-full rounded"
              style={{
                marginLeft: `${10 + (i * 17) % 60}%`,
                width: `${8 + (i * 11) % 25}%`,
                background: "rgba(202,164,106,0.5)",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Centered hint panel inside the empty roll area. */
function EmptyCanvas({ totalCount }: { totalCount: number }) {
  if (totalCount > 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="font-serif text-xl text-ivory-dim/60 select-none">
          Hover a song to preview it
        </p>
      </div>
    );
  }

  // Truly empty library — warm invitation.
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 px-8 text-center">
      {/* Decorative idle "keys" strip */}
      <div className="flex h-1 w-48 overflow-hidden rounded-full opacity-20" aria-hidden>
        {Array.from({ length: 32 }).map((_, i) => (
          <div
            key={i}
            className="flex-1"
            style={{
              background:
                [1, 3, 6, 8, 10].includes(i % 12)
                  ? "rgba(202,164,106,0.6)"
                  : "rgba(236,228,211,0.4)",
            }}
          />
        ))}
      </div>

      <h2
        className="font-serif text-4xl font-light tracking-tight text-ivory/40"
        style={{ textShadow: "0 0 40px rgba(202,164,106,0.15)" }}
      >
        Your stage is empty
      </h2>
      <p className="max-w-sm text-sm leading-relaxed text-ivory-dim/40">
        Upload a MIDI file to begin — your transcriptions will appear here as a
        scrolling piano roll.
      </p>
      <p className="text-xs text-ivory-dim/30">
        Upload a song from the panel on the right →
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Hero({
  song,
  midiUrl,
  committed,
  totalCount,
  onUpdate,
  onPractice,
}: HeroProps) {
  // ── MIDI notes ──────────────────────────────────────────────────────────────
  const { notes, loading: midiLoading, error: midiError } = useMidiNotes(
    midiUrl ?? "",
  );

  // ── Playback ────────────────────────────────────────────────────────────────
  // Preview = loop; practice = no loop.
  const loop = !committed;

  // onFirstPlay: record a play count (fire-and-forget).
  const recordPlay = useCallback(() => {
    if (!song) return;
    fetch(`/api/transcriptions/${song.id}/play`, { method: "POST" }).catch(
      () => {},
    );
  }, [song]);

  const player = useSongPlayer({ notes, loop, onFirstPlay: recordPlay });

  // ── Auto-play when song changes in preview mode ─────────────────────────────
  const prevSongIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!song || committed) return;
    if (song.id === prevSongIdRef.current) return;
    prevSongIdRef.current = song.id;

    // Attempt autoplay; browsers may block audio until first gesture — that's
    // fine, the roll still animates visually. We swallow the rejection.
    void player.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.id, committed]);

  // ── Stop looping when committed flips true ──────────────────────────────────
  const prevCommittedRef = useRef(committed);
  useEffect(() => {
    if (committed && !prevCommittedRef.current) {
      player.pause();
    }
    prevCommittedRef.current = committed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committed]);

  // ── Favorite toggle (optimistic) ────────────────────────────────────────────
  const [optimisticFav, setOptimisticFav] = useState<boolean | null>(null);
  // Reset optimistic state when song changes.
  useEffect(() => {
    setOptimisticFav(null);
  }, [song?.id]);

  const isFav = optimisticFav ?? song?.is_favorite ?? false;

  const handleFavorite = useCallback(async () => {
    if (!song) return;
    const next = !isFav;
    setOptimisticFav(next);
    try {
      const res = await fetch(`/api/transcriptions/${song.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: next }),
      });
      if (res.ok) {
        const row = (await res.json()) as Transcription;
        onUpdate(row);
        setOptimisticFav(null); // server value confirmed
      } else {
        setOptimisticFav(null); // revert
      }
    } catch {
      setOptimisticFav(null); // revert
    }
  }, [song, isFav, onUpdate]);

  // ── Seek bar handler ─────────────────────────────────────────────────────────
  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      player.seek(parseFloat(e.target.value));
    },
    [player],
  );

  // ── One-time audio unlock ────────────────────────────────────────────────────
  // Browsers block the AudioContext until a user gesture, so the very first
  // hover-autoplay is silent. On the first interaction anywhere, arm audio and
  // (re)start the current preview so sound kicks in. Every later hover then
  // plays with sound automatically.
  useEffect(() => {
    if (player.armed) return;
    const unlock = () => {
      if (!committed && notes.length > 0) {
        void player.play().catch(() => {});
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.armed, committed, notes.length]);

  // ── Spacebar = play / pause ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      // Don't hijack the spacebar while typing in the search box etc.
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      if (notes.length === 0) return;
      e.preventDefault();
      player.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.toggle, notes.length]);

  // ── Glow colour (derived from song.color) ───────────────────────────────────
  const glowColor = song?.color ?? "#caa46a";
  const glowShadow = `0 0 60px ${hexToRgba(glowColor, 0.18)}, 0 0 120px ${hexToRgba(glowColor, 0.08)}`;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="relative flex h-full flex-col bg-room"
      style={{ background: "#16130f" }}
    >
      {/* ── 1. Header strip ──────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-start justify-between gap-4 px-6 pt-5 pb-3">
        <div className="min-w-0 flex-1">
          {song ? (
            <>
              <h1
                className="truncate font-serif text-3xl font-light leading-tight text-ivory lg:text-4xl"
                style={{
                  textShadow: `0 0 24px ${hexToRgba(glowColor, 0.45)}`,
                }}
              >
                {song.title}
              </h1>

              {/* Whisper stat strip */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-xs tabular-nums text-ivory-dim/60">
                  {formatDuration(song.duration_sec)}
                </span>
                {song.key_sig && (
                  <span className="font-mono text-xs text-ivory-dim/50">
                    {song.key_sig}
                  </span>
                )}
                {song.tempo_bpm !== null && (
                  <span className="font-mono text-xs tabular-nums text-ivory-dim/50">
                    {song.tempo_bpm} BPM
                  </span>
                )}
                {song.lowest_note !== null && song.highest_note !== null && (
                  <span className="font-mono text-xs text-ivory-dim/40">
                    {midiNoteName(song.lowest_note)}–{midiNoteName(song.highest_note)}
                  </span>
                )}
                <DifficultyDots value={song.difficulty} />
              </div>
            </>
          ) : (
            <div className="h-8 w-40 rounded animate-pulse bg-room-raised" />
          )}
        </div>

        {/* Favorite star */}
        {song && (
          <button
            type="button"
            onClick={handleFavorite}
            className="shrink-0 rounded-full p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
            style={{ color: isFav ? "#caa46a" : "rgba(168,158,140,0.4)" }}
            aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
          >
            <svg
              viewBox="0 0 24 24"
              fill={isFav ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={1.5}
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
              />
            </svg>
          </button>
        )}
      </header>

      {/* ── Autoplay sound hint (dismisses on first interaction) ─────────────── */}
      {song && !player.armed && !committed && (
        <div
          className="mx-6 mb-1 flex shrink-0 items-center gap-2 rounded-md border border-room-line bg-room-raised/50 px-3 py-1.5"
          aria-live="polite"
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-3.5 w-3.5 shrink-0 text-brass/60"
          >
            <path d="M10 2a.75.75 0 01.75.75v.258a33.186 33.186 0 016.668 1.478.75.75 0 11-.483 1.42A31.621 31.621 0 0010 4.513a31.63 31.63 0 00-6.935 1.393.75.75 0 01-.484-1.42 33.186 33.186 0 016.669-1.478V2.75A.75.75 0 0110 2zM10 7c-.456 0-.908.012-1.357.034a.75.75 0 01-.088-1.497A26.82 26.82 0 0110 5.5c.497 0 .99.013 1.478.036a.75.75 0 01-.088 1.497A25.32 25.32 0 0010 7zm-4.5 2.25a.75.75 0 01.75.75v.034a25.5 25.5 0 007.5 0V10a.75.75 0 011.5 0v.277a.75.75 0 01-.627.74 27 27 0 01-9.246 0A.75.75 0 014.75 10.277V10a.75.75 0 01.75-.75z" />
          </svg>
          <p className="text-xs text-ivory-dim/50">
            Click anywhere to enable sound
          </p>
        </div>
      )}

      {/* ── 2. Piano roll (dominant) ──────────────────────────────────────────── */}
      <div className="relative mx-5 mb-3 flex min-h-0 flex-1 flex-col">
        <div
          className="relative h-full w-full overflow-hidden rounded-xl border border-room-line/60"
          style={{ boxShadow: song ? glowShadow : undefined }}
          role="img"
          aria-label={song ? `Piano roll for ${song.title}` : "Empty piano roll"}
        >
          {/* No song at all */}
          {!song && (
            <div
              className="h-full w-full"
              style={{ background: "#14110d" }}
            >
              <EmptyCanvas totalCount={totalCount} />
            </div>
          )}

          {/* Song active: show roll or states */}
          {song && (
            <>
              {midiLoading && <RollShimmer />}

              {!midiLoading && midiError && (
                <div
                  className="flex h-full w-full items-center justify-center"
                  style={{ background: "#14110d" }}
                >
                  <p className="text-center text-sm text-ivory-dim/40 max-w-xs">
                    Could not load MIDI.{" "}
                    <span className="text-ivory-dim/30">{midiError}</span>
                  </p>
                </div>
              )}

              {!midiLoading && !midiError && (
                <ScrollingPianoRoll
                  notes={notes}
                  color={song.color}
                  progress={player.progress}
                  windowSeconds={6}
                  idle={!player.playing || committed}
                />
              )}

              {/* Practice overlay */}
              {committed && !midiLoading && !midiError && (
                <div className="absolute inset-0 flex flex-col items-stretch justify-end bg-room/70 backdrop-blur-[2px] transition-all">
                  {/* Dimmed roll stays visible through backdrop */}
                  <div className="p-4">
                    <PracticePlaceholder />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── 3. Transport bar ──────────────────────────────────────────────────── */}
      {song && (
        <div className="mx-5 mb-3 flex shrink-0 flex-col gap-2 rounded-xl border border-room-line/60 bg-room-raised px-4 py-3">
          {/* Seek bar */}
          <div className="flex items-center gap-3">
            <span
              className="font-mono text-xs tabular-nums text-ivory-dim/60 w-10 text-right"
              aria-label="Current time"
            >
              {formatDuration(player.currentTime)}
            </span>

            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={player.progress}
              onChange={handleSeek}
              aria-label="Seek"
              className="
                min-w-0 flex-1 h-1 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:w-3
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-brass
                focus-visible:outline-none
                focus-visible:ring-2
                focus-visible:ring-brass/50
              "
              style={{
                background: `linear-gradient(to right, ${hexToRgba(glowColor, 0.7)} ${player.progress * 100}%, rgba(44,37,28,0.8) ${player.progress * 100}%)`,
              }}
            />

            <span
              className="font-mono text-xs tabular-nums text-ivory-dim/40 w-10"
              aria-label="Total duration"
            >
              {formatDuration(player.totalDuration > 0 ? player.totalDuration : song.duration_sec)}
            </span>
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-between">
            {/* Loop indicator */}
            <div className="flex items-center gap-1.5">
              <span
                className="text-xs font-mono"
                style={{ color: loop ? "rgba(202,164,106,0.7)" : "rgba(168,158,140,0.35)" }}
                aria-label={loop ? "Looping" : "Loop off"}
                title={loop ? "Auto-loop active" : "No loop"}
              >
                ⟳
              </span>
              <span className="text-xs text-ivory-dim/30">
                {committed ? "practice" : "preview"}
              </span>
            </div>

            {/* Play / Pause button */}
            <button
              type="button"
              onClick={player.toggle}
              disabled={notes.length === 0 && !midiLoading}
              className="
                flex h-11 w-11 items-center justify-center rounded-full
                border border-brass/30 bg-brass/10
                text-brass transition-colors
                hover:bg-brass/20 hover:border-brass/50
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass
                disabled:cursor-not-allowed disabled:opacity-30
              "
              aria-label={player.playing ? "Pause" : "Play"}
            >
              {player.playing ? (
                // Pause icon
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                // Play icon
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>

            {/* Note range whisper */}
            <div className="text-right">
              <span className="font-mono text-xs text-ivory-dim/30">
                {song.note_count.toLocaleString()} notes
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── 4. Practice CTA ───────────────────────────────────────────────────── */}
      {song && !committed && (
        <div className="mx-5 mb-5 shrink-0">
          <button
            type="button"
            onClick={onPractice}
            className="
              w-full rounded-xl border border-brass/25 bg-brass/8 py-3
              font-serif text-base font-light tracking-wide text-brass/80
              transition-all
              hover:border-brass/40 hover:bg-brass/14 hover:text-brass
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass
              active:scale-[0.99]
            "
            style={{
              boxShadow: `0 0 20px ${hexToRgba(glowColor, 0.06)}`,
            }}
          >
            Practice this piece →
          </button>
        </div>
      )}

      {/* Exit practice mode link */}
      {song && committed && (
        <div className="mx-5 mb-5 shrink-0 text-center">
          <p className="text-xs text-ivory-dim/30">
            Hover another song on the right to resume preview
          </p>
        </div>
      )}
    </div>
  );
}
