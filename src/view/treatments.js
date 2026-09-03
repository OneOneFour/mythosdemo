/* LAYER view — TREATMENTS: named pure drawing functions a `look` row may request.
   Imports `core` and `data` only. Reads no model and mutates nothing.

   THIS TABLE PLUS A NAME IN A CONTENT ROW IS HOW APPEARANCE BECAME DATA:

     data/substances.js says   look:{ treatments:[{ fn:'glint', col:'veinA', n:2 }] }
     view/paint.js says        for (const t of look.treatments) TREAT[t.fn](g, cell, t)

   and no substance name appears anywhere in `view/`. A `fn` name that is not a
   key here, and any colour name a `look` block gets wrong, fails
   `npm run check:content` (`tools/content.mjs` assertion 15) rather than drawing
   nothing at depth 300 — which is what actually used to happen, `treat()`'s
   `if (fn)` swallowing an unknown name in silence. The `tools/resolve.mjs` this
   header used to cite has never existed.
   See docs/DEVELOPER_GUIDE.md#colour-and-appearance

   CONTRACT. Every function takes `(g, cell, p)` where `cell` is
   `{ px, py, tx, ty, tile }` in destination pixels and band tiles, and `p` is
   the row's own parameter object.

   A MACHINE PART GETS FOUR MORE CELL FIELDS, and they are additions to the
   same contract rather than a second one: `w`/`h` (the footprint's own pixel
   size, so a part can centre itself in a 2x2 hub or a 3x1 axle without the
   row restating it), `turn` (`model/machines.js#m.turn`, accumulated rotation
   phase in radians -- a MODEL number, never a frame counter and never
   `rand()`) and `t` (the clock, for anything that has to breathe). A terrain
   treatment reads none of them and a machine part reads no `tile`; both go
   through the SAME `TREAT` table and the same `look` list, which is what
   makes `tools/content.mjs` assertion 15 validate a machine part's `fn` and
   its colour names for free.

   COLOUR PARAMS MUST USE THE NAMES `tools/content.mjs#COLOUR_KEYS` KNOWS
   (`body`, `trim`, `base`, `hi`, `lo`, `col`, `low`, `dark`, `face`,
   `contact`, ...). A colour under any other key is not a syntax error, it is
   an UNCHECKED colour -- it would throw from `colour()` the first time the
   part painted, at whatever depth that happened to be, which is the exact
   failure assertion 15 exists to move to import time.

   THEY MAY USE `hash2` AND MUST NOT USE `rand`. Rendering consumes no
   randomness (ARCHITECTURE invariant 7): a repaint must not be a mutation of
   anything, not even of an RNG cursor, or a screenshot would depend on how many
   times the frame had been drawn. Flicker comes from the clock plus a position
   hash, never from the stream. */

import { colour } from '../data/palette.js';
import { LIGHT, R, glow, lineTo, noiseFill } from '../core/pixels.js';
import { hash2 } from '../core/rng.js';

/* ---------- HOW FAR A DECORATION REACHES, IN TILES ----------
   A treatment that draws OUTSIDE its own cell is clipped by the chunk canvas it
   is drawing into, and the neighbouring chunk does not independently redraw the
   missing part -- those pixels are permanently lost, silently, with no error and
   nothing visual to notice it by. That is not a hypothesis; docs/AUDIT-2.md
   section 5 read it straight off two adjacent chunk canvases (seed 1, tile
   (7,17): the canopy's top row was out of bounds in its owning chunk and fully
   transparent in the chunk above).

   So every decoration declares its own MAXIMUM reach here, in tiles, in every
   direction, and `view/paint.js` scans a margin of neighbouring tiles that wide
   before it decides a chunk is finished. The number is authoritative rather than
   descriptive: the treatments below CLAMP their own data-supplied `w`/`h`
   against it, so a content row cannot ask for a canopy the margin does not
   cover. Grow one of these and the margin grows with it, in one place.

   `paint.js` takes the largest of them as its margin, so this table is the only
   thing that has to be right. */
export const EXTENT = Object.freeze({ canopy: 4, grassCap: 1 });

