# Songscription Fullstack Take-Home

Thanks for taking the time to do this. This project gives you a feel for the kind of work you'd be doing at Songscription, and gives us a sense of how you think about UI, UX, and backend integration.

## Product context

We're building a piano learning app where users can transcribe any music into a MIDI file, then learn it using an interactive piano roll. One page of that app is the **catalogue page** where users see every transcription they've created and click into one to practice it.

**You're building that catalogue page.**

You don't need to build any transcription logic. Treat uploading a `.mid` file as a stand-in for "the user just transcribed a song". The upload is the action that adds an entry to their library.

## The task

Build a single-page web app where a user can:

1. **Upload a MIDI file** to add it to their catalogue. (Stand-in for "transcribe a song.")
2. **Browse the catalogue** of every file they've added.
3. **Click into a file** to see some details about it. Think about what details would be relevant for a learner of the song.

## Things to think about

These are examples of the kinds of product questions we think about. You don't have to answer or address them all in your build, they're just here as examples of different paths you could explore.

- How do we make the **upload process** as smooth as possible? What happens during upload, after, and on failure?
- Once a file is in the catalogue, **how does it appear to the user?** How do you make it easy to differentiate between songs? What if they don't know exactly what they want to practice that day?
- As the catalogue grows, **how does someone find the song they want to come back to?** Search? Filter? Sort? Tags? Recently played? Favorites? Folders? Something else?
- **What settings might a user want?** Per-file? Library-wide? What lives where?
- What does the catalogue feel like with **0 items**? With **3**? With **300**?

If you need data we haven't given you (favorites, last-practiced timestamps, accuracy metrics, practice logs, tags, difficulty, user info, etc.), invent it. Mock data is fine and encouraged.

## What we're looking for

- **It must persist.** Refreshing the page should keep the files. Use any backend you like to store the file and any extra metadata about it. We use Supabase, but you can choose whatever backend you're comfortable with.
- **Visual polish.** This is a product surface. Empty states, hover states, loading, transitions, typography, spacing etc should be reasonable.
- **How you store and query data.** We want to see how you store the data, which metadata you decide to add to the database, etc. 
- **Product thinking.** Is the final output intuitive and usable? Can you take inspiration from other similar applications?
- **Creative problem solving.** We've given you the bare minimum to get started. If you think the catalogue needs audio playback, previews, thumbnails, waveforms, anything, feel free to add it. There's no "right" set of features...surprise us.

## What we're NOT looking for

- **Auth.** Don't build login, that's a time sink. Treat it as a single user. If you want richer UI (avatars, settings, "your" stats, etc.), feel free to mock a user's data. We just want to see the product surface.
- **A custom piano roll or practice experience.** If you want to design around it (e.g., a "Practice" button on each catalogue entry), feel free to leave a placeholder region (something like a panel that says *"this is where the piano roll would go"* is totally fine).

## Time

**Spend 2-3 hours.** We'd like to see what you can do in this time window. We recommend time boxing it and sending us what you've got by the 3-hour mark.

Tools like Cursor, Copilot, ChatGPT, Claude, etc. are all fair game.

## Getting started

```bash
npm install
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000). Sample `.mid` files are in the `public/samples/` folder. You're also free to use your own.

## Stack

The starter is **Next.js 15 (App Router) + TypeScript + Tailwind**.

You're free to:

- Restructure the project layout however you want.
- Swap the styling system, add a component library (shadcn, MUI, Mantine, etc.).
- Add any libraries you'd add at work.

## Submission

When you're done, email **[katie@songscription.ai](mailto:katie@songscription.ai)** and **[alex@songscription.ai](mailto:alex@songscription.ai)** with:

1. A link to your **GitHub repo** (public, or invite `ayeitskatie1212` if private).
2. Screenshots of the finished UI.
3. A short note (3–5 sentences) covering:
  - What backend you chose and why.
  - One thing you'd do differently with more time.
  - One thing you're proud of.


That's it. Looking forward to seeing what you build!