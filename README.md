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
| `js/map.js` | Google Maps, markers, location dropdown, geolocation, the locate button |

### Private spots

A cafe ticked "Private spot 🏠" is stored **twice**:

| Node | Holds | Who can read |
|---|---|---|
| `cafes/<id>` | blurred pin (~1km), no street address | anyone |
| `private/<id>` | the exact address and coordinates | only the owner account |

`cafes.json` is served from this repo and mirrors the public node only, so **everything the
app publishes is blurred.** The app reads `private/` when you are signed in and shows you the
real address; signed out, the accessors (`areaOf` / `latOf` / `lngOf` in `core.js`) fall back
to the public value. The precise copy is never merged into the `cafes` array, because `save()`
writes that array wholesale to the public node.

> **The database rule below is not optional.** Without it, `private/` is exactly as readable as
> `cafes/`, and this whole arrangement is decoration. Paste it into
> **Firebase console → Realtime Database → Rules → Publish**, replacing the address with the
> one in `OWNER_EMAIL` (`js/config.js`):

```json
{
  "rules": {
    "cafes": {
      ".read": true,
      ".write": "auth != null && auth.token.email_verified == true && auth.token.email == 'YOUR_OWNER_EMAIL'"
    },
    "private": {
      ".read":  "auth != null && auth.token.email_verified == true && auth.token.email == 'YOUR_OWNER_EMAIL'",
      ".write": "auth != null && auth.token.email_verified == true && auth.token.email == 'YOUR_OWNER_EMAIL'"
    }
  }
}
```

If your rules currently read `".read": true, ".write": true` at the top level, they are the
test-mode defaults: **anyone can overwrite your whole map.** The block above fixes that too.

Once the rule is live, open the app signed in. Any private spot whose exact address is still
sitting in the public node is moved automatically — the precise copy is written to `private/`
first, then the public record is overwritten with the blurred one, so a failure between the
two duplicates rather than loses it. You will see a toast naming each spot it moved.

#### How the blurring works


`cafes.json` is served from this repo and the Firebase node is read without auth, so
**everything the app stores is public.** A cafe ticked "Private spot 🏠" therefore has its
coordinates rounded to about a kilometre and a numbered area field dropped *before it is
saved* — hiding it in the interface would hide nothing, since anyone can open the JSON. The
daily backup applies the same redaction in jq, so a precise value already sitting in Firebase
still never reaches the published file.
| `js/photos.js` | Cafe photo fetching via Places API with cache and fallbacks |
| `js/list.js` | Search, sorting, and the cafe card grid |
| `js/stats.js` | Stats / leaderboard pane |
| `js/rank.js` | Head-to-head compare + Elo ranking (cafes and drinks) |
| `js/detail.js` | Cafe detail page |
| `js/form.js` | Add/edit visit form and quick-log sheet |
| `js/boot.js` | Startup wiring, update checker, back-button handling |
| `sw.js` | Service worker — caches the app shell so it opens with no network |
| `tests/` | Browser tests driving the real app — see `tests/README.md` |

Scripts are classic (non-module) files loaded in order — `config.js` first,
`boot.js` last. Functions are globals so inline `onclick` handlers keep working.

## Tests

`npm install && npx playwright install chromium`, then `npm test`. They drive the real
`index.html` in a real browser against the real `cafes.json` — see `tests/README.md`.
None of it is needed to deploy; Pages ignores `package.json` and `node_modules/`.

## Deploying an update

0. `npm test` — cheap, and it has caught things that looked safe. `cache-version` fails if
   you forget step 2, which is worth more than remembering step 2.
1. Commit and push to `main` — GitHub Pages redeploys automatically (~1 min).
2. **If you changed any `js/` or `css` file, bump the `?v=` number on every
   script/link tag in `index.html` — and `CACHE_V` in `sw.js` to match.**
   The `?v=` busts browser caches and triggers the in-app "🔄 New version
   available" banner for open tabs. `CACHE_V` is what makes the service
   worker fetch the new files instead of serving the previous build from
   its cache. Bumping one without the other looks exactly like a change
   that failed to deploy.
3. Browsers may serve the old page for up to 10 minutes (Pages cache).

## Data

- **Primary store**: Firebase Realtime Database (`cafes` key). Public read;
  writes locked to the owner Google account set in `js/config.js`.
- The `cafes` node is an **object keyed by cafe id**, not a JSON array. Edits
  write one cafe at a time (`cafes/<id>`) so two devices editing different
  cafes cannot overwrite each other; only genuinely bulk operations rewrite
  the whole node. `asArray()` reads either shape, so older array-shaped
  exports still load.
- **`cafes.json`** (optional, next to `index.html`): offline fallback if the
  cloud is unreachable. Must be a **plain JSON array** starting with `[` —
  the wrapped `{ "cafes": [...] }` form is only for pasting into Firebase.
  If missing, the app falls back to the visitor's cached copy or demo data.
- Personal drink photos are URLs stored per cafe (`photo` field); host large
  images externally (e.g. Cloudinary) and store the link.
- Prices are stored twice: `p` is always US dollars, and `pl`/`pc` keep the
  amount as it appeared on the board, with `pr`/`pd` recording the rate used
  and the day it came from. The rate is frozen when the drink is logged and
  never recalculated, so past spending cannot drift.
- A same-named drink is one group with an `orders` array. Each order owns its
  date, price, currency, quantity and drink options; the drink's top-level
  fields mirror its latest order for compatibility with older cached clients.
- A cafe's currency comes from the country in the Places result when you add
  it by searching. For anything else the currency chip on the price row lets
  you pick, and the choice is saved on the cafe (`ccy`) — once per cafe, not
  once per drink. Nothing calls a paid geocoding API to guess it.

## Offline

The app shell is cached by `sw.js`, so it opens and runs with no connection —
you can log a drink on a plane and it syncs when you land. `index.html` and
`cafes.json` are fetched network-first so the update banner and published data
stay current; everything else is served from cache.

## Modes

- **Viewer** (default): browse everything, edit nothing.
- **Admin**: sign in with the owner Google account (🔒 button) to add/edit
  cafes; edits sync to Firebase instantly for all viewers.
