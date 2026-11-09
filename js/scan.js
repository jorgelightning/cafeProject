/* ---------- scan a receipt (v127) ----------
   Friends' idea, and the owner's chore: a photo of the receipt fills in the log sheet. Scan sits beside the sheet's
   title and nothing else on it changes, because on a repeat order the sheet is already faster than a photo.

   It all happens on the phone, at no cost, and the photo never leaves it: Tesseract, self-hosted in vendor/, turns the
   picture into lines of text and parseReceipt (js/lib/scan.js) works out what they mean. Its files are about 7 MB, so
   they load the first time you scan and no visitor ever fetches them. A text reader cannot guess at faded print
   or know what a shop's abbreviation means, so the result fills in the sheet, shows what was printed, and you
   press Save, as with a ghost price: a misread receipt cannot quietly put a wrong price in your stats.

   One drink on the receipt goes straight to the filled-in sheet. Several items ask which were yours first, and then
   the sheet comes up once for each. A payment screen often shows only a total, and says so. English print only:
   other languages need their own, larger model.

   Log only opens the sheet on a cafe page or standing in a cafe; anywhere else it opens Add a visit, so Scan is there
   too (v128). From there a receipt naming one cafe on your list goes to that cafe's sheet, and any other fills in the
   form: the shop's name from the top of the receipt, and a row for each cup. */

/** Needs WebAssembly and a way to decode the photo; every phone this app runs well on has both. */
function scanOn() {
  return isAdmin && typeof WebAssembly === "object" && typeof createImageBitmap === "function";
}
const SCAN_WAIT_MS = 90000;
/* Enough for small receipt print to be read, and no more: every extra pixel is time on a phone */
const SCAN_SIDE = 2400;
const OCR_DIR = "vendor/tesseract-7.0.0/";
/** The scan in progress: what the sheet is showing while it is not the quick cup. @type {any} */
let _scan = null;

function scanStart() {
  const f = /** @type {HTMLInputElement|null} */ ($("scan-file"));
  if (!f || !scanOn()) return;
  /* so choosing the same photo again still counts as a change */
  f.value = "";
  f.click();
}
/** @param {HTMLInputElement} el */
function scanPicked(el) {
  const file = el.files && el.files[0];
  if (file) _scanRun(file);
}
function _scanStop() {
  if (!_scan) return;
  _scan.ctl.abort();
  if (_scan.url) URL.revokeObjectURL(_scan.url);
  _scan = null;
}
/** The photo twice over: to show (url), and grey with its contrast stretched for the reader, since a receipt photographed
    in a dim cafe has no true black or white. Drawing it on a canvas also turns it upright.
    @param {Blob} file @returns {Promise<{image: HTMLCanvasElement, url: string}>} */
async function _scanPrep(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, SCAN_SIDE / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(bmp.width * k);
  cv.height = Math.round(bmp.height * k);
  const g = cv.getContext("2d");
  g.drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close();
  const blob = await new Promise(ok => cv.toBlob(ok, "image/jpeg", 0.7));
  if (!blob) throw new Error("no image");
  const px = g.getImageData(0, 0, cv.width, cv.height);
  const d = px.data;
  const seen = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = y;
    seen[y]++;
  }
  /* the darkest and lightest 1% are specks and glare */
  const edge = (d.length / 4) * 0.01;
  let lo = 0,
    hi = 255;
  for (let n = 0; lo < 255 && (n += seen[lo]) < edge; ) lo++;
  for (let n = 0; hi > 0 && (n += seen[hi]) < edge; ) hi--;
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span));
  g.putImageData(px, 0, 0);
  return { image: cv, url: URL.createObjectURL(blob) };
}
/** A copy with its lighting evened out, for a photo the first read got nothing from. Each pixel is compared with the area
    around it, so a shadow across the paper or a dark table around it cannot pull faint print under the reader's one
    black-or-white cut. It costs stray marks at the paper's edge, which is why it is the second look and not the first.
    @param {HTMLCanvasElement} from */