export const TREAT = {

  /* Speckles, so a vein is spottable from across a cavern. Positions come from
     the tile's own coordinates, so they sit still between frames. */
  glint(g, c, p) {
    const col = colour(p.col);
    for (let k = 0; k < (p.n || 2); k++)
      R(g, c.px + ((hash2(c.tx + k * 13, c.ty * 5) * c.tile) | 0),
           c.py + ((hash2(c.ty + k * 7, c.tx * 3) * c.tile) | 0),
           1, 1, col);
  },

  /* A soft halo: hot metal, ichor, anything self-lit. The one non-integer
     effect in the project, and it is additive light rather than geometry, so it
     cannot produce a half-pixel edge.

     A SLOW PULSE, NOT A FLASH, when the caller has a clock to give it (`c.t`
     -- item and machine-part contexts both do; a bare terrain cell does not,
     and `glow()` with its base alpha is exactly what a still relic in a
     screenshot-diffed baseline should be). Derived from `c.t` plus a hash of
     the cell's own position so two relics on screen at once do not breathe in
     lockstep -- never from a frame counter (CLAUDE.md invariant 7). */
  halo(g, c, p) {
    const base = p.a ?? 0.3;
    const pulse = c.t != null
      ? Math.sin(c.t * 1.1 + hash2(c.tx, c.ty) * 6.283) * (p.pulse ?? 0.08)
      : 0;
    glow(g, c.px + c.tile / 2, c.py + c.tile / 2, p.r || c.tile, colour(p.col), Math.max(0, base + pulse));
  },

  /* Horizontal courses, for brick and for bedded strata. */
  banded(g, c, p) {
    const col = colour(p.col), every = p.every || 3;
    for (let y = 0; y < c.tile; y++)
      if ((c.ty * c.tile + y) % every === 0) R(g, c.px, c.py + y, c.tile, 1, col);
  },

  /* AN OLIVE CROWN, and it is deliberately a THIRD shape.

     What was here was a flat `w` x `h` tile rectangle of two greens -- chosen,
     with a reason recorded in this very comment, over the preserved mockup's
     `oliveTree()`, whose 26 polar-scattered 2x2 dots (verbatim in
     `reference/mockup/src/world/strata.js`) read as fuzz rather than as a tree
     at this project's small viewport. That objection stands. So does the
     rectangle's own problem: it reads as a rectangle. Reverting to the dot
     cloud would trade one wrong answer for the other.

     The third shape is a UNION OF A FEW BLOBS, eroded at the rim. Solid
     interior, so it holds together at 8 px to the tile the way the dot cloud
     never did; a ragged outline, so it is not a rectangle. `CANOPY_BLOBS` is a
     FIXED layout -- five overlapping discs in a deliberately lopsided fan --
     rather than a per-pixel scatter, which is the whole difference: the
     silhouette is designed and only its edge is random. Olives are sparse,
     silver-green and irregular (SPEC section 5), so the fan leans, the two
     upper blobs are small, and the highlight tone gets a scatter of flecks
     where the light catches -- the silver in silver-green.

     THREE TONES, ONE SUN. Underside shade, body, sun-side highlight, chosen per
     pixel from its offset within its own blob projected onto
     `core/pixels.js#LIGHT`. No second light direction, and no baked-in "top
     course is lighter" -- which is what the rectangle did, and why it read as a
     lit box rather than as a lit sphere.

     Everything is positional (`hash2` over BAND pixel coordinates, never the
     chunk's own), so the same crown is identical from either side of a seam --
     without that, a tree straddling a chunk boundary would be two different
     trees meeting in the middle. `paint.js` is the only caller and only when
     `skyExposedAt` is true, a `model` query this file may not make itself. */
  canopy(g, c, p) {
    const t = c.tile;
    const tones = [colour(p.leaves?.[0] || 'vdC'),
                   colour(p.leaves?.[1] || 'vdB'),
                   colour(p.leaves?.[2] || p.leaves?.[1] || 'vdA')];
    /* Clamped against the declared reach, not trusted from the row: the chunk
       margin is sized off `EXTENT` and a crown wider than that would be
       silently clipped at every seam. */
    const spanH = Math.min(p.h ?? 4, EXTENT.canopy) * t;
    const spanW = Math.min(p.w ?? 5, EXTENT.canopy * 2) * t;

    const cx = c.px + t / 2;                    // centred on the trunk
    /* Sunk a WHOLE tile, so the crown swallows the trunk's top tile rather than
       perching on it. Perched, a 3-5 tile trunk with a crown on its last tile
       reads as a palm; overlapped, it reads as a tree. */
    const baseY = c.py + t * 1.5;

    const blobs = CANOPY_BLOBS.map(([lx, ly, lr], i) => ({
      x: cx + lx * spanW + jit(c.tx, c.ty, i * 2),
      y: baseY - ly * spanH + jit(c.tx, c.ty, i * 2 + 1),
      r: lr * spanW
    }));

    /* THE BOUNDING BOX IS CLIPPED TO THE CANVAS ON PURPOSE, and the lower bound
       matters as much as the upper: this is called for anchor tiles OUTSIDE the
       chunk being painted (that is what the margin is for), so `cx`/`baseY` are
       routinely negative or past the far edge. `R()` would clip those pixels
       anyway; skipping them here is what stops nine chunks each paying for the
       whole crown when only one of them can show it. */
    const clip = c.clip ?? Infinity;
    const x0 = Math.max(0, Math.round(cx - spanW / 2));
    const x1 = Math.min(clip, Math.round(cx + spanW / 2));
    const y0 = Math.max(0, Math.round(baseY - spanH));
    const y1 = Math.min(clip, Math.round(baseY));
    const ox = c.tx * t - c.px, oy = c.ty * t - c.py;

    for (let y = y0; y < y1; y++) {
      /* Runs, not pixels: a crown is ~900 cells and one `fillRect` each is a
         cost the chunk bake pays on every repaint for no visual difference. */
      let runX = 0, runCol = null;
      for (let x = x0; x <= x1; x++) {
        const col = x < x1 ? leafAt(x, y, blobs, tones, ox, oy) : null;
        if (col === runCol) continue;
        if (runCol) R(g, runX, y, x - runX, 1, runCol);
        runX = x; runCol = col;
      }
    }
  },

  /* A TURF CAP, and the emphasis is on cap rather than fringe. What this used
     to draw was two pixels of green on a tile's top edge, which reads as a line
     ruled along the ground rather than as ground; docs/ARCHAEOLOGY.md section 1a
     has the older look it is recovered from, and that look was a FULL band --
     `R(g, 0, SURFACE_Y - 6, W, 8, P.grassA)` then `R(g, 0, SURFACE_Y + 2, W, 4,
     P.grassB)`, i.e. a whole tile of bright green over a darker green lower
     edge, with a `noiseFill` speckle pass over both and 1 px tufts above. Same
     three parts here, per tile instead of screen-wide, so it steps with Phase
     7's relief instead of running flat.

     AND IT DRAPES OVER A LIP. A hillside is otherwise a stack of cut cubes: the
     turf stops dead at the top face and the vertical face below it is bare
     subsoil. So where this tile has an open side and solid rock beneath it, the
     turf runs a few pixels down that face, ragged, which is the one detail that
     makes a step read as a bank of earth rather than as a block. That drape is
     why `EXTENT.grassCap` is 1 tile and not 0.

     `paint.js` calls this only when `skyExposedAt` is true. Read the soil row's
     own comment in `data/substances.js` before widening anything here: a
     generic "any air above" test painted grass on cave ceilings. */
  grassCap(g, c, p) {
    const t = c.tile;
    const col = colour(p.col || 'grassA');
    const low = colour(p.low || p.col || 'grassA');
    const dark = colour(p.dark || p.low || 'grassC');
    const lowH = Math.max(1, p.lowH ?? ((t / 3) | 0));

    R(g, c.px, c.py, t, t, col);
    R(g, c.px, c.py + t - lowH, t, lowH, low);
    noiseFill(g, c.px, c.py, t, t, [dark, low], p.grain ?? 0.14, seedAt(c.tx, c.ty, 991));

    for (let x = 0; x < t; x++)
      if (hash2(c.tx * t + x, c.ty * 13 + 5) < 0.35)
        R(g, c.px + x, c.py - 1, 1, 1, col);

    if (!c.solidBelow) return;
    const drape = Math.min(p.drape ?? 4, EXTENT.grassCap * t);
    if (c.openL) lip(g, c.px, c.py + t, drape, c.tx, c.ty, low, dark, false);
    if (c.openR) lip(g, c.px + t, c.py + t, drape, c.tx, c.ty, low, dark, true);
  },

  /* A LADDER: TWO RAILS AND A RUNG PITCH THAT DOES NOT KNOW WHERE THE TILES
     ARE. The first treatment a FORM asks for rather than a substance
     (`data/forms.js`'s `rung` and `stair` rows; docs/PLAN-phase13.md section
     3.3), and the one property that makes it work is that the rung rows are
     chosen from the tile's ABSOLUTE band row -- `c.ty * c.tile + y` -- rather
     than from a counter starting at each tile's own top edge. A 3-row pitch
     computed per tile restarts at every tile boundary: six stacked tiles then
     show six identical 8 px patterns whose joins stutter, and a ladder placed
     one row lower than the one above it does not line up with it. Derived from
     the band row, a column of any length is ONE ladder and it is continuous
     across every seam, at any starting row.

     NO JITTER AND NO HASH, deliberately. Everything else painted into a chunk
     canvas is geology and is roughened positionally; a ladder is the one thing
     down there somebody MADE, and straight rails are what say so at 8 px.
     (`hash2` would have been allowed here; `rand()` never is -- invariant 7.)

     THREE COLOURS, ALL UNDER KEYS `tools/content.mjs#COLOUR_KEYS` VALIDATES:
     `body` the rails, `hi` the lit face of a rung, `lo` the row beneath it
     where a tread is deeper than one pixel. docs/PLAN-phase13.md section 3.3
     proposed `rail:`/`rung:` instead; those are not colour keys, so they would
     have been UNCHECKED colours -- the exact failure this file's header block
     says assertion 15 exists to move to import time.

     `every`/`tread`/`inset` are what make the two tiers read apart: timber
     pegs are 1 px rungs between inset rails, a bronze stair is a 2 px tread
     between rails on the tile's own edges. One function, two rows of data. */
  ladder(g, c, p) {
    const t = c.tile;
    const rail = colour(p.body);
    const lit = colour(p.hi ?? p.body);
    const under = colour(p.lo ?? p.body);

    /* Clamped so the two rails can never cross or leave the tile, whatever a
       row asks for -- a treatment that drew outside its cell would need an
       `EXTENT` entry, and this one deliberately has none. */
    const inset = Math.max(0, Math.min((t >> 1) - 1, p.inset ?? 1));
    const rw = Math.max(1, Math.min(t - inset * 2, p.railW ?? 1));
    const pitch = Math.max(1, p.every ?? 3);
    const deep = Math.max(1, Math.min(pitch, p.tread ?? 1));
    const phase = p.phase ?? 1;

    R(g, c.px + inset, c.py, rw, t, rail);
    R(g, c.px + t - inset - rw, c.py, rw, t, rail);

    const x = c.px + inset, w = t - inset * 2;
    for (let y = 0; y < t; y++) {
      const k = (((c.ty * t + y - phase) % pitch) + pitch) % pitch;
      if (k >= deep) continue;
      R(g, x, c.py + y, w, 1, k === 0 ? lit : under);
    }
  },

  /* ==================== MACHINERY ====================
     The parts a machine row's `look.parts` list may name. `EXTENT` does NOT
     apply to any of them: a machine is drawn live into the frame by
     `view/paint.js#paintMachine`, never baked into a chunk canvas, so there
     is no seam to be clipped at and nothing to declare a reach for. What
     bounds a part is its own footprint, and a part that draws outside it
     (the hub's cable lugs, an axle's end teeth) is drawing over the world,
     on purpose, exactly as the existing hopper lips already do.

     ROTATION IS `c.turn` AND NOTHING ELSE. Phase 8f writes it; until then it
     is 0 and every wheel below draws at phase 0, which is correct rather than
     a placeholder. */

  /* A TOOTHED WHEEL, which is the one shape this whole machine family is
     built out of: the hub's big drive gear, a 1x1 gear, an axle's two end
     gears, and the crank's own boss are all this function at four sizes.

     TEETH REACH PAST THE FOOTPRINT ON THE FOUR ORTHOGONAL AXES, and that is
     the entire art-teaches-the-rule requirement (docs/PLAN A3: diagonals do
     not conduct). `rt` defaults to half the tile past the wheel's own rim, so
     two gears in ORTHOGONALLY adjacent tiles have teeth that overlap in the
     gap between them and visibly interlock, while two in DIAGONALLY adjacent
     tiles are 1.41 tiles apart centre to centre and leave a plain gap with
     nothing bridging it. Nothing declares "these mesh"; the geometry does.

     TOOTH COUNT IS TIED TO THE ANGLE GRID, not to size: `teeth` multiples of
     4 keep one tooth on each axis at phase 0, which is what makes an
     unpowered train read as meshed rather than as coincidentally close. */
  gearWheel(g, c, p) {
    const bw = c.w ?? c.tile, bh = c.h ?? c.tile;
    const d = p.d ?? Math.min(bw, bh);
    const x = c.px + ((bw - d) >> 1) + (p.dx | 0);
    const y = c.py + ((bh - d) >> 1) + (p.dy | 0);
    const cx = x + d / 2, cy = y + d / 2;
    const n = p.teeth ?? 8;
    /* A TOOTH SITS ON THE RIM, NOT ON A SPIKE. `rt` defaults to the wheel's
       own radius, which puts the 2x2 tooth block astride the rim and so
       protrudes about a pixel -- exactly far enough that two wheels one tile
       apart abut. The first attempt used `d/2 + 2` and every gear read as an
       orange sunburst: at 8 px to the tile a two-pixel spike is a quarter of
       the whole wheel, and eight of them swamped the disc they were attached
       to. Nothing about the meshing argument needed the extra reach. */
    const rt = p.rt ?? (d / 2);
    const turn = c.turn || 0;

    /* Teeth first: the rim's dark outline overpaints their inner ends, so a
       tooth reads as something growing OUT of the wheel rather than a block
       sitting on it. ONE FLAT TONE PER TOOTH, and that tone is the wheel's
       BODY rather than its highlight -- teeth drawn in the highlight tone
       merged into the lit rim and the whole gear read as a blob. */
    const tcol = colour(p.col ?? p.body);
    for (let i = 0; i < n; i++) {
      const a = turn + i * (Math.PI * 2 / n);
      R(g, Math.round(cx + Math.cos(a) * rt - 1),
           Math.round(cy + Math.sin(a) * rt - 1), 2, 2, tcol);
    }

    discShaded(g, x, y, d, colour(p.body), colour(p.hi ?? p.body), colour(p.lo ?? p.body));

    /* SPOKES ARE WHAT MAKES ROTATION LEGIBLE. Teeth on a small wheel move
       barely a pixel per step; a spoke sweeps the whole radius, so a turning
       gear reads as turning even at 8 px.

       NOT BELOW 12 PX, and that floor was measured by looking rather than
       guessed: four spokes in an 11 px wheel leave a 9 px interior, and four
       dark radii across 9 px is most of the disc -- the hub read as a black
       blob with a bronze dot. A wheel that small says "turning" with its
       teeth alone. */
    if (d >= 12 && (p.spokes ?? 0) > 0) {
      /* IN THE OUTLINE TONE, so a spoke reads as a slot cut through the
         wheel. Drawn in the boss tone first, they read as a painted star. */
      const slot = colour(p.lo ?? p.body);
      for (let i = 0; i < p.spokes; i++) {
        const a = turn + i * (Math.PI * 2 / p.spokes);
        lineTo(g, Math.round(cx), Math.round(cy),
               Math.round(cx + Math.cos(a) * (d / 2 - 2)),
               Math.round(cy + Math.sin(a) * (d / 2 - 2)), slot);
      }
    }

    /* The boss, always: a wheel with no centre reads as a ring. One warm
       bronze dot at the middle of every iron wheel in the drivetrain, which
       is also what makes a train of them read as one family from across a
       cavern. */
    const hd = p.hd ?? Math.max(2, (d / 3.5) | 0);
    disc(g, Math.round(cx - hd / 2), Math.round(cy - hd / 2), hd,
         colour(p.dark ?? p.lo ?? p.body));
  },

  /* A WINDING DRUM, seen end-on down its own axis: a squat cylinder with two
     iron hoops and a lit top course. Sits beside the drive gear on a hub and
     is what makes the pair read as a winch rather than as clockwork. */
  drum(g, c, p) {
    const bw = c.w ?? c.tile;
    const w = p.w ?? Math.max(4, (bw / 2) | 0), h = p.h ?? 5;
    const x = c.px + (p.dx | 0), y = c.py + (p.dy | 0);
    const body = colour(p.body), hi = colour(p.hi ?? p.body), lo = colour(p.lo ?? p.body);

    R(g, x, y, w, h, body);
    R(g, x, y, w, 1, hi);
    R(g, x, y + h - 1, w, 1, lo);
    /* Hoops: two vertical bands in the trim colour, inset one pixel from each
       end, so the drum reads as banded staves. */
    const band = colour(p.trim ?? p.lo ?? p.body);
    R(g, x + 1, y, 1, h, band);
    R(g, x + w - 2, y, 1, h, band);
  },

  /* THE POST-AND-BEAM FRAME every one of these machines is bolted into --
     two uprights and a lintel, in the Greco-Roman timber-and-iron register
     the reference image is in. Drawn UNDER the wheels (list it first), so the
     wheels sit in the frame rather than beside it. */
  frame(g, c, p) {
    const bw = c.w ?? c.tile, bh = c.h ?? c.tile;
    const x = c.px, y = c.py;
    const post = p.post ?? 2;
    const body = colour(p.body), hi = colour(p.hi ?? p.body), lo = colour(p.lo ?? p.body);

    R(g, x, y, post, bh, body);                        // left upright
    R(g, x + bw - post, y, post, bh, body);            // right upright
    R(g, x, y, bw, p.beam ?? 2, body);                 // lintel
    R(g, x, y, bw, 1, hi);                             // the sun is up
    R(g, x, y, 1, bh, hi);                             // and to the left
    R(g, x + bw - 1, y, 1, bh, lo);
    if (p.sill) R(g, x, y + bh - 1, bw, 1, lo);
  },

  /* THE CRANK HANDLE: a boss, an arm, and a knob, swept by `c.turn`. The arm
     is drawn to the FULL radius with `lineTo` and the knob capped on its end,
     so "which way is it pointing" is legible at 8 px wide -- the one thing a
     hand crank has to communicate.

     The arm's own length does not change with phase, which is deliberately
     NOT foreshortened: a handle that shortened as it swung would read as
     broken at this resolution, and the game does not need the third
     dimension. */
  crankArm(g, c, p) {
    const bw = c.w ?? c.tile, bh = c.h ?? c.tile;
    const cx = Math.round(c.px + (p.cx ?? (bw / 2)) + (p.dx | 0));
    const cy = Math.round(c.py + (p.cy ?? (bh / 3)) + (p.dy | 0));
    const r = p.r ?? Math.max(3, (bw / 2) + 1);
    /* `a0` IS THE RESTING ANGLE, and it exists because a handle pointing dead
       right at phase 0 reads as a lever or a little flag rather than as a
       crank. Offset a third of a turn and the same handle reads as caught
       mid-swing. Appearance only, and still a pure function of `c.turn`. */
    const a = (c.turn || 0) + (p.a0 ?? 0);
    const ex = Math.round(cx + Math.cos(a) * r), ey = Math.round(cy + Math.sin(a) * r);

    /* THE BEARING, THE ARM AND THE GRIP, and all three are needed. A 1 px arm
       with a 2x2 knob was the first attempt and it read as a stray scratch
       over the post: at this scale a hand crank is three pixels of arm and a
       fat wooden grip, or it is nothing. `thick:2` on the arm is the whole
       difference between a scratch and a handle. */
    R(g, cx - 2, cy - 2, 4, 4, colour(p.dark ?? p.body));             // bearing block
    R(g, cx - 1, cy - 1, 2, 2, colour(p.body));
    lineTo(g, cx, cy, ex, ey, colour(p.body), 2);
    R(g, ex - 1, ey - 2, 3, 4, colour(p.col ?? p.hi ?? p.body));      // the grip
    R(g, ex - 1, ey - 2, 3, 1, colour(p.hi ?? p.col ?? p.body));
  },

  /* A SQUARED TIMBER SHAFT WITH IRON COLLARS, running along the FOOTPRINT'S
     OWN LONG AXIS -- a 3x1 axle gets a beam, a 1x2 crank gets a post, from
     one function and no orientation flag in the data. The footprint already
     knows which way the machine is turned, and a row that had to say so as
     well is a second place for the two to disagree.

     `thick` is the shaft's own cross-section and `inset` how far short of the
     footprint's ends it stops. Any wheels are separate `gearWheel` entries in
     the same `parts` list, positioned by `dx`/`dy`, which is what lets the
     3x1 axle, the 1x2 crank and the 1x1 gear share one wheel function. */
  shaft(g, c, p) {
    const bw = c.w ?? c.tile, bh = c.h ?? c.tile;
    const vert = p.vert ?? (bh > bw);
    const along = vert ? bh : bw, across = vert ? bw : bh;
    const thick = p.thick ?? Math.max(2, (across / 2) | 0);
    const run = Math.max(1, (p.len ?? along) - (p.inset ?? 0) * 2);

    /* `a` is the coordinate along the shaft, `b` across it. One pair of
        expressions, applied twice, rather than two copies of the geometry. */
    const a0 = (vert ? c.py : c.px) + (p.inset ?? 0) + (vert ? (p.dy | 0) : (p.dx | 0));
    const b0 = (vert ? c.px : c.py) + ((across - thick) >> 1)
             + (vert ? (p.dx | 0) : (p.dy | 0));
    const box = (bo, bs, ao, as, col) =>
      vert ? R(g, bo, ao, bs, as, col) : R(g, ao, bo, as, bs, col);

    box(b0, thick, a0, run, colour(p.body));
    box(b0, 1, a0, run, colour(p.hi ?? p.body));                  // sun-side edge
    box(b0 + thick - 1, 1, a0, run, colour(p.lo ?? p.body));

    const collar = colour(p.trim ?? p.lo ?? p.body);
    const nc = p.collars ?? 2;
    for (let k = 0; k < nc; k++)
      box(b0 - 1, thick + 2, a0 + (((run - 1) * (nc > 1 ? k / (nc - 1) : 0.5)) | 0), 1, collar);
  }
};

