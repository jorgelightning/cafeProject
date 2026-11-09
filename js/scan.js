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

   Tesseract turned out poor on real phone photos (v129), and the owner's first real receipt was a cup's order ticket
   with no prices at all. So Scan now opens on a box for the receipt's text, which the phone's own reader fills far
   better than anything a page can load: Scan Text from an iPhone's keyboard, or text copied out of Google Lens or
   the Photos app and pasted. Reading a photo in the app is still there, as the second choice.

   Log only opens the sheet on a cafe page or standing in a cafe; anywhere else it opens Add a visit, so Scan is there
   too (v128), once the cafe has a name (v130): a scan then always knows whose drinks it is reading. From there each
   cup becomes a row of the form.

   Since v130 every reading stops at the list to tick, one drink or five, so you see what was printed beside what
   the app made of it before anything is filled in.

   Since v131 a photo read in the app stops one step earlier too: your photo with the text it read under it, in a box
   to put right, because a misread word and a misunderstood line look the same from the far end. And a drink's name
   on the list is a box of its own. The list goes back to the text, and the text goes on to the list. */

function scanOn() {
  return isAdmin;
}
/** Reading a photo in the app needs WebAssembly and a way to decode the photo. */
function _scanCanRead() {
  return typeof WebAssembly === "object" && typeof createImageBitmap === "function";
}
const SCAN_WAIT_MS = 90000;
/* Enough for small receipt print to be read, and no more: every extra pixel is time on a phone */
const SCAN_SIDE = 2400;
const OCR_DIR = "vendor/tesseract-7.0.0/";
/** The scan in progress: what the sheet is showing while it is not the quick cup. @type {any} */
let _scan = null;
/* text that found no drinks, kept so Try again does not start from an empty box */
let _scanDraft = "";