function _scanEven(from) {
  const cv = document.createElement("canvas");
  const w = (cv.width = from.width),
    h = (cv.height = from.height);
  const g = cv.getContext("2d");
  g.drawImage(from, 0, 0);
  const px = g.getImageData(0, 0, w, h);
  const d = px.data;
  /* a running total of brightness, so the average of any box costs four lookups */
  const row = w + 1;
  const sum = new Uint32Array(row * (h + 1));
  for (let y = 0, i = 0; y < h; y++)
    for (let x = 0; x < w; x++, i += 4) {
      sum[(y + 1) * row + x + 1] = d[i] + sum[y * row + x + 1] + sum[(y + 1) * row + x] - sum[y * row + x];
    }
  const r = Math.round(Math.max(w, h) / 24);
  for (let y = 0, i = 0; y < h; y++) {
    const y0 = Math.max(0, y - r),
      y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++, i += 4) {
      const x0 = Math.max(0, x - r),
        x1 = Math.min(w, x + r + 1);
      const mean = (sum[y1 * row + x1] - sum[y0 * row + x1] - sum[y1 * row + x0] + sum[y0 * row + x0]) / ((x1 - x0) * (y1 - y0));
      /* paper comes out near-white whatever the light on it; ink, darker than its surroundings, stays dark */
      d[i] = d[i + 1] = d[i + 2] = Math.min(255, Math.max(0, 255 - (mean - d[i]) * 4 - 20));
    }
  }
  g.putImageData(px, 0, 0);
  return cv;
}
let _ocrLoading = null;
function _ocrLoad() {
  if (typeof Tesseract !== "undefined") return Promise.resolve();
  if (!_ocrLoading)
    _ocrLoading = new Promise(function (ok, no) {
      const s = document.createElement("script");
      s.src = OCR_DIR + "tesseract.min.js";
      s.onload = () => ok(undefined);
      s.onerror = function () {
        _ocrLoading = null;
        no(new Error("reader did not load"));
      };
      document.head.appendChild(s);
    });
  return _ocrLoading;
}
/** What the photo says, with a second look when the first read found nothing to log. A real payment screen stops at one
    read, being short and clean; a total picked out of a long page of print is a receipt the reader mostly missed.
    @param {HTMLCanvasElement} image @param {AbortSignal} signal @param {any} ctx for parseReceipt @param {(step: string) => void} [say] */
async function _scanMake(image, signal, ctx, say) {
  const text = await scanRead(image, signal, say);
  const res = Object.assign(parseReceipt(text, ctx), { text: text });
  const lines = String(text).split("\n").filter(l => l.trim()).length;
  if (res.kind === "receipt" || (res.kind === "total_only" && lines <= 8)) return res;
  if (say) say("again");
  const second = await scanRead(_scanEven(image), signal, say);
  const again = Object.assign(parseReceipt(second, ctx), { text: second });
  return again.items.length > res.items.length || res.kind === "unreadable" ? again : res;
}
/** The text in the picture. Tests replace it. Its worker is a file of our own rather than a blob, because a worker
    from a file is not bound by this page's Content Security Policy, which does not allow WebAssembly.
    @param {HTMLCanvasElement} image @param {AbortSignal} signal @param {(step: string) => void} [say] */