/* ---------- the olive crown's own shape ----------
   `[x, y, r]` per blob, as fractions of the crown's own span: x from the trunk's
   centre, y UP from its base, r of the width. Lopsided on purpose -- a
   symmetrical fan reads as a bush, and an olive is neither symmetrical nor
   round. Five is the count the phase brief asks for the top of (3-5) and the
   fewest that still hides its own seams: three blobs leave visible lobes, seven
   average out into a circle. */
const CANOPY_BLOBS = [
  [ 0.00, 0.40, 0.29],
  [-0.27, 0.29, 0.22],
  [ 0.26, 0.34, 0.205],
  [-0.13, 0.68, 0.165],
  [ 0.18, 0.62, 0.15]
];

/* Rim erosion. Inside `RIM` of the blob's own solidity a pixel is unconditional;
   outside it, it survives on its own hash -- so the interior is solid and only
   the outline is ragged, which is the entire difference between this and a dot
   cloud. */
const RIM = 0.34, RIM_KEEP = 0.56;
const FLECK = 0.16;                     // silver-green: highlight flecks in the light
const RIM_LIT = 0.58;                   // only the outer part of a lobe is lit or shaded
const LIT_HI = 0.34, LIT_LO = -0.28;

/* +-1 px, positional, so no two crowns in a band are the same crown. */
const jit = (tx, ty, k) => ((hash2(tx * 37 + k, ty * 61 + k * 7) * 3) | 0) - 1;

