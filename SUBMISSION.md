# Submission note

**Repo:** https://github.com/RiptideStar/songscription-catalogue

**Backend — Supabase (Postgres + Storage).** I went with Supabase because it's what you use and it's the right shape for this: a relational table for the queryable metadata plus object storage for the raw `.mid` blobs, in one service. On upload I parse the MIDI once server-side and persist the facts a learner actually scans (key, tempo, time signature, duration, note count, pitch range, a derived 1–5 difficulty, and a per-song accent color), then store the blob. The raw note events are NOT in the row, they'd bloat it, so the detail view re-parses the blob client-side to draw the piano-roll and play it back. That keeps list queries tiny.

**One thing I'd do differently with more time:** ship a live Vercel link and add per-file practice settings (loop a section, set a target tempo). Right now practice is a tasteful placeholder panel, and the app runs locally with `npm install && npm run dev` plus the Supabase keys in the README.

**One thing I'm proud of:** the detail view is a real music surface, not a file card. It fetches the stored MIDI, parses it in the browser, draws an actual piano-roll of the notes, and plays it back through Tone.js with a playhead synced to the Transport. The whole thing reads like an instrument, down to the mono font on every number.