async function scanRead(image, signal, say) {
  await _ocrLoad();
  const base = new URL(OCR_DIR, location.href).href;
  const worker = await Tesseract.createWorker("eng", 1, {
    workerPath: base + "worker.min.js",
    workerBlobURL: false,
    corePath: base,
    langPath: base.slice(0, -1),
    logger: m => {
      if (say && m.status === "recognizing text" && m.progress === 0) say("reading");
    },
  });
  const stop = () => worker.terminate();
  try {
    if (signal.aborted) throw new DOMException("stopped", "AbortError");
    signal.addEventListener("abort", stop, { once: true });
    /* one column of lines, keeping the gap before a price */
    await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
    const res = await worker.recognize(image);
    return res.data.text;
  } finally {
    signal.removeEventListener("abort", stop);
    worker.terminate();
  }
}
/** @param {File} file */
async function _scanRun(file) {
  const form = app.dataset.view === "form";
  const c = form ? cafes.find(x => x.id === editId) || null : cafes.find(x => x.id === curId);
  if (!c && !form) return;
  _scanStop();
  const run = /** @type {any} */ ({ c: c, form: form, code: _scanCode(c), ctl: new AbortController(), url: "", items: [], date: null });
  _scan = run;
  _qc = null;
  if ($("dnsheet").hidden) openSheet("");
  _sheetOnClose = _scanStop;
  _scanShow(
    '<div class="scanr"><button type="button" class="ocx" aria-label="Cancel"' + act("closeSheet") + ">" + ico("x") + "</button>" +
      '<div class="scanphoto"><img id="scan-img" alt="Your photo" hidden><span class="scanline" aria-hidden="true"></span></div>' +
      '<div class="scanwords"><h2 id="dns-title">Reading your receipt…</h2><p id="scan-note">Getting ready. The first time takes a little longer.</p></div></div>'
  );
  const timer = setTimeout(() => run.ctl.abort(), SCAN_WAIT_MS);
  try {
    const pic = await _scanPrep(file);
    if (_scan !== run) {
      URL.revokeObjectURL(pic.url);
      return;
    }
    run.url = pic.url;
    const img = /** @type {HTMLImageElement|null} */ ($("scan-img"));
    if (img) {
      img.src = pic.url;
      img.hidden = false;
    }
    /* an abort stops the reader, which then never answers, so it has to end the wait too */
    const stopped = new Promise((_, no) => run.ctl.signal.addEventListener("abort", () => no(new DOMException("stopped", "AbortError"))));
    const say = /** @param {string} step */ function (step) {
      const note = $("scan-note");
      if (note && _scan === run) note.textContent = step === "again" ? "That was hard to read. Taking a closer look." : "Looking for drinks and prices. The photo stays on your phone.";
    };
    let res = await Promise.race([_scanMake(pic.image, run.ctl.signal, _scanCtx(run), say), stopped]);
    if (_scan !== run) return;
    const here = run.form && !run.c && !$("f-name").value.trim() && !formDirty() ? _scanListed(res.place) : null;
    if (here) {
      run.c = here;
      run.form = false;
      run.code = _scanCode(here);
      res = parseReceipt(res.text, _scanCtx(run));
      openDetail(here.id);
    }
    _scanRoute(run, res);
  } catch (e) {
    if (_scan !== run) return;
    warn("scan.js", e);
    _scanFail(
      e && e.name === "AbortError"
        ? "That took too long. Try a closer photo, or type it in."
        : navigator.onLine === false
          ? "The reader needs a connection the first time you scan."
          : "Something went wrong reading that. Try again, or type it in."
    );
  } finally {
    clearTimeout(timer);
  }
}
/** The currency of a cafe, or of the form when there is none yet. @param {Cafe|null} c */
function _scanCode(c) {
  return String(ccyFor(c || { cc: formCC, ccy: formCcy })).toUpperCase();
}
/** What the parser needs to know: the drinks you log at this cafe or, with no cafe yet, all of them. @param {any} run */
function _scanCtx(run) {
  const known = run.c ? (run.c.drinks || []).map(d => d.n).filter(Boolean) : Object.values(drinkIndex()).map(e => e.n);
  return { known: known, code: run.code, dec: ccyMeta(run.code).dec, today: localToday() };
}
/** The cafe on your list a receipt's name means, only when exactly one fits: a chain's branches are for you to choose.
    @param {string} name */