/* The leaf tone at one pixel, or null for sky. `ox`/`oy` convert a destination
   pixel into BAND pixel coordinates, which is what keeps the crown identical
   across a chunk seam. */
function leafAt(x, y, blobs, tones, ox, oy) {
  let best = -1, bx = 0, by = 0, br = 1;
  for (const b of blobs) {
    const dx = x - b.x, dy = y - b.y;
    const m = 1 - (dx * dx + dy * dy) / (b.r * b.r);
    if (m > best) { best = m; bx = dx; by = dy; br = b.r; }
  }
  if (best <= 0) return null;

  const wx = x + ox, wy = y + oy;
  if (best < RIM && hash2(wx * 2 + 11, wy * 3 + 7) > RIM_KEEP) return null;

  /* Which way this pixel faces, against the one declared light direction --
     but only the OUTER part of a lobe takes a light or a shadow tone. Shading
     the whole radius instead put a linear gradient across every blob, and five
     overlapping gradients read as diagonal hatching rather than as foliage;
     confining it to the rim leaves the interior as leaf mass and lights the
     lobes that face the sun, which is what a crown of clustered foliage does. */
  const lit = -(bx * LIGHT.x + by * LIGHT.y) / (br * 1.42);
  if (best < RIM_LIT) {
    if (lit > LIT_HI) return tones[2];
    if (lit < LIT_LO) return tones[0];
  }
  if (lit > 0 && hash2(wx * 5 + 3, wy * 7 + 13) < FLECK) return tones[2];
  return tones[1];
}