/** Scan opens on a box for the receipt's text. */
function scanStart() {
  if (!scanOn()) return;
  _scanStop();
  _qc = null;
  if ($("dnsheet").hidden) openSheet("");
  _sheetOnClose = _scanStop;
  const ua = navigator.userAgent || "";
  const how = /iPhone|iPad|iPod/.test(ua)
    ? "Tap the box and choose Scan Text (it may be under AutoFill), then point the camera at the receipt. Or paste text copied from a photo."
    : /Android/.test(ua)
      ? "Open the receipt in Google Lens or your Photos app, copy its text, then paste it here."
      : "Copy the receipt’s text with your phone’s text reader, then paste it here.";
  const canPaste = !!(navigator.clipboard && navigator.clipboard.readText);
  _scanShow(
    '<span class="dngrab" aria-hidden="true"></span><div class="qctop"><div class="dnhead"><h2 id="dns-title">Scan a receipt</h2><p>' + esc(how) + "</p></div>" + _scanClose() + "</div>" +
      '<label class="dnlab" for="scan-text">Receipt text</label>' +
      '<textarea id="scan-text" class="dntext scantxt" rows="6" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Paste or scan the text here"' +
      act("scanTyped", [], "input") + ">" + esc(_scanDraft) + "</textarea>" +
      '<div class="dnact">' + (canPaste ? '<button type="button" class="btn ghost"' + act("scanPaste") + ">Paste</button>" : "") +
      '<button type="button" class="btn" id="scan-go"' + act("scanText") + (_scanDraft.trim() ? "" : " disabled") + ">Read it</button></div>" +
      (_scanCanRead() ? '<button type="button" class="scanalt"' + act("scanPhoto") + ">Or read a photo in the app</button>" : "")
  );
}
function scanTyped() {
  const box = /** @type {HTMLTextAreaElement|null} */ ($("scan-text")),
    go = /** @type {HTMLButtonElement|null} */ ($("scan-go"));
  if (box && go) go.disabled = !box.value.trim();
}
async function scanPaste() {
  const box = /** @type {HTMLTextAreaElement|null} */ ($("scan-text"));
  if (!box) return;
  try {
    const t = await navigator.clipboard.readText();
    if (!t.trim()) {
      toast("Nothing copied yet");
      return;
    }
    box.value = t;
    scanTyped();
  } catch (e) {
    toast("Couldn’t paste. Press and hold the box, then choose Paste.");
  }
}
/** The box's text, read as a receipt. */
function scanText() {
  const box = /** @type {HTMLTextAreaElement|null} */ ($("scan-text"));
  const text = box ? box.value : "";
  const run = text.trim() ? _scanNew() : null;
  if (!run) return;
  /* the photo, if there is one, goes with the reading, so Back to the text can show it again */
  const prev = _scan;
  if (prev && prev.url) {
    run.url = prev.url;
    prev.url = "";
  }
  _scanStop();
  run.text = text;
  _scan = run;
  _scanDraft = text;
  _scanRoute(run, parseReceipt(text, _scanCtx(run)));
}
/** Your photo and the text it read, to put right before anything is made of it. @param {any} run @param {string} text */
function _scanReview(run, text) {
  run.text = text;
  _scanShow(
    '<span class="dngrab" aria-hidden="true"></span><div class="qctop"><div class="dnhead"><h2 id="dns-title">Check what it read</h2><p>Fix anything it got wrong, then continue.</p></div>' + _scanClose() + "</div>" +
      (run.url ? '<div class="scanthumb"><img src="' + esc(run.url) + '" alt="Your photo"></div>' : "") +
      '<label class="dnlab" for="scan-text">Text it read</label>' +
      '<textarea id="scan-text" class="dntext scantxt" rows="7" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"' + act("scanTyped", [], "input") + ">" + esc(text) + "</textarea>" +
      '<div class="dnact"><button type="button" class="btn ghost"' + act("scanPhoto") + ">Retake</button>" +
      '<button type="button" class="btn" id="scan-go"' + act("scanText") + (text.trim() ? "" : " disabled") + ">Find the drinks</button></div>"
  );
}
/* From the list or a failed reading, back to the text it came from */
function scanBack() {
  if (_scan && _scan.url && _scan.text != null) {
    _scanReview(_scan, _scan.text);
    return;
  }
  if (_scan && _scan.text != null) _scanDraft = _scan.text;
  scanStart();
}
function scanPhoto() {
  const f = /** @type {HTMLInputElement|null} */ ($("scan-file"));
  if (!f || !scanOn()) return;
  /* so choosing the same photo again still counts as a change */
  f.value = "";
  f.click();
}
/** A scan of the cafe you are on, or of Add a visit. @returns {any} */
function _scanNew() {
  const form = app.dataset.view === "form";
  const c = form ? cafes.find(x => x.id === editId) || null : cafes.find(x => x.id === curId);
  if (!c && !form) return null;
  return { c: c, form: form, code: _scanCode(c), ctl: new AbortController(), url: "", items: [], date: null };
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
  _scanStop();
  const run = _scanNew();
  if (!run) return;
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
    const res = await Promise.race([_scanMake(pic.image, run.ctl.signal, _scanCtx(run), say), stopped]);
    if (_scan !== run) return;
    if (!String(res.text || "").trim()) _scanFail("Try your phone’s text reader instead, or type it in.");
    else _scanReview(run, res.text);
  } catch (e) {
    if (_scan !== run) return;
    warn("scan.js", e);
    _scanFail(
      e && e.name === "AbortError"
        ? "That took too long. Try your phone’s text reader instead, or type it in."
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
/** What the parser needs to know. Your drinks at this cafe come first, then everywhere else, so a name on a receipt
    becomes the name you already use for it. @param {any} run */
function _scanCtx(run) {
  const here = ((run.c && run.c.drinks) || []).map(d => d.n).filter(Boolean);
  const seen = new Set(here.map(n => n.toLowerCase()));
  const rest = Object.values(drinkIndex()).map(e => e.n).filter(n => !seen.has(n.toLowerCase()));
  return { known: here.concat(rest), code: run.code, dec: ccyMeta(run.code).dec, today: localToday() };
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
      '<button type="button" class="btn"' + act("scanBack") + ">Try again</button></div>"
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
    off = run.off,
    other = run.other;
  _sheetOnClose = _scanStop;
  closeSheet();
  if ($("f-wish") && $("f-wish").checked) {
    $("f-wish").checked = false;
    syncWishMode();
    syncMore(false);
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
  if (res.kind === "unreadable") {
    _scanFail("No drinks found in that text. Check that it all came across, or type it in.");
    return;
  }
  _scanDraft = "";
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
  _scanShow(_scanPickHTML(run));
}
/** What a row knows, as tags: "oat", "16 oz", and then "had 3× here". @param {any} run @param {any} x a row */
function _scanTags(run, x) {
  const d = ((run.c && run.c.drinks) || []).find(y => (y.n || "").trim().toLowerCase() === x.n.trim().toLowerCase());
  const cups = d ? drinkOrders(d).reduce((t, o) => t + orderQty(o), 0) : 0;
  const note = x.odd ? "Not sure it’s a drink" : !x.drink ? "Not a drink" : cups ? "had " + cups + "× here" : run.c ? "new here" : "";
  return (
    orderOptsText(x).split(" · ").filter(Boolean).map(t => '<span class="scantag">' + esc(t) + "</span>").join("") +
    (note ? '<span class="scannote">' + esc(note) + "</span>" : "")
  );
}
/** "Log 2 cups", counting the ticked rows that have a name. @param {any} run */
function _scanGo(run) {
  const n = run.items.filter(x => x.on && x.n.trim()).length;
  return n ? "Log " + n + (n === 1 ? " cup" : " cups") : "";
}
/** @param {any} run */
function _scanPickHTML(run) {
  const go = _scanGo(run);
  const day = run.date || localToday();
  return (
    '<span class="dngrab" aria-hidden="true"></span><div class="qctop"><div class="dnhead"><h2 id="dns-title">' + (run.items.length === 1 ? "Is this yours?" : "Which ones were yours?") + "</h2><p>" +
    esc(run.c ? run.c.name : $("f-name").value.trim() || "Your receipt") + " · " + (day === localToday() ? "Today, " : "") + esc(_noteDay(day)) + "</p></div>" + _scanClose() + "</div>" +
    '<div class="scanlist">' +
    run.items
      .map(function (x) {
        return (
          '<div class="scanrow"><button type="button" class="scantick" aria-label="Log this drink" aria-pressed="' + x.on + '" data-i="' + x.i + '"' + act("scanTick", ["$data.i"]) + ">" +
          '<span class="scanbox" aria-hidden="true">' + (x.on ? "✓" : "") + "</span></button>" +
          '<span class="scantext"><input class="scanname" type="text" aria-label="Drink name" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="80" data-i="' + x.i + '" value="' + esc(x.n) + '"' +
          act("scanName", ["$data.i", "$value"], "input") + '><span class="scantags">' + _scanTags(run, x) + "</span>" +
          (x.printed ? "<small>Printed: " + esc(x.printed) + "</small>" : "") + "</span>" +
          '<span class="scanp">' + esc(x.price != null ? fmtLocal(x.price, run.code) : "") + "</span></div>"
        );
      })
      .join("") +
    "</div>" +
    '<p class="scanfoot">' + (run.other ? "This receipt is in " + esc(run.other) + ", so add each price yourself." : run.off ? "These prices don’t add up to the receipt’s subtotal, so one may be misread." : "Tax, tip and the total are left out.") + "</p>" +
    '<div class="dnact"><button type="button" class="btn ghost"' + act("scanBack") + ">Back to the text</button>" +
    '<button type="button" class="btn" id="scan-log"' + act("scanLog") + (go ? ">" + go : " disabled>Tick a drink") + "</button></div>"
  );
}
/* The ticks and the button, brought in line with the rows without drawing them again: a name being typed keeps its cursor */
function _scanPickSync() {
  if (!_scan) return;
  _scan.items.forEach(function (x) {
    const b = $("dns-panel").querySelector('.scantick[data-i="' + x.i + '"]');
    if (!b) return;
    b.setAttribute("aria-pressed", String(x.on));
    b.querySelector(".scanbox").textContent = x.on ? "✓" : "";
  });
  const btn = /** @type {HTMLButtonElement|null} */ ($("scan-log")),
    go = _scanGo(_scan);
  if (btn) {
    btn.disabled = !go;
    btn.textContent = go || "Tick a drink";
  }
}
/** @param {string} i */
function scanTick(i) {
  if (!_scan) return;
  const x = _scan.items[+i];
  if (!x) return;
  x.on = !x.on;
  _scanPickSync();
}
/** A name put right on the list. Naming a row is saying it is yours, so it ticks itself. @param {string} i @param {string} v */
function scanName(i, v) {
  if (!_scan) return;
  const x = _scan.items[+i];
  if (!x) return;
  x.n = String(v).slice(0, 80);
  if (x.n.trim()) x.on = true;
  _scanPickSync();
}
function scanLog() {
  if (!_scan) return;
  const ticked = _scan.items.filter(x => x.on && x.n.trim()).map(x => Object.assign({}, x, { n: x.n.trim() }));
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