function _scanListed(name) {
  const key = sameCafeKey(name || "");
  if (key.length < 3) return null;
  const hits = cafes.filter(c => sameCafeKey(c.name) === key);
  return hits.length === 1 ? hits[0] : null;
}
/** A way out of any screen that is waiting on you. */
function _scanClose() {
  return '<button type="button" class="ocx" aria-label="Close"' + act("closeSheet") + ">" + ico("x") + "</button>";
}
/** @param {string} html */
function _scanShow(html) {
  $("dns-panel").innerHTML = html;
  const t = $("dns-title");
  if (t) {
    t.setAttribute("tabindex", "-1");
    t.focus({ preventScroll: true });
  }
}
/** @param {string} why */
function _scanFail(why) {
  _scanShow(
    '<span class="dngrab" aria-hidden="true"></span><div class="qctop"><div class="dnhead"><h2 id="dns-title">Couldn’t read that</h2><p>' + esc(why) + "</p></div>" + _scanClose() + "</div>" +
      '<div class="dnact"><button type="button" class="btn ghost"' + act("scanType") + ">Type it in</button>" +
      '<button type="button" class="btn"' + act("scanStart") + ">Retake</button></div>"
  );
}
function scanType() {
  const form = _scan && _scan.form;
  _sheetOnClose = _scanStop;
  closeSheet();
  if (!form) openQuickCup();
}
/** Add a visit, filled in: the shop's name if the box is empty, and a row for each cup. Nothing is saved until you do.
    @param {any} run @param {any[]} rows */
