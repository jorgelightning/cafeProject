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
   on the list is a box of its own. The list goes back to the text, and the text goes on to the list.

   Since v133 a layout the rules do not know is not a dead end: the text's lines come up, and you tap the one that names
   your drink. The list offers the same ("My drink isn't here"). And on Android the installed app is in the share sheet:
   text shared from Google Lens, or a photo from Photos, arrives here with no copy and paste (sw.js keeps it on the
   phone; scanShared picks it up).

   Since v134 a photo is cut down to its receipt before it is read (js/lib/crop.js finds it; _scanPrep cuts it out and
   stands it upright). An audit had the reader making text of everything around the receipt: on the owner's first real
   photo, 20 lines from a steel pot's holes. What you check the text against is that cut-out too, so the print is larger.
   A guess can be wrong, so there are two ways back to the whole photo: the scan takes that look itself when the paper
   it found has no drink on it, and the review has a chip, Whole photo, which swaps to it and back again. Each look keeps
   its own text, fixes and all.

   Since v135 the cut is the owner's to make ("so I have to crop it myself, so it's super refine where the receipt
   is"). Every photo stops at a box over it before anything is read: the box starts on the receipt the app found, each
   of its four corners is dragged onto the receipt's own with a magnifier beside the finger, and Read this part
   flattens what is inside them (js/lib/crop.js). The review's chip is Adjust crop now, back to the box; the swap to the
   whole photo and the scan's own second look went, since the box is where you say which part is the receipt, and
   Whole photo is a button beside it. */

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

/** A receipt shared to the app and not read yet. @type {{text: string, photo: Blob|null, at: number}|null} */
let _scanShare = null;
const SHARE_FRESH_MS = 600000;
/* The share sheet's way in (manifest.json share_target; sw.js stores what was shared and opens ./?do=scan). It goes
   where Log goes: standing in a cafe on your list, that cafe's reading starts at once; anywhere else it is Add a
   visit, and the receipt waits for the cafe's name and the Scan button. */
