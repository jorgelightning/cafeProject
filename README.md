# ☕ JL Cafe Project

A cafe-tracking web app: Google Maps view, searchable cafe list, drink logs with
ratings, head-to-head Elo ranking, stats, and cloud sync via Firebase.
Live at **https://jorgelightning.github.io/cafeProject/**

No framework and nothing to build while you work: plain HTML/CSS/JS, which is what the browser runs locally.
The deploy publishes a minified copy to GitHub Pages, only after every test passes against it.

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
| `js/sync.js` | Durable public-cafe save queue, transactions, conflict review and status |
| `js/photos.js` | Lazy cafe photos and fallbacks |
| `js/list.js` | Cafe grid/compact list and filters |
| `js/stats.js` | Spending, visit statistics and area-based suggestions |
| `js/rank.js` | Cafe Board and optional comparison sheet |
| `js/detail.js` | Cafe detail and order history |
| `js/form.js` | Complete drink and cafe editor |
| `js/boot.js` | Startup, updates and back navigation |
| `sw.js` | Offline shell and data cache |
| `scripts/` | Tooling: `build-site.js` (the published copy), `share-pages.js`, `bump.js`, `sri.js`, `css-diff.js` |
| `tests/` | Browser and unit checks |

### Private spots

A cafe ticked "Private spot 🏠" is stored **twice**:

| Node | Holds | Who can read |
|---|---|---|
| `cafes/<id>` | blurred pin (~1km), no street address | anyone |
| `private/<id>` | the exact address and coordinates | only the owner account |

`cafes.json` is published with the site and mirrors the public node only, so **everything the
app publishes is blurred.** The app reads `private/` when you are signed in and shows you the
real address; signed out, the accessors (`areaOf` / `latOf` / `lngOf` in `core.js`) fall back
to the public value. The precise copy is never merged into the `cafes` array, because `save()`
writes that array wholesale to the public node.

> **The database rule below is not optional.** Without it, `private/` is exactly as readable as
> `cafes/`, and this whole arrangement is decoration. It lives in **`database.rules.json`**, tested
> against the Firebase emulator (`npm run test:rules`, needs Java) on every push. Publish it with
> `npx -y firebase-tools@15.33.0 deploy --only database` (run `firebase login` once first), or paste
> it into **Firebase console → Realtime Database → Rules → Publish**. For a fork, replace the
> address with the one in `OWNER_EMAIL` (`js/config.js`):

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


`cafes.json` is published with the site and the Firebase node is read without auth, so
**everything the app stores is public.** A cafe ticked "Private spot 🏠" therefore has its
coordinates rounded to about a kilometre and a numbered area field dropped *before it is
saved* — hiding it in the interface would hide nothing, since anyone can open the JSON. The
daily backup applies the same redaction in jq, so a precise value already sitting in Firebase
still never reaches the published file, and the deploy checks the file once more and refuses to publish one
that carries a precise location (`scripts/build-site.js`).


Scripts are classic files loaded in order with `defer` — `config.js` first, `boot.js` last — and
share one global scope. The pure helpers (escaping, dates, the Elo arithmetic) are ES modules in
`js/lib/`, loaded first and unit-tested by Node. A control names what it does
(`data-on="openDetail" data-args="[...]"`, written by `act()` in `core.js`) instead of carrying
inline code, which is what lets the Content Security Policy in `index.html` forbid inline script.

## Tests

`npm install && npx playwright install chromium`, then `npm test`. They drive the real
`index.html` in a real browser against the real `cafes.json`, four files at a time — see
`tests/README.md`. Also: `npm run test:unit` (the `js/lib/` modules, Node only), `npm run test:rules`
(the database rules, in the Firebase emulator) and `npm run test:live` (the Content Security Policy
against the real Maps, database and sign-in script; needs the network).
`npm run test:site` runs the whole suite against the minified build that gets published; the deploy runs
that and publishes nothing if it fails.

## Deploying an update

1. **If you changed any `js/` or `css` file, run `npm run bump`.** It moves the `?v=` number on every
   script/link tag in `index.html` and `CACHE_V`/`ASSET_V` in `sw.js` together, and refuses if they
   disagree.
   The `?v=` busts browser caches and triggers the in-app "🔄 New version
   available" banner for open tabs. `CACHE_V` is what makes the service
   worker fetch the new files instead of serving the previous build from
   its cache. Bumping one without the other looks exactly like a change
   that failed to deploy.
