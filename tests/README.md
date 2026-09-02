# Tests

The app is plain static files with no build step, and these tests keep it that way: they
drive the **real** `index.html` in a real browser against the **real** `cafes.json`. There is
no mock of the app itself. What is stubbed is only what cannot be reached from a test
machine — Firebase, the Google Maps key (referrer-locked to the Pages origin), and the
exchange-rate endpoint.

## Running them

```bash
npm install                      # once — pulls Playwright
npx playwright install chromium  # once — the browser it drives
npm test                         # the whole suite
node tests/keyboard.js           # or one file
```

If Chromium is already on the machine — a CI image that ships one, or a Playwright whose
pinned build has drifted from what is installed — point at it instead of downloading a
second copy:

```bash
CHROMIUM_PATH=/path/to/chromium npm test
```

Nothing here is needed to *deploy*. GitHub Pages serves the static files and ignores
`package.json` and `node_modules/` entirely.

## What each file covers

| File | What it protects |
|---|---|
| `currency-units.js` | Conversion, rounding, the country→currency table. No browser — it lifts the currency block out of `core.js` and runs the arithmetic directly. |
| `currency-form.js` | Logging a drink in local money, end to end, including the `saveForm()` traps. |
| `order-prices.js` | Same-named drinks keep independent date, price and quantity history through form edits and Stats. |
| `currency-source.js` | Where a cafe's currency comes from, and that **nothing calls a metered API**. |
| `rates-dated.js` | A drink converts at the rate for the day it was ordered, and a saved rate is never recalculated. |
| `rates-network.js` | Fetching a real rate, caching it permanently, and all three ways it can fail (offline, HTTP error, switched off). |
| `wishlist-form.js` | Where the wishlist tick sits and which fields it hides. |
| `wishlist-save.js` | A wishlist entry saves no visit, and ticking it on a cafe with real history asks first. |
| `wishlist-drinks.js` | A cafe with drinks logged comes off the wishlist. |
| `cloud-writes.js` | Per-cafe writes, deletion, and **the lost update they prevent** — reproduced against the old whole-array write, then shown gone. |
| `place-id.js` | A cafe's photo is fetched by its Google place id, not by searching its name. The wrong-photo bug. |
| `private.js` | A private spot never publishes an exact location or a street address — at save, in `cafes.json`, and in the daily backup. |
| `keyboard.js` | Every control is reachable and activatable without a pointer, against all 101 real cafes. |
| `locate.js` | The locate button, its three states, the user dot — which was never being drawn — and that **nothing but the button raises the permission prompt**. |
| `offline.js` | The app boots with the network pulled. |
| `regression.js` | Legacy drink prices render identically; a form round-trip adds order history without changing existing summary fields. |

`regression.js` is the one that encodes a promise rather than a behaviour: the currency work
shipped without migrating the ~60 dollar prices already on record, and that is only safe for
as long as those drinks render exactly as they used to. A drink that *does* carry a local
currency is expected to differ — it gains its second line. If that test goes red, either the
promise broke or the promise changed; be sure which before editing it.

`snapshot.js` is a tool rather than a test. It dumps the exact HTML that `renderList()`,
`openDetail()` and `addDrinkRow()` produce — every sort mode, every filter, both roles, all
101 cafes, plus synthetic edge cases — so a refactor can be proved to change nothing:

```bash
node tests/snapshot.js before.json    # before touching anything
node tests/snapshot.js after.json     # after
diff before.json after.json           # must be empty
```

## Why they exist

They are not decoration. In the session that produced them they caught, among others:

- three emoji written as `\U` escapes that JavaScript read as the literal text `U0001F4CD` —
  two of them invisible to the snapshots because they were set via `textContent`
- a helper rewritten to call **itself** instead of `localStorage`, so every write silently
  failed while appearing to succeed
- `syncWishMode()` deleted by a removal whose range was one function too wide
- an update bar in `index.html` left keyboard-inaccessible because a grep only scanned `js/`
- a `userMarker` that every part of the app referred to and nothing ever created
- two location-based fixes for a wrong cafe photo that could not have worked, because the
  photo was never looked up by location — it was looked up by name

Every one of those looked safe when written.

## Adding one

Copy the shape of any existing file. `harness.js` gives you three things:

```js
const { serve, launch, checker, ROOT } = require("./harness");
const srv = await serve();     // the repo over http, on an OS-assigned port
const b   = await launch();    // chromium
const { eq, done } = checker(); // eq(got, want, label); done() -> true if green
```

Then add it to the `SUITE` list in `run.js`. Two conventions worth keeping: assert on
**behaviour a user would notice** rather than on internals, and when you fix a bug, add the
case that would have caught it.