async function scanShared() {
  if (!scanOn()) return;
  let text = "",
    photo = null;
  try {
    const c = await caches.open("cafemap-share");
    const t = await c.match("./__share/text"),
      p = await c.match("./__share/photo");
    if (t) text = await t.text();
    if (p) photo = await p.blob();
    await caches.delete("cafemap-share");
  } catch (e) {
    warn("scan.js share", e);
  }
  if (!text.trim() && !photo) return;
  _scanShare = { text: text, photo: photo, at: Date.now() };
  let asked = false;
  ifLocationAlreadyAllowed(function () {
    asked = true;
    showUserLocation(false);
  });
  /* up to six seconds for a fix, as the Log shortcut waits; none is coming if location was never allowed */
  const go = /** @param {number} left */ function (left) {
    const fresh = userLoc && Date.now() - userLocAt < HERE_FRESH_MS;
    if (!fresh && left > 0 && (asked || left > 10)) {
      setTimeout(() => go(left - 1), 500);
      return;
    }
    if (logHere()) scanStart();
    else {
      openForm();
      toast("Add the cafe’s name, then tap Scan. Your receipt is waiting.");
    }
  };
  go(12);
}
/** Scan opens on a box for the receipt's text. */
function scanStart() {
  if (!scanOn()) return;
  /* a receipt shared to the app is what Scan reads, without asking again */
  if (_scanShare && Date.now() - _scanShare.at < SHARE_FRESH_MS) {
    const s = _scanShare;
    _scanShare = null;
    if (s.photo) _scanRun(s.photo);
    else _scanTextRun(s.text);
    return;
  }
  _scanShare = null;
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
  _scanTextRun(box ? box.value : "");
}
/** @param {string} text */
function _scanTextRun(text) {
  const run = text.trim() ? _scanNew() : null;
  if (!run) return;
  /* the photo, if there is one, goes with the reading, so Back to the text can show it again */
  const prev = _scan;
  if (prev && prev.url) {
    run.url = prev.url;
    run.pic = prev.pic;
    prev.url = "";
    prev.pic = null;
  }
  _scanStop();
  _qc = null;
  if ($("dnsheet").hidden) openSheet("");
  _sheetOnClose = _scanStop;
  run.text = text;
  _scan = run;
  _scanDraft = text;
  _scanRoute(run, parseReceipt(text, _scanCtx(run)));
}
/** The lines a drink could be picked from: the ones with words in them. @param {any} run */
function _scanLinesOf(run) {
  return receiptLines(run.text || "", ccyMeta(run.code).dec).filter(l => /[A-Za-z].*[A-Za-z]/.test(l)).slice(0, 40);
}
/** A layout the rules do not know: the text's lines, to tap the one that names your drink. @param {any} run @param {boolean} fromList */
function _scanLines(run, fromList) {
  run.lines = _scanLinesOf(run);
  run.items = [];
  _scanShow(
    '<span class="dngrab" aria-hidden="true"></span><div class="qctop"><div class="dnhead"><h2 id="dns-title">Which line is your drink?</h2><p>' +
      (fromList ? "Tap the line that names your drink." : "It couldn’t find a drink in this layout. Tap the line that names yours.") + "</p></div>" + _scanClose() + "</div>" +
      _scanThumb(run) +
      '<div class="scanlines">' +
      run.lines.map((l, i) => '<button type="button" class="scanln" aria-pressed="false" data-i="' + i + '"' + act("scanLine", ["$data.i"]) + ">" + esc(l) + "</button>").join("") +
      "</div>" +
      '<label class="dnlab" for="scan-linename">Drink</label>' +
      '<input id="scan-linename" class="scanname" type="text" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="80" placeholder="Tap a line above"' + act("scanLineName", ["$value"], "input") + ">" +
      '<div class="dnact"><button type="button" class="btn ghost"' + act("scanBack") + ">Back to the text</button>" +
      '<button type="button" class="btn" id="scan-log"' + act("scanLog") + " disabled>Tap a line</button></div>"
  );
}
function _scanLineSync() {
  const btn = /** @type {HTMLButtonElement|null} */ ($("scan-log"));
  const named = !!(_scan && _scan.items[0] && _scan.items[0].n.trim());
  if (btn) {
    btn.disabled = !named;
    btn.textContent = named ? "Log 1 cup" : "Tap a line";
  }
}
/** @param {string} i */
function scanLine(i) {
  if (!_scan || !_scan.lines || !_scan.lines[+i]) return;
  _scan.items = [Object.assign({ i: 0, on: true, say: "" }, lineItem(_scan.lines, +i, _scanCtx(_scan)))];
  $("dns-panel").querySelectorAll(".scanln").forEach(b => b.setAttribute("aria-pressed", String(/** @type {HTMLElement} */ (b).dataset.i === String(i))));
  const box = /** @type {HTMLInputElement|null} */ ($("scan-linename"));
  if (box) box.value = _scan.items[0].n;
  _scanLineSync();
}
/** The name, put right or typed outright. @param {string} v */
function scanLineName(v) {
  if (!_scan) return;
  if (!_scan.items.length) _scan.items = [{ i: 0, on: true, say: "", n: "", isNew: true, printed: "", drink: true, odd: false, price: null, size: "", sweet: "", ice: "", milk: "" }];
  _scan.items[0].n = String(v).slice(0, 80);
  _scanLineSync();
}
function scanPickLine() {
  if (_scan) _scanLines(_scan, true);
}
/** Your photo and the text it read, to put right before anything is made of it. @param {any} run @param {string} text */
function _scanReview(run, text) {
  run.text = text;
  _scanShow(
    '<span class="dngrab" aria-hidden="true"></span><div class="qctop"><div class="dnhead"><h2 id="dns-title">Check what it read</h2><p>Fix anything it got wrong, then continue.</p></div>' + _scanClose() + "</div>" +
      _scanThumb(run, true) +
      '<label class="dnlab" for="scan-text">Text it read</label>' +
      '<textarea id="scan-text" class="dntext scantxt" rows="7" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"' + act("scanTyped", [], "input") + ">" + esc(text) + "</textarea>" +
      '<div class="dnact"><button type="button" class="btn ghost"' + act("scanPhoto") + ">Retake</button>" +
      '<button type="button" class="btn" id="scan-go"' + act("scanText") + (text.trim() ? "" : " disabled") + ">Find the drinks</button></div>"
  );
}
/** Your photo, on the text and again on the list (v132): the names are checked against it, so it has to be in view.
    Since v135 it is the part of the photo you boxed, pulled flat, and on the text (`again`) a chip goes back to the box.
    @param {any} run @param {boolean} [again] */
