# ☕ JL Cafe Project

A cafe-tracking web app: Google Maps view, searchable cafe list, drink logs with
ratings, head-to-head Elo ranking, stats, and cloud sync via Firebase.
Live at **https://jorgelightning.github.io/cafeProject/**

No build step, no framework — plain HTML/CSS/JS served straight from GitHub Pages.

See [DESIGN_NOTES.md](DESIGN_NOTES.md) for why things are built the way they are, what the
data actually supports, the traps that have already caused bugs, and what was deliberately
not built.

## Project structure

| File | What's in it |
|---|---|
| `index.html` | Markup only, plus the script/link tags that load everything |
| `styles.css` | All styling (light/dark theme, mobile + desktop split view) |
| `js/config.js` | **API keys and settings** — Maps key (Caesar-encoded), Firebase config, admin email |
| `js/core.js` | App state, DOM/format helpers, Firebase init and cloud sync |
| `js/storage.js` | Load/save data, admin sign-in, import/export, seed data |
| `js/nav.js` | View switching (map / list / detail / form / rank / stats) |
| `js/map.js` | Google Maps, markers, location dropdown, geolocation |
| `js/photos.js` | Cafe photo fetching via Places API with cache and fallbacks |
| `js/list.js` | Search, sorting, and the cafe card grid |
| `js/stats.js` | Stats / leaderboard pane |
| `js/rank.js` | Head-to-head compare + Elo ranking (cafes and drinks) |
| `js/detail.js` | Cafe detail page |
| `js/form.js` | Add/edit visit form and quick-log sheet |
| `js/boot.js` | Startup wiring, update checker, back-button handling |

Scripts are classic (non-module) files loaded in order — `config.js` first,
`boot.js` last. Functions are globals so inline `onclick` handlers keep working.

## Deploying an update

1. Commit and push to `main` — GitHub Pages redeploys automatically (~1 min).
2. **If you changed any `js/` or `css` file, bump the `?v=` number on every
   script/link tag in `index.html`.** That's what busts browser caches and
   triggers the in-app "🔄 New version available" banner for open tabs.
3. Browsers may serve the old page for up to 10 minutes (Pages cache).

## Data

- **Primary store**: Firebase Realtime Database (`cafes` key). Public read;
  writes locked to the owner Google account set in `js/config.js`.
- **`cafes.json`** (optional, next to `index.html`): offline fallback if the
  cloud is unreachable. Must be a **plain JSON array** starting with `[` —
  the wrapped `{ "cafes": [...] }` form is only for pasting into Firebase.
  If missing, the app falls back to the visitor's cached copy or demo data.
- Personal drink photos are URLs stored per cafe (`photo` field); host large
  images externally (e.g. Cloudinary) and store the link.

## Modes

- **Viewer** (default): browse everything, edit nothing.
- **Admin**: sign in with the owner Google account (🔒 button) to add/edit
  cafes; edits sync to Firebase instantly for all viewers.
