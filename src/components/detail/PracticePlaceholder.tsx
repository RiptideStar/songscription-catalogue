/**
 * PracticePlaceholder — a polished stand-in for the full practice engine.
 * The interactive piano roll and real practice mode would live here.
 * This reads as intentional design, not an unfinished stub.
 */
export default function PracticePlaceholder() {
  return (
    <section
      aria-label="Practice mode — coming soon"
      className="relative overflow-hidden rounded-xl border border-neutral-800/60 bg-neutral-900/50"
    >
      {/* Decorative mock keyboard strip */}
      <div className="flex h-1.5 w-full overflow-hidden" aria-hidden>
        {Array.from({ length: 52 }).map((_, i) => {
          const noteInOctave = i % 7;
          // Approximate black keys between white keys
          const isBlackGap = noteInOctave === 1 || noteInOctave === 3;
          return (
            <div
              key={i}
              className="flex-1 border-r border-neutral-950/80"
              style={{
                background: isBlackGap
                  ? "rgba(202,164,106,0.25)"
                  : "rgba(255,255,255,0.06)",
              }}
            />
          );
        })}
      </div>

      <div className="px-6 py-8">
        {/* Mock staff lines */}
        <div className="relative mb-6 h-10 overflow-hidden" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="absolute left-0 right-0 h-px bg-neutral-700/50"
              style={{ top: `${8 + i * 7}px` }}
            />
          ))}
          {/* A few mock note heads */}
          {[
            { left: "12%", top: "4px" },
            { left: "28%", top: "11px" },
            { left: "44%", top: "18px" },
            { left: "60%", top: "11px" },
            { left: "76%", top: "25px" },
          ].map(({ left, top }, i) => (
            <div
              key={i}
              className="absolute h-3 w-3 rounded-full bg-neutral-600/50 -translate-x-1/2"
              style={{ left, top }}
            />
          ))}
        </div>

        <div className="flex flex-col items-center gap-4 text-center">
          {/* Icon */}
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800/80 border border-neutral-700/60">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="h-6 w-6 text-neutral-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z"
              />
            </svg>
          </div>

          <div>
            <h3 className="font-serif text-base font-medium text-neutral-300">
              Practice mode
            </h3>
            <p className="mt-1.5 max-w-sm text-sm text-neutral-500 leading-relaxed">
              The interactive piano roll lives here. Follow along, adjust tempo,
              loop sections, and track your progress over time.
            </p>
          </div>

          {/* Feature preview pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-neutral-600">
            {["Follow-along roll", "Tempo control", "Loop sections", "Fingering hints"].map(
              (label) => (
                <span
                  key={label}
                  className="rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1"
                >
                  {label}
                </span>
              ),
            )}
          </div>

          {/* Disabled CTA */}
          <button
            type="button"
            disabled
            className="mt-1 flex items-center gap-2 rounded-lg bg-neutral-800/70 px-5 py-2.5 text-sm font-medium text-neutral-500 cursor-not-allowed select-none border border-neutral-700/40"
            aria-label="Start practice — coming soon"
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 opacity-50"
            >
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
            Start practice
          </button>

          <p className="text-xs text-neutral-700">Coming soon</p>
        </div>
      </div>

      {/* Bottom keyboard strip */}
      <div className="flex h-8 w-full overflow-hidden border-t border-neutral-800/60" aria-hidden>
        {Array.from({ length: 52 }).map((_, i) => {
          const noteInOctave = i % 7;
          const isBlackGap = noteInOctave === 1 || noteInOctave === 3;
          return (
            <div
              key={i}
              className="flex-1 border-r border-neutral-800/80"
              style={{
                background: isBlackGap ? "#1c1a18" : "#282420",
              }}
            />
          );
        })}
      </div>
    </section>
  );
}
