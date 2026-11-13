/* Unit tests for js/lib/crop.js: finding the receipt in a photo, from its brightness alone. Node only.
   The suite (tests/run.js) runs these through tests/unit.js. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { findReceipt, findStart, foundCorners, quadOk, quadSize, flatten, readable, quadPoint, quadBand, patchLook, photoCheck, CROP_SMALL, CROP_MID } from "../../js/lib/crop.js";

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

/* ---- where the box starts (v138): the paper, or failing that the print ---- */
/** A photo 3 wide by 4 tall, as `photo` above, but with print as it is: thin lines of short dashes. Each area is
    { x0, y0, x1, y1 } as fractions of the photo's width and height, with `level` for its paper, `print` unless it
    is blank, and `warm` to mark it as coloured like a hand or a counter. */
function scene(side, bg, areas) {
  const h = side, w = Math.round(side * 0.75), Y = new Uint8Array(w * h).fill(bg), plain = new Uint8Array(w * h).fill(1);
  const thick = Math.max(1, Math.round(side / 320)), pitch = Math.max(5, Math.round(side / 40));
  for (const a of areas) {
    const X0 = Math.round(a.x0 * w), X1 = Math.round(a.x1 * w), Y0 = Math.max(0, Math.round(a.y0 * h)), Y1 = Math.min(h, Math.round(a.y1 * h));
    for (let y = Y0; y < Y1; y++) for (let x = Math.max(0, X0); x < Math.min(w, X1); x++) {
      const p = y * w + x;
      Y[p] = a.level;
      if (a.warm) plain[p] = 0;
      /* a line of dashes every `pitch`, inside a margin a tenth of the area's width */
      const m = (X1 - X0) * 0.1;
      if (a.print !== false && x > X0 + m && x < X1 - m && y > Y0 + m && y < Y1 - m && (y - Y0) % pitch < thick && Math.floor((x - X0) / (thick * 2)) % 2 === 0) Y[p] = Math.round(a.level * 0.25);
    }
  }
  return { Y, w, h, plain };
}
const start = (bg, areas) => findStart(scene(CROP_SMALL, bg, areas), scene(CROP_MID, bg, areas));
const paperOnly = (bg, areas) => findReceipt(scene(CROP_SMALL, bg, areas), scene(CROP_MID, bg, areas));
/* answers are in the small picture's pixels: as fractions of the photo's width and height */
const box = f => f && { x0: (f.cx - f.w / 2) / (CROP_SMALL * 0.75), x1: (f.cx + f.w / 2) / (CROP_SMALL * 0.75), y0: (f.cy - f.h / 2) / CROP_SMALL, y1: (f.cy + f.h / 2) / CROP_SMALL };
const about = (got, want, by, what) => { assert.ok(got, what + ": no answer"); for (const k of ["x0", "x1", "y0", "y1"]) near(got[k], want[k], by, what + " " + k); };

test("findStart: on a pale table there is no paper to find, and the box goes round the print", () => {
  const table = [{ x0: 0.3, y0: 0.25, x1: 0.7, y1: 0.8, level: 232 }];
  assert.equal(paperOnly(232, table), null, "the paper alone is not found: it is as bright as the table");
  about(box(start(232, table)), { x0: 0.3, y0: 0.25, x1: 0.7, y1: 0.8 }, 0.06, "the receipt, from its print and a margin");
});

test("findStart: paper with the photo all round it stands, whatever print lies beside it", () => {
  const counter = [{ x0: 0.3, y0: 0.4, x1: 0.7, y1: 0.9, level: 235 }, { x0: 0.05, y0: 0.05, x1: 0.6, y1: 0.4, level: 150 }];
  assert.deepEqual(start(40, counter), paperOnly(40, counter), "a pot's holes run into the receipt's print, and the paper is still the answer");
  const blank = [{ x0: 0.3, y0: 0.4, x1: 0.7, y1: 0.9, level: 235 }];
  assert.deepEqual(start(40, blank), paperOnly(40, blank));
});

test("findStart: a patch of light on a receipt is not the receipt", () => {
  /* a receipt that fills the photo, its top third in the light and the rest under a shadow as dark as the table beside it */
  const shadowed = [{ x0: 0.08, y0: -0.1, x1: 0.8, y1: 0.36, level: 235 }, { x0: 0.08, y0: 0.36, x1: 0.8, y1: 1.1, level: 120 }, { x0: 0.8, y0: -0.1, x1: 1.1, y1: 1.1, level: 120, print: false }];
  const lit = box(paperOnly(40, shadowed));
  assert.ok(lit && lit.y1 < 0.5, "the paper alone is the lit third");
  const b = box(start(40, shadowed));
  assert.ok(b.y1 > 0.85 && b.y0 < 0.15, "the print runs on under the shadow, and the box goes with it: " + JSON.stringify(b));
});

test("findStart: a pale table bright to the photo's edge is not the receipt lying on it", () => {
  /* the table is a shade darker than the paper and runs off two edges; darker wall round the rest */
  const onTable = [{ x0: -0.1, y0: 0.1, x1: 0.85, y1: 1.1, level: 215, print: false }, { x0: 0.3, y0: 0.2, x1: 0.62, y1: 0.9, level: 215 }];
  const table = box(paperOnly(60, onTable));
  assert.ok(table && table.x1 - table.x0 > 0.7, "the paper alone is the whole table");
  about(box(start(60, onTable)), { x0: 0.3, y0: 0.2, x1: 0.62, y1: 0.9 }, 0.07, "the receipt on it");
});