function _scanFill(run, rows) {
  const date = run.date || localToday(),
    code = run.code,
    dec = ccyMeta(code).dec,
    place = run.place,
    off = run.off,
    other = run.other;
  _sheetOnClose = _scanStop;
  closeSheet();
  if ($("f-wish") && $("f-wish").checked) {
    $("f-wish").checked = false;
    syncWishMode();
    syncMore(false);
  }
  if (place && !$("f-name").value.trim()) {
    $("f-name").value = place;
    autoBrand();
  }
  document.querySelectorAll("#f-drinks .dr").forEach(function (r) {
    const name = /** @type {HTMLInputElement|null} */ (r.querySelector(".dn"));
    if (name && !name.value.trim()) r.remove();
  });
  let first = null;
  rows.forEach(function (x) {
    const amt = x.price != null ? x.price.toFixed(dec) : "";
    const row = addDrinkRow(x.n, amt, date, x.sweet, x.ice, x.size, "", false, x.milk, 1, amt && code !== "USD" ? { pc: code, pl: amt } : null);
    first = first || row;
  });
  if (first) {
    activateDrinkRow(first);
    first.scrollIntoView({ block: "start" });
  }
  toast(other ? "Filled in. This receipt is in " + other + ", so add the prices." : off ? "Filled in, but the prices don’t add up. Check them." : rows[0].n ? "Filled in from your receipt. Check it and save." : "Only a total on this one. Add your drink.");
}
/** @param {any} run @param {any} res what parseReceipt made of the text */
function _scanRoute(run, res) {
  run.date = res.date;
  run.other = res.other;
  run.place = res.place;
  if (res.kind === "unreadable") {
    _scanFail("Try again with the receipt flat and in focus, or type it in.");
    return;
  }
  if (res.kind === "total_only") {
    const amount = res.total != null ? fmtLocal(res.total, run.code) : "";
    if (run.form) {
      _scanFill(run, [{ n: "", price: res.total, size: "", sweet: "", ice: "", milk: "" }]);
      return;
    }
    _scanCups(
      [{ n: "", isNew: false, price: res.total, size: "", sweet: "", ice: "", milk: "",
         notice: res.other ? "This screen is in " + res.other + " and shows no drinks. Pick yours and add the price."
           : "This screen only shows a total" + (amount ? ", " + amount : "") + ", with no drinks listed. Pick yours and check the price.",
         say: "The total on the screen. It may include tax, or more than one drink." }],
      0, res.date, res.other
    );
    return;
  }
  run.off = res.off;
  run.items = res.items.map((x, i) => Object.assign({ i: i, on: x.drink, say: res.off ? "Read from the receipt, but its prices don’t add up. Check this one." : "" }, x));
  if (run.items.length === 1 && run.items[0].drink) {
    if (run.form) _scanFill(run, run.items);
    else _scanCups(run.items, 0, res.date, res.other);
  }
  else _scanShow(_scanPickHTML(run));
}
/** "Oat milk · had 3× here". @param {any} run @param {any} x a row */
function _scanMeta(run, x) {
  const d = ((run.c && run.c.drinks) || []).find(y => (y.n || "").trim().toLowerCase() === x.n.trim().toLowerCase());
  const cups = d ? drinkOrders(d).reduce((t, o) => t + orderQty(o), 0) : 0;
  return [orderOptsText(x), !x.drink ? "Not a drink" : cups ? "had " + cups + "× here" : run.c ? "new here" : ""].filter(Boolean).join(" · ");
}
/** @param {any} run */
function _scanPickHTML(run) {
  const n = run.items.filter(x => x.on).length;
  const day = run.date || localToday();
  return (
    '<span class="dngrab" aria-hidden="true"></span><div class="qctop"><div class="dnhead"><h2 id="dns-title">Which ones were yours?</h2><p>' +
    esc(run.c ? run.c.name : run.place || "Your receipt") + " · " + (day === localToday() ? "Today, " : "") + esc(_noteDay(day)) + "</p></div>" + _scanClose() + "</div>" +
    '<div class="scanlist">' +
    run.items
      .map(function (x) {
        return (
          '<button type="button" class="scanrow" aria-pressed="' + x.on + '" data-i="' + x.i + '"' + act("scanTick", ["$data.i"]) + ">" +
          '<span class="scanbox" aria-hidden="true">' + (x.on ? "✓" : "") + "</span>" +
          '<span class="drinkicon" aria-hidden="true" style="background:' + drinkMarkBg(x.n) + '">' + drinkMarkSVG(x.n) + "</span>" +
          '<span class="scantext"><b>' + esc(x.n) + "</b><span>" + esc(_scanMeta(run, x)) + "</span>" +
          (x.printed ? "<small>Printed: " + esc(x.printed) + "</small>" : "") + "</span>" +
          '<span class="scanp">' + esc(x.price != null ? fmtLocal(x.price, run.code) : "") + "</span></button>"
        );
      })
      .join("") +
    "</div>" +
    '<p class="scanfoot">' + (run.other ? "This receipt is in " + esc(run.other) + ", so add each price yourself." : run.off ? "These prices don’t add up to the receipt’s subtotal, so one may be misread." : "Tax, tip and the total are left out.") + "</p>" +
    '<div class="dnact"><button type="button" class="btn ghost"' + act("scanStart") + ">Retake</button>" +
    '<button type="button" class="btn"' + act("scanLog") + (n ? ">Log " + n + (n === 1 ? " cup" : " cups") : " disabled>Tick a drink") + "</button></div>"
  );
}
/** @param {string} i */
function scanTick(i) {
  if (!_scan) return;
  const x = _scan.items[+i];
  if (!x) return;
  x.on = !x.on;
  $("dns-panel").innerHTML = _scanPickHTML(_scan);
  const b = /** @type {HTMLElement|null} */ ($("dns-panel").querySelector('.scanrow[data-i="' + x.i + '"]'));
  if (b) b.focus();
}
function scanLog() {
  if (!_scan) return;
  const ticked = _scan.items.filter(x => x.on);
  if (!ticked.length) return;
  if (_scan.form) _scanFill(_scan, ticked);
  else _scanCups(ticked, 0, _scan.date, _scan.other);
}
/** The quick cup, filled in with one row of the receipt; saving it brings up the next (form.js, qcSave).
    @param {any[]} rows @param {number} i @param {string|null} date @param {string} other a currency not the cafe's */
function _scanCups(rows, i, date, other) {
  _scanStop();
  if (!$("dnsheet").hidden) {
    _sheetOnClose = null;
    closeSheet();
  }
  const x = rows[i];
  const opts = /** @type {any} */ ({});
  ["size", "sweet", "ice", "milk"].forEach(function (k) {
    if (x[k]) opts[k] = x[k];
  });
  openSheet("", document.activeElement, function () {
    _qc = null;
  });
  _qc = {
    n: x.n,
    same: true,
    rv: "",
    other: false,
    keepPrice: false,
    scan: {
      rows: rows,
      i: i,
      date: date,
      other: other,
      opts: opts,
      price: x.price,
      notice: x.notice || "Filled in from your receipt. Change anything.",
      say: other ? "The receipt is in " + other + ", so the price is yours to fill in." : x.say || (x.price != null ? "From the receipt, before tax and tip." : ""),
    },
  };
  _qcRedraw();
  _qcFocus();
}
