# Game ID Lookup

A simple web app that takes a Roblox game name (or link) and returns its Universe ID and Place ID, along with its icon and current player count.

## How it works

Type a game name and the app tries, in order:

1. **Rolimons game list** — a third-party tracker of most active Roblox games. Fast, no auth, and covers the vast majority of searches.
2. **Roblox's own internal search API** (`omni-search`) — used as a fallback for games Rolimons hasn't indexed.
3. If neither finds a match, the app asks you to paste the game's Roblox link instead (e.g. `roblox.com/games/920587237/Adopt-Me`), which is matched with 100% accuracy since it skips name-guessing entirely.

Once a Place ID is found (from any of the above), the app calls Roblox's official `games.roblox.com` and `thumbnails.roblox.com` endpoints to pull the confirmed name, Universe ID, live player count, and icon.

> **Note:** Roblox does not currently offer an official, stable "search games by name" API. The name-search here relies on a third-party service (Rolimons) and an internal Roblox endpoint that isn't officially documented for public use — both could change or break without notice. The link-paste fallback is the only 100%-guaranteed method, since it uses Roblox's stable, documented endpoints end to end.

## Project structure

```
game-id-finder/
├── index.html          # Frontend UI (terminal-style, single file)
├── api/
│   └── lookup.js        # Vercel serverless function that does the lookup
└── package.json         # Marks this as a Node project for Vercel
```

## Running locally

You'll need the [Vercel CLI](https://vercel.com/docs/cli):

```bash
npm install -g vercel
cd game-id-finder
vercel dev
```

This runs the site and the `/api/lookup` serverless function together on `localhost`, just like production.

## Deploying (free, on Vercel)

1. Create a free account at [vercel.com](https://vercel.com).
2. Install the CLI: `npm install -g vercel`
3. From inside the `game-id-finder` folder, run:
   ```bash
   vercel
   ```
   Accept the defaults when prompted, and log in via the browser when asked.
4. Once it deploys, run:
   ```bash
   vercel --prod
   ```
   to push it live on your permanent free URL (e.g. `your-project.vercel.app`).

**Alternative (no terminal):** push this folder to a GitHub repo, then on vercel.com click **Add New Project**, import the repo, and click **Deploy**. Vercel auto-detects the `api/` folder as a serverless function — no config needed.

Both the static site and the serverless function are free on Vercel's Hobby plan — no credit card required.

## Known limitations

- **Name search isn't guaranteed.** Very new, very small, or unusual-titled games may not appear in Rolimons' list or match well against Roblox's internal search. Paste the game's link in that case.
- **Unofficial dependency.** The Rolimons API and Roblox's `omni-search` endpoint are not officially documented/supported for third-party use. If either changes shape or goes down, name search may stop working until the code is updated — the link-paste path is unaffected since it only uses Roblox's stable, documented endpoints.
- **No caching across cold starts.** The Rolimons game list is cached in memory for 5 minutes per warm serverless instance, but a fresh cold start will refetch it (a small, fast request).

## Customizing

- Colors, fonts, and layout live entirely in `index.html`'s `<style>` block.
- The lookup logic (matching, fallbacks, error messages) lives in `api/lookup.js`.