/* Turf spilling over the edge of a cliff, down the face of the tile below.
   Ragged by construction: each row down is one or two pixels wide and the run
   stops early on its own hash, so no two lips are the same length and none is a
   ruled vertical line. `x` is the FACE's own edge — the left face's own column
   for a left lip, one past the right face's for a right one. */
function lip(g, x, y, depth, tx, ty, near, far, right) {
  for (let k = 0; k < depth; k++) {
    if (k > 0 && hash2(tx * 7 + k, ty * 3 + (right ? 11 : 5)) < 0.28) break;
    const w = 1 + ((hash2(tx * 17 + k, ty * 29 + (right ? 5 : 1)) * 2) | 0);
    R(g, right ? x - w : x, y + k, w, 1, k < depth - 2 ? near : far);
  }
}

/* ---------- discs ----------
   A CIRCLE, ONE INTEGER ROW AT A TIME. No `arc`, no fill path, for the same
   reason `view/scene.js#dome` refuses one: a canvas curve antialiases its own
   edge, and SPEC section 6 forbids that outright. `d` is the DIAMETER and the
   disc exactly fills the `d x d` box at `(x, y)`, so a caller that has already
   floored `x`/`y` cannot produce a half-pixel edge no matter what `d` is.

   The row width comes from the circle equation sampled at each row's CENTRE
   ((j + 0.5) normalised to -1..1), which is what stops an even diameter from
   drawing a flat-topped disc one row taller than it is wide. */