test("findStart: print only counts where the photo is not warm in colour", () => {
  const hand = [{ x0: 0.0, y0: 0.0, x1: 0.55, y1: 1.0, level: 200, warm: true }, { x0: 0.6, y0: 0.3, x1: 0.95, y1: 0.75, level: 232 }];
  about(box(start(232, hand)), { x0: 0.6, y0: 0.3, x1: 0.95, y1: 0.75 }, 0.06, "the creases of a hand are larger and nearer the middle, and are not the receipt");
});

test("findStart: nothing to go by is no answer, and a photo that is all print is none either", () => {
  assert.equal(start(40, []), null);
  assert.equal(start(232, [{ x0: 0.3, y0: 0.25, x1: 0.7, y1: 0.8, level: 232, print: false }]), null, "a pale table with a blank sheet on it");
  assert.equal(start(232, [{ x0: -0.2, y0: -0.2, x1: 1.2, y1: 1.2, level: 232 }]), null, "print from edge to edge says nothing about where the receipt is");
  assert.equal(findStart({ Y: new Uint8Array(16), w: 4, h: 4 }, { Y: new Uint8Array(16), w: 4, h: 4 }), null);
});

test("quadPoint and quadBand: a place in the flattened picture, gone back to in the photo", () => {
  const near = (a, b) => a.length === b.length && a.every((p, i) => Math.abs(p[0] - b[i][0]) < 1e-9 && Math.abs(p[1] - b[i][1]) < 1e-9);
  const sq = [[10, 20], [110, 20], [110, 220], [10, 220]];
  assert.ok(near([quadPoint(sq, 0, 0), quadPoint(sq, 1, 1), quadPoint(sq, 0.5, 0.25)], [[10, 20], [110, 220], [60, 70]]), "in an upright box a place is where it looks to be");
  const trap = [[40, 0], [60, 0], [100, 100], [0, 100]];
  assert.ok(near([quadPoint(trap, 0.5, 0.5)], [[50, 100 / 6]]), "the middle of a leaning box is where its diagonals cross, nearer its far end, as flatten has it");
  assert.ok(near(quadBand(sq, 0.25, 0.5), [[10, 70], [110, 70], [110, 120], [10, 120]]), "a strip of an upright box is that strip");
  assert.ok(near(quadBand(sq, 1.4, -0.2), sq), "…stopping at the box's own top and bottom, whichever way round it is asked for");
  const band = quadBand(trap, 0.4, 0.6);
  assert.ok(Math.abs(band[0][1] - band[1][1]) < 1e-9 && band[0][1] < band[3][1] && band[1][0] - band[0][0] < band[2][0] - band[3][0], "a strip of a leaning box leans with it: level, and wider toward the near end");
});

/** A piece of paper with dark bars down it, each edge spread over soft pixels (none: a clean cut). */
const bars = (paper, ink, soft) => {
  const side = 80,
    Y = new Uint8Array(side * side);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const p = x % 40,
        t = soft ? Math.max(0, Math.min(1, Math.min(p - 4, 10 - p) / soft + 0.5)) : p >= 4 && p < 10 ? 1 : 0;
      Y[y * side + x] = Math.round(paper - (paper - ink) * t);
    }
  return Y;
};
test("patchLook: whether a piece has print, how far the print stands from the paper, and how sharply", () => {
  const sharp = patchLook(bars(230, 40, 0), 80, 80),
    soft = patchLook(bars(230, 40, 8), 80, 80),
    pale = patchLook(bars(230, 200, 0), 80, 80),
    dim = patchLook(bars(70, 12, 0), 80, 80),
    blank = patchLook(new Uint8Array(6400).fill(230), 80, 80);
  assert.deepEqual([sharp.text, sharp.paper, sharp.crisp, +sharp.ink.toFixed(2)], [true, 230, 1, 0.83], "clean print on bright paper");
  assert.ok(soft.text && soft.crisp < 0.2, "blurred print: each step between neighbours is a small part of the way from paper to ink (" + soft.crisp.toFixed(2) + ")");
  assert.ok(pale.text && pale.crisp === 1 && pale.ink < 0.15, "faded print is as sharp as it was, only nearer the paper");
  assert.ok(dim.text && dim.crisp === 1 && dim.paper === 70 && dim.ink > 0.8, "print in shadow is still print, as sharp and as far from its paper: the paper is what is darker");
  assert.equal(blank.text, false, "and bare paper has none");
});

test("photoCheck: blur and shadow are said, fading is not, and too little print says nothing", () => {
  const many = (n, o) => Array.from({ length: n }, () => Object.assign({ text: true, paper: 220, ink: 0.7, crisp: 0.75 }, o));
  assert.equal(photoCheck(many(12)).why, "", "sharp and evenly lit");
  assert.equal(photoCheck(many(12, { crisp: 0.15 })).why, "blur");
  assert.equal(photoCheck(many(12, { crisp: 0.35 })).why, "", "a little soft, as five of the owner's read no worse for");
  assert.equal(photoCheck(many(9, { crisp: 0.15 }).concat(many(4))).why, "", "sharp in a quarter of its pieces, and the rest is a crease or a blank patch, not blur");
  assert.equal(photoCheck(many(8).concat(many(4, { paper: 80 }))).why, "shadow");
  assert.equal(photoCheck(many(8).concat(many(4, { paper: 150 }))).why, "", "…a shadow that takes a third of the light is not said: the owner's own shadowed receipt read");
  assert.equal(photoCheck(many(11).concat(many(1, { paper: 80 }))).why, "", "one dark piece in twelve is not a shadow across the receipt");
  assert.equal(photoCheck(many(12, { ink: 0.1 })).why, "", "faded print is left be: it read all the same");
  assert.equal(photoCheck(many(3, { crisp: 0.1 })).why, "", "three pieces of print are too few to judge by");
  assert.equal(photoCheck(many(12, { crisp: 0.1, text: false })).why, "", "and pieces with no print in them are not asked");
  assert.equal(photoCheck([]).n, 0);
});