function _scanThumb(run, again) {
  if (!run.url) return "";
  const pic = run.pic;
  return (
    '<div class="scanthumb"><img src="' + esc(run.url) + '" alt="' + (pic && pic.read && pic.read !== "all" ? "Your receipt, cut out of your photo" : "Your photo") + '">' +
    (again && pic ? '<button type="button" class="scanview"' + act("scanCropAgain") + "><span>Adjust crop</span></button>" : "") +
    "</div>"
  );
}
/* the photo as it is shown under the box, on its longer side; and the shortest a side of the box may be, of the photo's
   shorter side, so the box cannot be closed up to nothing */
const CROP_SHOW = 1600;
const CROP_LEAST = 0.06;
const CROP_START = 0.08;
/** A box, held as fractions of the photo, in the photo's own pixels. @param {any} pic @param {number[][]} q */
function _scanQuadPx(pic, q) {
  return q.map(p => [p[0] * pic.w, p[1] * pic.h]);
}
/** @param {any} pic @param {number[][]} q */
function _scanQuadOk(pic, q) {
  return quadOk(_scanQuadPx(pic, q), CROP_LEAST * Math.min(pic.w, pic.h));
}
/** Where's the receipt? Your photo with a box over it, a corner to drag at each of its corners (v135). Nothing is read
    until you say which part. @param {any} run */