2. Run `npm test`. All checks must pass before pushing.
3. Commit and push to `main`. *App checks* runs the tests against the source; *Deploy site* builds the
   minified site (`npm run build`), runs every test against it, and publishes only if they pass. A failed
   run leaves the previous version live.
4. Verify the deployed version a few minutes later. Browsers may briefly serve the old page from the Pages
   cache.

## Data

- **Primary store**: Firebase Realtime Database (`cafes` key). Public read;
  writes locked to the owner Google account set in `js/config.js`.
- The `cafes` node is an **object keyed by cafe id**, not a JSON array. Edits
  write one cafe at a time (`cafes/<id>`) so two devices editing different
  cafes cannot overwrite each other; bulk operations enqueue each changed cafe. Transactions detect same-cafe conflicts before replacing a cloud record. `asArray()` reads either shape, so older array-shaped
  exports still load.
- **`cafes.json`**: the live site's is the nightly backup, kept on the `data` branch
  (`.github/workflows/backup.yml`), a commit on each day it changes; the copy on `main` is a fixed snapshot
  for local runs and the tests. It is the offline fallback if the
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
  stable ID, date, price, currency, quantity and drink options; the drink's top-level
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
  cafes. Public cafe changes are saved to a durable local queue, then synced to Firebase. The owner sees pending/failure/conflict status.

## Owner checklist (things the code cannot check for you)

The repo can't see Google Cloud, Firebase or GitHub settings, so these are yours to confirm. Tick them
off once, then again after any key or hosting change.

**Google Maps key** (Google Cloud console > APIs & Services > Credentials)
- [ ] Application restriction: *Websites*, with `jorgelightning.github.io/*` (and `localhost` only if you
      develop locally). The key in `js/config.js` is only Caesar-shifted, which is obfuscation, not secrecy.
      Maps browser keys are public by design, so this restriction is the protection.
- [ ] API restriction: *Maps JavaScript API* and *Places API* only.
- [ ] Billing: a budget with an alert, and a daily quota cap on the Maps JavaScript API.

**Firebase** (console > Realtime Database)
- [ ] Rules match the block above, including the `private` section. The app probes this while you are
      signed in and shows a red banner if strangers can write or read private spots.
- [ ] A budget alert on the project, since `cafes` is world-readable by design.
- [ ] Optional: App Check, to stop other sites using your database.

**GitHub** (repo Settings)
- [ ] Branches: a protection rule on `main` that requires the *App checks* workflow to pass.
- [ ] Code security: secret scanning and push protection on; Dependabot alerts on (the version updates are
      configured in `.github/dependabot.yml`).
- [x] **The live site is gated on the tests** (on since 27 Oct): Settings > Pages > Source: *GitHub
      Actions*, and Settings > Secrets and variables > Actions > Variables: `PAGES_VIA_ACTIONS` = `true`.
      Undo either and nothing publishes.
- [ ] Leave the `data` branch to the backup bot: it holds the live site's data, and the deploy reads it.
- [ ] If your editing tool (for example Google AI Studio) syncs to this repo, check it did not delete
      `package-lock.json`. The *App checks* workflow now fails with that exact message if it did.

## Development

- `npm start` serves the app on port 3000 (`server.js`; it refuses to serve dotfiles such as `.git`).
- `npm test` runs every test in `tests/` in a headless browser.
- `npm run build` writes the site as it would be published into `_site/` (minified, with share pages and
  source maps); `npm run test:site` builds it into `_site_test/` and runs every test against it.
- `npm run lint` runs ESLint (`eslint.config.js`). The scripts share one global scope, so the config reads
  every top-level name from `js/*.js` and treats them as globals; `no-undef` still catches a typo.
- `npm run typecheck` type-checks the JavaScript with TypeScript (`tsconfig.json`, data shapes in
  `types/cafe.d.ts`). It is a ratchet: the error count in `types/baseline.json` may fall but not rise.
  `npm run typecheck -- --list` prints every error.
- `npm run format` runs Prettier on the scripts (`.prettierrc.json`). `npm run check` runs lint, typecheck
  and the tests, which is what CI runs.
- `.editorconfig` sets indentation and line endings; most editors read it automatically.