export function disc(g, x, y, d, col) {
  for (let j = 0; j < d; j++) {
    const k = ((j + 0.5) / d) * 2 - 1;
    const w = Math.max(1, Math.round(d * Math.sqrt(Math.max(0, 1 - k * k))));
    R(g, x + ((d - w) >> 1), y + j, w, 1, col);
  }
}

/* THE SAME DISC AS A MACHINED WHEEL: a 1 px DARK OUTLINE all the way round, a
   mid-tone interior, and a lit crescent on the sun side of the rim. Three
   tones, and the outline is the one that matters.

   THE OUTLINE IS THE WHOLE FIX, and it was arrived at by looking. The first
   version shaded the disc symmetrically -- a lit arc up-left, a shaded arc
   down-right, mid tone between -- and at 11 px in an unlit shaft the result
   was a grey amoeba: the lit arc ran into the teeth (drawn in the same
   highlight tone), the shaded arc ran into the background, and nothing said
   where the wheel ENDED. A dark ring says it in one pixel, and it is also
   what makes a tooth read as a tooth: a body-toned block sitting outside the
   ring rather than a lump of the same crescent.

   `RIM_R2` is in squared normalised radius, so the highlight test costs no
   square root. Runs are coalesced per row exactly as the canopy's are. */
const RIM_R2 = 0.30;
const DISC_LIT = 0.35;