function _scanCrop(run) {
  const pic = run.pic;
  _scanShow(
    '<span class="dngrab" aria-hidden="true"></span><div class="qctop"><div class="dnhead"><h2 id="dns-title">Where’s the receipt?</h2><p>' +
      (pic.guess ? "Drag the corners until the box fits it." : "Drag the corners onto the receipt’s corners.") + "</p></div>" + _scanClose() + "</div>" +
      '<div class="scancropwrap"><div class="scancrop" id="scan-crop"><img id="scan-cropimg" src="' + esc(pic.url) + '" alt="Your photo" draggable="false">' +
      '<svg class="scanquad" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path id="scan-shade" fill-rule="evenodd"/><polygon id="scan-edge"/></svg>' +
      ["Top left", "Top right", "Bottom right", "Bottom left"].map((n, i) => '<button type="button" class="scanhd" data-i="' + i + '" aria-label="' + n + ' corner"></button>').join("") +
      '<canvas class="scanloupe" id="scan-loupe" width="208" height="208" hidden></canvas></div></div>' +
      '<div class="dnact"><button type="button" class="btn ghost" id="scan-all"' + act("scanCropAll") + ">Whole photo</button>" +
      '<button type="button" class="btn" id="scan-read"' + act("scanCropGo") + ">Read this part</button></div>" +
      '<button type="button" class="scanalt"' + act("scanPhoto") + ">Retake</button>"
  );
  _scanCropDraw();
  $("scan-crop").querySelectorAll(".scanhd").forEach(function (h) {
    const el = /** @type {HTMLElement} */ (h),
      i = +el.dataset.i;
    /* where on the corner the finger took hold, so the corner does not jump to the finger */
    let off = [0, 0];
    /** @param {number} x @param {number} y a place on the screen, as a fraction of the photo */
    const at = function (x, y) {
      const r = $("scan-cropimg").getBoundingClientRect();
      return r.width && r.height ? [(x - r.left) / r.width, (y - r.top) / r.height] : null;
    };
    el.addEventListener("pointerdown", function (e) {
      const p = at(e.clientX, e.clientY),
        q = _scan && _scan.pic && _scan.pic.quad;
      if (!p || !q) return;
      off = [p[0] - q[i][0], p[1] - q[i][1]];
      el.dataset.drag = "1";
      /* the finger may leave the corner on the way; the drag still belongs to it */
      try {
        el.setPointerCapture(e.pointerId);
      } catch (err) {
        warn("scan.js crop capture", err);
      }
      _scanLoupe(i);
    });
    el.addEventListener("pointermove", function (e) {
      const p = el.dataset.drag ? at(e.clientX, e.clientY) : null;
      if (!p) return;
      _scanCropMove(i, p[0] - off[0], p[1] - off[1]);
      _scanLoupe(i);
    });
    const end = function () {
      delete el.dataset.drag;
      _scanLoupe(-1);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    /* the arrow keys move a corner too: a little, or with Shift a lot */
    el.addEventListener("keydown", function (e) {
      const d = /** @type {Record<string, number[]>} */ ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] })[e.key],
        q = _scan && _scan.pic && _scan.pic.quad;
      if (!d || !q) return;
      e.preventDefault();
      const step = e.shiftKey ? 0.03 : 0.005;
      _scanCropMove(i, q[i][0] + d[0] * step, q[i][1] + d[1] * step);
    });
  });
}
/** Puts the box where its corners are: the shade outside it, its edge, and the four corners to drag. */
function _scanCropDraw() {
  const pic = _scan && _scan.pic,
    box = $("scan-crop");
  if (!pic || !box) return;
  const pts = pic.quad.map(/** @param {number[]} p */ p => (p[0] * 100).toFixed(2) + " " + (p[1] * 100).toFixed(2));
  $("scan-shade").setAttribute("d", "M0 0H100V100H0Z M" + pts.join(" L") + "Z");
  $("scan-edge").setAttribute("points", pts.join(" "));
  box.querySelectorAll(".scanhd").forEach(function (h, i) {
    const s = /** @type {HTMLElement} */ (h).style;
    s.left = pic.quad[i][0] * 100 + "%";
    s.top = pic.quad[i][1] * 100 + "%";
  });
}
/** One corner goes where it is put, inside the photo. The move is taken only while the box is still a box, so a corner
    cannot be dragged past its neighbours or the box closed up. @param {number} i @param {number} x @param {number} y */
