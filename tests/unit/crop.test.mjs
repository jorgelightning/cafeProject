/* Unit tests for js/lib/crop.js: finding the receipt in a photo, from its brightness alone. Node only.
   The suite (tests/run.js) runs these through tests/unit.js. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { findReceipt, foundCorners, quadOk, quadSize, flatten, readable, CROP_SMALL, CROP_MID } from "../../js/lib/crop.js";

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

test("foundCorners: a found receipt as four corners, clockwise from the top left", () => {
  assert.deepEqual(foundCorners({ cx: 50, cy: 80, w: 40, h: 60, angle: 0 }), [[30, 50], [70, 50], [70, 110], [30, 110]]);
  const q = foundCorners({ cx: 0, cy: 0, w: 40, h: 60, angle: 90 });
  near(q[0][0], 30, 1e-9, "a quarter turn clockwise takes the top left to the top right");
  near(q[0][1], -20, 1e-9, "…and up");
  assert.equal(quadOk(foundCorners({ cx: 50, cy: 80, w: 40, h: 60, angle: 12 }), 5), true, "leaning, it is still a box");
});

test("quadOk: a box whose corners have crossed, folded in or closed up is not one", () => {
  const box = [[10, 10], [90, 10], [90, 150], [10, 150]];
  assert.equal(quadOk(box, 5), true);
  assert.equal(quadOk([[10, 10], [90, 30], [80, 150], [20, 140]], 5), true, "any four-sided shape that does not fold");
  assert.equal(quadOk([[95, 10], [90, 10], [90, 150], [10, 150]], 5), false, "the top left dragged past the top right");
  assert.equal(quadOk([[10, 10], [90, 10], [40, 60], [10, 150]], 5), false, "a corner folded inward");
  assert.equal(quadOk([[10, 10], [13, 10], [90, 150], [10, 150]], 5), false, "a side too short to hold anything");
  assert.equal(quadOk(box.slice().reverse(), 5), false, "the same corners the other way round");
  assert.equal(quadOk([[10, 10], [90, 10], [90, NaN], [10, 150]], 5), false);
  assert.equal(quadOk(box.slice(0, 3), 5), false);
});

test("quadSize: opposite sides averaged, so a trapezium flattens to a size between its ends", () => {
  assert.deepEqual(quadSize([[0, 0], [40, 0], [40, 60], [0, 60]]), { w: 40, h: 60 });
  assert.deepEqual(quadSize([[10, 0], [30, 0], [40, 60], [0, 60]]).w, 30);
});

/** A picture where each pixel's red is its column and green its row, so a flattened pixel says where it came from. */
function ramp(w, h) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set([x, y, 7, 255], (y * w + x) * 4);
  return d;
}
const at = (out, ow, x, y) => [out[(y * ow + x) * 4], out[(y * ow + x) * 4 + 1]];

test("flatten: an upright box is a plain cut, pixel for pixel", () => {
  const out = flatten(ramp(100, 120), 100, 120, [[20, 30], [60, 30], [60, 90], [20, 90]], 40, 60);
  assert.equal(out.length, 40 * 60 * 4);
  assert.deepEqual([at(out, 40, 0, 0), at(out, 40, 39, 0), at(out, 40, 39, 59), at(out, 40, 0, 59), at(out, 40, 17, 31)], [[20, 30], [59, 30], [59, 89], [20, 89], [37, 61]]);
  assert.deepEqual([out[2], out[3]], [7, 255], "the other colours come too, and it is solid");
});

test("flatten: a leaning box and a trapezium are pulled square, each corner to its own corner", () => {
  for (const q of [foundCorners({ cx: 50, cy: 60, w: 40, h: 60, angle: 15 }), [[30, 20], [70, 26], [84, 100], [14, 92]]]) {
    const out = flatten(ramp(100, 120), 100, 120, q, 80, 120);
    [[0, 0], [79, 0], [79, 119], [0, 119]].forEach((c, i) => {
      const got = at(out, 80, c[0], c[1]);
      near(got[0], q[i][0], 1.5, "corner " + i + " across");
      near(got[1], q[i][1], 1.5, "corner " + i + " down");
    });
    /* in perspective the middle of the flat picture is where the box's diagonals cross, not the average of its corners */
    const [p0, p1, p2, p3] = q;
    const den = (p2[0] - p0[0]) * (p3[1] - p1[1]) - (p2[1] - p0[1]) * (p3[0] - p1[0]);
    const t = ((p1[0] - p0[0]) * (p3[1] - p1[1]) - (p1[1] - p0[1]) * (p3[0] - p1[0])) / den;
    const mid = at(out, 80, 40, 60);
    near(mid[0], p0[0] + t * (p2[0] - p0[0]), 1.5, "its middle is where the diagonals cross");
    near(mid[1], p0[1] + t * (p2[1] - p0[1]), 1.5, "…down too");
  }
});