export function discShaded(g, x, y, d, body, hi, lo) {
  disc(g, x, y, d, lo);                       // the outline, as a full disc
  const di = d - 2;
  if (di < 1) return;

  const r = di / 2;
  for (let j = 0; j < di; j++) {
    const ny = ((j + 0.5) - r) / r;
    let runX = 0, runCol = null;
    for (let i = 0; i <= di; i++) {
      const nx = ((i + 0.5) - r) / r;
      const r2 = nx * nx + ny * ny;
      let col = null;
      if (i < di && r2 <= 1) {
        col = body;
        if (r2 > RIM_R2 && -(nx * LIGHT.x + ny * LIGHT.y) / 1.42 > DISC_LIT) col = hi;
      }
      if (col === runCol) continue;
      if (runCol) R(g, x + 1 + runX, y + 1 + j, i - runX, 1, runCol);
      runX = i; runCol = col;
    }
  }
}

/* A stable local seed for a `noiseFill` pass over one tile. Positional, so the
   same tile speckles identically on every repaint and from either side of a
   chunk seam — the same reason every other function here uses `hash2`. */
export const seedAt = (tx, ty, salt) =>
  (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663) ^ salt) | 0;

/* Apply a row's treatment list. One call site in `view/paint.js`, but exported
   so the item and machine passes share the exact same semantics. */
export function treat(g, look, cell) {
  for (const t of look?.treatments || []) {
    const fn = TREAT[t.fn];
    if (fn) fn(g, cell, t);
  }
}