function _scanCropMove(i, x, y) {
  const pic = _scan && _scan.pic;
  if (!pic) return;
  const next = pic.quad.map(/** @param {number[]} p */ p => p.slice());
  next[i] = [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
  if (!_scanQuadOk(pic, next)) return;
  pic.quad = next;
  _scanCropDraw();
}
/** The magnifier: the photo around the corner being dragged, enlarged, since the finger is on top of the very thing it
    is placing. It sits in a top corner of the photo, the one the finger is not in. @param {number} i the corner, or -1 to put it away */
function _scanLoupe(i) {
  const cv = /** @type {HTMLCanvasElement|null} */ ($("scan-loupe")),
    img = /** @type {HTMLImageElement|null} */ ($("scan-cropimg")),
    pic = _scan && _scan.pic;
  if (!cv) return;
  if (i < 0 || !img || !pic || !img.naturalWidth) {
    cv.hidden = true;
    return;
  }
  const r = img.getBoundingClientRect(),
    q = pic.quad,
    p = q[i];
  const side = cv.width,
    zoom = 2.5,
    shown = 104;
  /* how much of the photo, in its own pixels, fills the glass */
  const nw = ((shown / zoom) * img.naturalWidth) / r.width,
    nh = ((shown / zoom) * img.naturalHeight) / r.height;
  const g = cv.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, side, side);
  g.drawImage(img, p[0] * img.naturalWidth - nw / 2, p[1] * img.naturalHeight - nh / 2, nw, nh, 0, 0, side, side);
  /* the two edges of the box that meet here, and a cross on the corner itself */
  /** @param {number[]} c */
  const to = c => [side / 2 + ((c[0] - p[0]) * img.naturalWidth * side) / nw, side / 2 + ((c[1] - p[1]) * img.naturalHeight * side) / nh];
  const a = to(q[(i + 3) % 4]),
    b = to(q[(i + 1) % 4]);
  g.lineWidth = 3;
  g.strokeStyle = "#fff";
  g.beginPath();
  g.moveTo(a[0], a[1]);
  g.lineTo(side / 2, side / 2);
  g.lineTo(b[0], b[1]);
  g.stroke();
  g.strokeStyle = "rgba(0,0,0,.7)";
  g.lineWidth = 6;
  g.beginPath();
  g.arc(side / 2, side / 2, 9, 0, 7);
  g.stroke();
  g.strokeStyle = "#fff";
  g.lineWidth = 3;
  g.beginPath();
  g.arc(side / 2, side / 2, 9, 0, 7);
  g.stroke();
  cv.classList.toggle("r", p[0] < 0.5);
  cv.hidden = false;
}
function scanCropGo() {
  if (_scan && _scan.pic) _scanRead(_scan, _scan.pic.quad);
}
function scanCropAll() {
  if (_scan && _scan.pic) _scanRead(_scan, null);
}
/** From the text back to the box. What you fixed in the text is kept, and comes back if the box is left as it was. */
function scanCropAgain() {
  const run = _scan;
  if (!run || !run.pic) return;
  const box = /** @type {HTMLTextAreaElement|null} */ ($("scan-text"));
  if (box) run.text = box.value;
  _scanCrop(run);
}
/* From the list or a failed reading, back to the text it came from */
function scanBack() {
  if (_scan && _scan.url && _scan.text != null) {
    _scanReview(_scan, _scan.text);
    return;
  }
  /* a photo that would not read goes back to its box: move it, read the whole photo, or retake */
  if (_scan && _scan.pic) {
    _scanCrop(_scan);
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
/** Lets go of a reading's pictures: the part that was read, and the photo under the box. @param {any} run */
function _scanFree(run) {
  new Set([run.url, run.pic && run.pic.url]).forEach(function (u) {
    if (u) URL.revokeObjectURL(u);
  });
  run.url = "";
  run.pic = null;
}
function _scanStop() {
  if (!_scan) return;
  _scan.ctl.abort();
  _scanFree(_scan);
  _scan = null;
}
/** Where the receipt is in a photo (js/lib/crop.js), in the photo's own pixels, or null. It is only where the box
    starts, and whatever goes wrong in here the box starts in the middle. @param {ImageBitmap} bmp */
function _scanFind(bmp) {
  try {
    /** @param {ImageBitmap|HTMLCanvasElement} from @param {number} side */
    const shrink = function (from, side) {
      const k = Math.min(1, side / Math.max(from.width, from.height));
      const c = document.createElement("canvas");
      c.width = Math.max(8, Math.round(from.width * k));
      c.height = Math.max(8, Math.round(from.height * k));
      const g = c.getContext("2d", { willReadFrequently: true });
      g.imageSmoothingQuality = "high";
      g.drawImage(from, 0, 0, c.width, c.height);
      return c;
    };
    /** @param {HTMLCanvasElement} c */
    const grey = function (c) {
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      const Y = new Uint8Array(c.width * c.height);
      for (let i = 0, p = 0; p < Y.length; i += 4, p++) Y[p] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      return { Y: Y, w: c.width, h: c.height };
    };
    /* down in steps, so a 12-megapixel photo is averaged rather than sampled */
    const mid = shrink(shrink(bmp, CROP_MID * 2), CROP_MID),
      small = shrink(mid, CROP_SMALL);
    const f = findReceipt(grey(small), grey(mid));
    if (!f) return null;
    const k = bmp.width / small.width;
    return { cx: f.cx * k, cy: f.cy * k, w: f.w * k, h: f.h * k, angle: f.angle };
  } catch (e) {
    warn("scan.js crop", e);
    return null;
  }
}
/* the most of the photo taken in to be flattened, on its longer side: a receipt across a 12-megapixel photo, whole */
const FLAT_SIDE = 3200;
/** The part of the photo inside your box, pulled flat and upright (flatten, js/lib/crop.js), no larger than the reader
    wants. It is cut from the photo's own pixels, before any shrinking, so a small receipt in a large photo keeps its
    detail. @param {ImageBitmap} bmp @param {number[][]} quad the box, in the photo's pixels */
function _scanFlat(bmp, quad) {
  const xs = quad.map(p => p[0]),
    ys = quad.map(p => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))),
    y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const bw = Math.max(2, Math.min(bmp.width, Math.ceil(Math.max(...xs))) - x0),
    bh = Math.max(2, Math.min(bmp.height, Math.ceil(Math.max(...ys))) - y0);
  const s = Math.min(1, FLAT_SIDE / Math.max(bw, bh));
  const src = document.createElement("canvas");
  src.width = Math.max(2, Math.round(bw * s));
  src.height = Math.max(2, Math.round(bh * s));
  const sg = src.getContext("2d", { willReadFrequently: true });
  sg.imageSmoothingQuality = "high";
  sg.drawImage(bmp, x0, y0, bw, bh, 0, 0, src.width, src.height);
  const q = quad.map(p => [((p[0] - x0) * src.width) / bw, ((p[1] - y0) * src.height) / bh]);
  const size = quadSize(q);
  const k = Math.min(1, SCAN_SIDE / Math.max(size.w, size.h));
  const cv = document.createElement("canvas");
  cv.width = Math.max(8, Math.round(size.w * k));
  cv.height = Math.max(8, Math.round(size.h * k));
  const px = cv.getContext("2d").createImageData(cv.width, cv.height);
  px.data.set(flatten(sg.getImageData(0, 0, src.width, src.height).data, src.width, src.height, q, cv.width, cv.height));
  cv.getContext("2d").putImageData(px, 0, 0);
  return cv;
}
/** What is read, twice over: to show (url), and grey with its contrast stretched for the reader, since a receipt
    photographed in a dim cafe has no true black or white. Drawing it on a canvas also turns it upright.
    With a box it is the part of the photo inside it, pulled flat (v135); with none, the whole photo.
    @param {Blob} file @param {number[][]|null} [quad] in the photo's pixels @returns {Promise<{image: HTMLCanvasElement, url: string}>} */