test("flatten: corners at or past the photo's edge read its edge, not past its end", () => {
  const out = flatten(ramp(50, 50), 50, 50, [[-10, -10], [60, -10], [60, 60], [-10, 60]], 20, 20);
  assert.deepEqual([at(out, 20, 0, 0), at(out, 20, 19, 19)], [[0, 0], [49, 49]]);
});

/** A 200 by 300 receipt as a picture: paper, a shadow over its lower half if asked, and whatever `paint` adds. */
function sheet(shadow, paint) {
  const w = 200, h = 300, d = new Uint8ClampedArray(w * h * 4);
  const put = (x, y, c) => d.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, shadow && y >= 150 ? [110, 120, 150] : [236, 234, 228]);
  /* rows of print: black, at the paper's own share of light where the shadow falls */
  for (const y0 of [40, 90, 200, 250]) for (let y = y0; y < y0 + 6; y++) for (let x = 30; x < 170; x += 3) put(x, y, shadow && y >= 150 ? [20, 22, 28] : [40, 40, 40]);
  if (paint) paint(put);
  return { d, w, h };
}
const greyAt = (out, w, x, y) => out[(y * w + x) * 4];

test("readable: grey, solid, and the same size", () => {
  const s = sheet(false), out = readable(s.d, s.w, s.h);
  assert.equal(out.length, s.d.length);
  for (const p of [0, 5000, 59999]) assert.deepEqual([out[p * 4] === out[p * 4 + 1], out[p * 4 + 1] === out[p * 4 + 2], out[p * 4 + 3]], [true, true, 255]);
  assert.ok(greyAt(out, s.w, 100, 20) > 240, "paper comes out white");
  assert.ok(greyAt(out, s.w, 30, 42) < 80, "print stays dark");
});

test("readable: a shadow across the receipt comes out as white as the rest, its print as dark", () => {
  const s = sheet(true), out = readable(s.d, s.w, s.h);
  const lit = greyAt(out, s.w, 100, 60), shaded = greyAt(out, s.w, 100, 270);
  assert.ok(lit > 235 && shaded > 235, "paper in the light " + lit + ", in the shadow " + shaded);
  assert.ok(Math.abs(greyAt(out, s.w, 30, 42) - greyAt(out, s.w, 30, 202)) < 40, "print reads alike on both sides of the shadow's edge");
  assert.ok(greyAt(out, s.w, 30, 202) < 90, "…and dark");
});

test("readable: a highlighter stripe vanishes, the print under it does not, and coloured ink stays dark", () => {
  const s = sheet(false, put => {
    /* a pink stripe down the right, over the ends of the lines of print */
    for (let y = 0; y < 300; y++) for (let x = 150; x < 185; x++) put(x, y, [236, 72, 153]);
    for (let y = 40; y < 46; y++) for (let x = 150; x < 170; x += 3) put(x, y, [60, 20, 40]);
    /* and a line printed in blue ink */
    for (let y = 120; y < 126; y++) for (let x = 30; x < 140; x += 3) put(x, y, [30, 40, 150]);
  });
  const out = readable(s.d, s.w, s.h);
  assert.ok(greyAt(out, s.w, 176, 20) > 235, "the stripe is paper now: " + greyAt(out, s.w, 176, 20));
  assert.ok(greyAt(out, s.w, 150, 42) < 100, "print under the stripe is still there: " + greyAt(out, s.w, 150, 42));
  assert.ok(greyAt(out, s.w, 30, 122) < 90, "blue ink is as dark as it was: " + greyAt(out, s.w, 30, 122));
});

test("readable: a picture cut short or of no size is answered with nothing, not read past its end", () => {
  assert.equal(readable(new Uint8ClampedArray(10), 100, 100).length, 40000);
  assert.equal(readable(new Uint8ClampedArray(0), 0, 0).length, 0);
  const one = readable(new Uint8ClampedArray([200, 200, 200, 255]), 1, 1);
  assert.deepEqual([one[0], one[3]], [255, 255], "one pixel is its own paper");
});
