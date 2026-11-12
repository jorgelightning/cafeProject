/* Unit tests for js/lib/crop.js: finding the receipt in a photo, from its brightness alone. Node only.
   The suite (tests/run.js) runs these through tests/unit.js. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { findReceipt, CROP_SMALL, CROP_MID } from "../../js/lib/crop.js";

/** A photo 3 wide by 4 tall at `side` on its long side: a background, then papers. A paper is where its middle is and
    how big it is, as fractions of the photo's width, with its lean in degrees; rows of dark print unless it is blank. */
function photo(side, bg, papers) {
  const h = side,
    w = Math.round(side * 0.75);
  const Y = new Uint8Array(w * h).fill(bg);
  for (const p of papers) {
    const a = ((p.lean || 0) * Math.PI) / 180,
      ca = Math.cos(a),
      sa = Math.sin(a);
    const cx = p.cx * w,
      cy = p.cy * w,
      pw = p.w * w,
      ph = p.h * w;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const u = (x - cx) * ca + (y - cy) * sa,
          v = (y - cy) * ca - (x - cx) * sa;
        if (Math.abs(u) > pw / 2 || Math.abs(v) > ph / 2) continue;
        /* a line of print every tenth of the paper's height, across its middle two thirds */
        const row = ((v + ph / 2) / ph) * 10;
        const print = !p.blank && Math.abs(u) < pw / 3 && row > 1 && row < 9 && row % 1 < 0.35;
        Y[y * w + x] = print ? Math.max(0, p.level - 130) : p.level;
      }
  }
  return { Y, w, h };
}
const find = (bg, papers) => findReceipt(photo(CROP_SMALL, bg, papers), photo(CROP_MID, bg, papers));
/* answers are in the small picture's pixels: back to fractions of the photo's width */
const frac = f => f && { cx: f.cx / (CROP_SMALL * 0.75), cy: f.cy / (CROP_SMALL * 0.75), w: f.w / (CROP_SMALL * 0.75), h: f.h / (CROP_SMALL * 0.75), angle: f.angle };
const near = (got, want, by, what) => assert.ok(Math.abs(got - want) <= by, what + ": " + got + " is not within " + by + " of " + want);

test("findReceipt: an upright receipt on a dark counter, with a margin kept around it", () => {
  const f = frac(find(40, [{ cx: 0.45, cy: 0.7, w: 0.4, h: 0.6, level: 235 }]));
  assert.ok(f);
  assert.equal(f.angle, 0);
  near(f.cx, 0.45, 0.02, "middle across");
  near(f.cy, 0.7, 0.02, "middle down");
  near(f.w, 0.4 + 2 * 0.6 * 0.04, 0.03, "width, with its margin");
  near(f.h, 0.6 + 2 * 0.6 * 0.04, 0.03, "height, with its margin");
});

test("findReceipt: a leaning receipt comes back with its lean, either way", () => {
  for (const lean of [10, -7]) {
    const f = frac(find(40, [{ cx: 0.5, cy: 0.66, w: 0.36, h: 0.62, level: 230, lean }]));
    assert.ok(f, "found at " + lean);
    near(f.angle, lean, 1.5, "lean");
    near(f.w, 0.36 + 2 * 0.62 * 0.04, 0.04, "its own width, not the width of the box around it");
    near(f.h, 0.62 + 2 * 0.62 * 0.04, 0.04, "its own height");
  }
});

test("findReceipt: a lean too small to matter is left alone", () => {
  const f = find(40, [{ cx: 0.5, cy: 0.66, w: 0.36, h: 0.62, level: 230, lean: 0.8 }]);
  assert.ok(f);
  assert.equal(f.angle, 0);
});

test("findReceipt: bright things that are not a receipt", () => {
  assert.equal(find(40, []), null, "a dark photo");
  assert.equal(find(40, [{ cx: 0.5, cy: 0.66, w: 0.4, h: 0.6, level: 235, blank: true }]), null, "bright and blank: a wall, a napkin");
  assert.equal(find(40, [{ cx: 0.5, cy: 0.66, w: 0.08, h: 0.1, level: 235 }]), null, "too small: a label");
});

test("findReceipt: nothing to cut when the receipt fills the photo", () => {
  assert.equal(find(40, [{ cx: 0.5, cy: 0.667, w: 0.94, h: 1.26, level: 235 }]), null);
});

test("findReceipt: a receipt on a table as bright as it is gives no answer, and one a shade darker is found", () => {
  assert.equal(find(232, [{ cx: 0.5, cy: 0.66, w: 0.4, h: 0.6, level: 232 }]), null);
  assert.ok(find(215, [{ cx: 0.5, cy: 0.66, w: 0.4, h: 0.6, level: 232 }]));
});

test("findReceipt: of two papers, the one nearer the middle", () => {
  /* a printed menu across the top, larger than the receipt under it */
  const f = frac(find(60, [
    { cx: 0.5, cy: 0.2, w: 0.9, h: 0.32, level: 228 },
    { cx: 0.44, cy: 0.86, w: 0.44, h: 0.66, level: 232 },
  ]));
  assert.ok(f);
  near(f.cy, 0.86, 0.03, "the receipt, not the menu");
});

test("findReceipt: pictures too small or cut short are refused, not read past their end", () => {
  assert.equal(findReceipt({ Y: new Uint8Array(16), w: 4, h: 4 }, photo(CROP_MID, 40, [])), null);
  assert.equal(findReceipt({ Y: new Uint8Array(10), w: 100, h: 100 }, photo(CROP_MID, 40, [])), null);
});