async function _scanPrep(file, quad) {
  const bmp = await createImageBitmap(file);
  /** @type {HTMLCanvasElement} */
  let cv;
  if (quad) cv = _scanFlat(bmp, quad);
  else {
    const k = Math.min(1, SCAN_SIDE / Math.max(bmp.width, bmp.height));
    cv = document.createElement("canvas");
    cv.width = Math.round(bmp.width * k);
    cv.height = Math.round(bmp.height * k);
    cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
  }
  bmp.close();
  const g = cv.getContext("2d");
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
/** The screen that says to wait, with the photo once there is one to show. @param {string} title */
function _scanWait(title) {
  _scanShow(
    '<div class="scanr"><button type="button" class="ocx" aria-label="Cancel"' + act("closeSheet") + ">" + ico("x") + "</button>" +
      '<div class="scanphoto"><img id="scan-img" alt="Your photo" hidden><span class="scanline" aria-hidden="true"></span></div>' +
      '<div class="scanwords"><h2 id="dns-title">' + esc(title) + '</h2><p id="scan-note">Getting ready. The first time takes a little longer.</p></div></div>'
  );
}
/** A photo, from the file box or shared to the app, as far as its box (v135): nothing is read until you say which part
    of it is the receipt. @param {Blob} file */
async function _scanRun(file) {
  _scanStop();
  const run = _scanNew();
  if (!run) return;
  _scan = run;
  _qc = null;
  if ($("dnsheet").hidden) openSheet("");
  _sheetOnClose = _scanStop;
  _scanWait("Getting your photo ready…");
  try {
    const bmp = await createImageBitmap(file);
    const f = _scanFind(bmp);
    const w = bmp.width,
      h = bmp.height;
    const k = Math.min(1, CROP_SHOW / Math.max(w, h));
    const cv = document.createElement("canvas");
    cv.width = Math.round(w * k);
    cv.height = Math.round(h * k);
    cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
    bmp.close();
    const blob = await new Promise(ok => cv.toBlob(ok, "image/jpeg", 0.8));
    if (!blob) throw new Error("no image");
    if (_scan !== run) return;
    /* the box starts on the receipt it found, kept inside the photo; with none found, or a find that is not a box
       once it is kept inside, a little in from the photo's edges */
    /** @type {any} */
    const pic = { file: file, w: w, h: h, url: URL.createObjectURL(blob), guess: false, read: "", quad: [[CROP_START, CROP_START], [1 - CROP_START, CROP_START], [1 - CROP_START, 1 - CROP_START], [CROP_START, 1 - CROP_START]] };
    if (f) {
      const q = foundCorners(f).map(p => [Math.min(1, Math.max(0, p[0] / w)), Math.min(1, Math.max(0, p[1] / h))]);
      if (_scanQuadOk(pic, q)) {
        pic.quad = q;
        pic.guess = true;
      }
    }
    run.pic = pic;
    _scanCrop(run);
  } catch (e) {
    if (_scan !== run) return;
    warn("scan.js", e);
    _scanFail("Something went wrong reading that. Try again, or type it in.");
  }
}
/** Reads the part of the photo inside the box, or all of it, and goes on to the text. A box left as it was is not read
    twice: the text comes back as you left it. @param {any} run @param {number[][]|null} quad as fractions of the photo */
async function _scanRead(run, quad) {
  const pic = run.pic,
    key = quad ? JSON.stringify(quad) : "all";
  if (pic.read === key && run.url && run.text != null) {
    _scanReview(run, run.text);
    return;
  }
  /* an earlier reading that ran out of time has spent its stop: this one gets its own */
  if (run.ctl.signal.aborted) run.ctl = new AbortController();
  const ctl = run.ctl;
  _scanWait("Reading your receipt…");
  const timer = setTimeout(() => ctl.abort(), SCAN_WAIT_MS);
  try {
    const made = await _scanPrep(pic.file, quad ? _scanQuadPx(pic, quad) : null);
    if (_scan !== run) {
      URL.revokeObjectURL(made.url);
      return;
    }
    if (run.url) URL.revokeObjectURL(run.url);
    run.url = made.url;
    pic.read = "";
    const img = /** @type {HTMLImageElement|null} */ ($("scan-img"));
    if (img) {
      img.src = made.url;
      img.hidden = false;
    }
    /* an abort stops the reader, which then never answers, so it has to end the wait too */
    const stopped = new Promise((_, no) => ctl.signal.addEventListener("abort", () => no(new DOMException("stopped", "AbortError"))));
    const say = /** @param {string} step */ function (step) {
      const note = $("scan-note");
      if (note && _scan === run) note.textContent = step === "again" ? "That was hard to read. Taking a closer look." : "Looking for drinks and prices. The photo stays on your phone.";
    };
    if (ctl.signal.aborted) throw new DOMException("stopped", "AbortError");
    const res = await Promise.race([_scanMake(made.image, ctl.signal, _scanCtx(run), say), stopped]);
    if (_scan !== run) return;
    if (!String(res.text || "").trim()) {
      run.text = null;
      _scanFail("Try your phone’s text reader instead, or type it in.");
    } else {
      pic.read = key;
      _scanReview(run, res.text);
    }
  } catch (e) {
    if (_scan !== run) return;
    warn("scan.js", e);
    run.text = null;
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
    if (_scanLinesOf(run).length) _scanLines(run, false);
    else _scanFail("No drinks found in that text. Check that it all came across, or type it in.");
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
    _scanThumb(run) +
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
    (_scanLinesOf(run).length ? '<button type="button" class="scanalt"' + act("scanPickLine") + ">My drink isn’t here</button>" : "") +
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
