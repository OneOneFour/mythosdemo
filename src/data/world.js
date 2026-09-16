/* LAYER data — BANDS: one row per depth band, top to bottom. Frozen.
   Imports `data` only. May be imported by `data`, `model`, `rules`, `view`.

   THE DEFECT THIS FILE EXISTS TO FIX. In the previous codebase `WORLD_TW` and
   `WORLD_TH` were module constants and the typed arrays were allocated at
   import, so world size was fixed before `newRun()` got a say. That was the
   single biggest structural blocker in the old code, and it is why more than
   one depth band was impossible.

   Here a band is a ROW --
   Every tile query takes the band record as its first argument, and band
   ordinals are never assumed to be zero.

   Three bands exist from the start because the game's thesis needs a
   destination. Down is free, up is expensive -- and without somewhere above the
   surface to deliver to, that asymmetry is an assertion rather than a mechanic.

       ASTRAL    minor gods. Reachable, which is what makes them minor.
       SURFACE   spawn.
       TOPSOIL   the first digging band.

     origin    world-space offset in PIXELS, not tiles. Deliberate deviation
               from the reference prototype, which used tiles: a tile offset is
               meaningless between two bands with different `tile` sizes, and
               `tile` is per-band precisely so a band may differ.
     fields    the named scalar fields this band allocates. A band with no
               `heat` row simply has no heat, and a machine emitting into a
               field the band does not have is a BUILD error, not a silent
               no-op -- `tools/content.mjs` checks it.
     strata    worldgen instructions, by `kind`. Adding a kind costs engine
               code once; adding a layer or a vein costs one row here.
     look      band-scale appearance. `view/` is the only reader. */

export const BANDS = [

  /* ASTRAL
     FULL WIDTH -- it was once 96 columns inset by 128 px. The
     inset was meant to read as a platform in the sky rather than a mirror of
     the ground; what it actually produced was two 16-column DEAD STRIPS --
     surface columns 0-15 and 111-127 -- in which nothing above world y 320
     resolves to a band at all (`model/world.js#bandAt` is a range test), so no
     hub could be placed above the surface there and no span could rise past
     y 320 without `'OUTSIDE THE WORLD'`. That is 25% of the world's width in
     which the game's own destination is unreachable, for a silhouette nothing
     draws: astral's floor is a solid slab spanning the whole band either way.
     Measured before the change: `bandAt(x, 100)`
     was `null` for surface columns 0-15 and 111-127, `astral` for 16-110.

     No heat: nothing burns up here, which is a content statement made by
     omitting one array entry. */
  { id:'astral', name:'THE MINOR HEAVENS',
    tw:1024, th:40, tile:8, chunk:16,
    origin:{ x:0, y:0 },
    floorTy:30,
    fields:[],
    strata:[
      { kind:'layer', sub:'stone', fromTy:30, toTy:40 }
    ],
    look:{ sky:'skyHi', tint:'marbleA', ambient:1.0 } },

  /* SURFACE
     Spawn. `floorTy` is the ground line inside this band; `spawnTx` is the
     column the player starts in. Both are band-local -- nothing in the project
     converts them to a world constant. */
  { id:'surface', name:'THE SUN\'S FLOOR',
    tw:1024, th:56, tile:8, chunk:16,
    origin:{ x:0, y:320 },
    floorTy:20, spawnTx:42, spawn:true,
    fields:['heat'],
    strata:[
      /* THE HEIGHT MAP, and it must be the first row: every boundary below
         offsets by it. `amp` is rows of hilltop ABOVE `floorTy` and `dip`
         rows of valley floor BELOW it, so the envelope is rows 10..22 and the
         pair is the whole of `rules/generate.js#heightmap`'s budget.

         10 rows is 80 px of relief in a 160 px sky, and it was 6 while relief
         was three summed octaves. A landform needs the room: at 6 the clamp
         flattened every summit into a mesa. The spawn shelf stays pinned flat
         at 0 and blended out either side.

         2 ROWS OF DIP, AND WHAT CAPS IT IS THE TUTORIAL'S OWN SHAFT.
         `dip` recentres the trend octave, so it lowers the whole profile
         rather than only cutting the valleys. At 2, 111 seeds in 200 carry a
         column below the datum where 0 carried any, the flat fraction is
         unchanged at a 69% median, and the deepest ground row over 200 seeds
         is exactly `floorTy + dip`.

         The price is paid at spawn, and it is why this is 2 and not 4.
         `view/paint.js#excavated` cannot tell a valley from a shaft, so air
         inside the relief envelope reads as SKY -- and the spawn shelf is
         pinned at exactly `floorTy`, which makes the daylight collar on the
         tutorial's own hole exactly `dip` rows deep. docs/SPEC.md section 5
         beat 3 promises that hole is a 5-tile dig, so at 4 the first hole a
         player digs is mostly sky and at 2 it reads as light spilling into
         the mouth of a dark hole. Photographed both ways.

         Both passes that paint the air over a valley floor read
         `view/paint.js#skyBottomTy`, which is this number plus `floorTy`;
         `tools/worldgen-check.mjs` property 10 asserts the two agree and
         refuses a `dip` of 0 for making itself vacuous. The datum does not
         move (CLAUDE.md D9), so a valley floor reads 2 M down on the gauge. */
      { kind:'relief', amp:10, dip:2 },
      /* A shallow soil cap over the stone, so the exposed ground reads as
         dirt-with-grass (`soil`'s `hi` look) rather than bare rock. `lip:false`
         on the stone row is load-bearing: without it, `layer()`'s ragged-edge
         carve treats row 27 as ANOTHER exposed surface and punches random air
         pockets along the soil/stone seam, seven tiles underground where
         nothing should ever look carved. */
      { kind:'layer', sub:'soil',   fromTy:20, toTy:27 },
      { kind:'layer', sub:'stone',  fromTy:27, toTy:56, lip:false },
      /* THE CONTACT ZONE. The soil/stone seam is gradational, so it is the
         thick one: 4 tiles of interdigitated fingers. `at` is the same row the
         stone layer declares as its `fromTy`, and the two cannot drift because
         both resolve it through the identical height-map shift. A sharp
         contact (a granite/adamant seam, when one exists as two LAYERS rather
         than as ore fields) is the same row with `thick:1`. */
      { kind:'contact', upper:'soil', lower:'stone', at:27, thick:4 },
      /* Hollows, declared between the layers and the ore so the ore pass can
         line their walls. Shallow and few in this band -- there are only 29
         rows of rock under the soil here, and `SAFE_R` around spawn already
         forbids most of them; the deep rooms are `topsoil`'s job. `dens` is
         attempts per 10,000 tiles of the window, as on the ore rows. */
      { kind:'hollows', fromTy:38, toTy:56, dens:55.0, r:[1.4, 2.6], steps:[2, 3], bias:1 },
      /* `toTy` must reach past the ground line or a trunk's base scan never
         finds solid ground -- it did not, for any seed, until this was 22:
         rows 16-19 were air, so `trees()`'s scan for the first solid tile
         always fell through and every column was skipped. The window has to
         span every height the relief row can produce, which is `floorTy - amp`
         at a hilltop and `floorTy + dip` in a valley, with a margin either
         side so raising `amp` by one cannot silently empty a hilltop of
         trees.

         TREES COME IN STANDS, AND THE GAPS ARE THE POINT. `chance` is the
         per-column chance INSIDE a grove, and `grove` places one grove centre
         per 96 columns covering 5 columns either side, so the band carries 11
         stands of about 6 trees and 85 clear columns between them. The tree
         count is unchanged at 66 per band -- `chance` was always per column,
         so trees were the one thing phase 6e did not dilute -- and what
         changed is where they sit. A trunk is 3-5 tiles of solid timber and
         `rules/player.js#moveX`'s auto-step clears one, so a trunk is a wall
         and an even scatter at `chance:0.06` put one every 17 columns: a
         player walking right covered a mean 151 px before stopping, measured
         over 12 seeds. Grouped, the same trees leave a mean 612 px. A grove
         landing on the spawn shelf is pushed clear of it
         (`rules/generate.js#groves`), which keeps timber within 43 columns of
         spawn on every seed for docs/SPEC.md section 5 beat 4's ladder. */
      { kind:'trees', sub:'timber', fromTy:8, toTy:28, chance:0.55, grove:{ spacing:96, spread:5 }, height:[3, 5] },
      /* `dens` IS ATTEMPTS PER 10,000 TILES of this row's own window, so it is
         content per screen and a band's width cannot dilute it. It replaced an
         absolute `count` of 5, which is why phase 6e's widening from 128 to
         1,024 columns left this band at an eighth of its ore density with
         every checker green. 16.0 is solved against the measurement, not
         derived: over 200 seeds it lands 0.895% of the band's tiles as copper
         against the 0.856% the tuned 128-column world carried (+4.6%). It is
         not the old count times eight, because clusters overlap less in a
         wider band and the hollow-lining pass does not scale with this number
         at all. docs/SPEC.md sections 16.5 and 19.7 hold the table.
         The bill this has to cover is unchanged: section 5's first trial asks
         for 10 raw copper and section 13's furnace bill for 12 more
         (section 13, not 15 -- the bill is in the buildable-machine-cost
         table; docs/PLAN-phase14-mining-and-drops.md D14-F cites 15). */
      { kind:'blobs', sub:'copper', fromTy:26, toTy:56, dens:16.0, r:[1.6, 3.4], line:true },
      /* The guaranteed first vein, so the first two minutes cannot fail to
         find copper. `near:'spawn'` is resolved by worldgen, not here.
         `r:2.4, n:1` is ONE star of exactly 6 cells -- `star()` gives
         `clamp(round(2.4*2),4,8)` = 5 arms, and 2.4 is not ABOVE `ORE_LONG`
         (2.4) so no arm is 2 long and no shoulder grows -- which puts its top
         at row 25, the 5-tile dig docs/SPEC.md section 5's beat 3 promises,
         with no arm roll left to be unlucky about. At charge 4 that is 24
         copper units, asserted as a floor over 200 seeds by
         `tools/worldgen-check.mjs`'s VEIN UNITS property.
         It was `r:3.6, n:3` -- three overlapping stars, 23.9 cells over 200
         seeds -- which at charge 4 is 95.5 units against a cycle-1 demand of
         10, i.e. the first trial paid for nine times over by the tutorial
         hole before the player has met a machine. */
      { kind:'vein',  sub:'copper', near:'spawn', dy:6, r:2.4, n:1 }
    ],
    look:{ sky:'skyLo', tint:'soilA', ambient:0.95 } },

  /* TOPSOIL
     The first digging band, and the deep one. Same tile size and width as the
     surface so a shaft continues cleanly across the seam; that is a content
     choice, not a constraint. */
  { id:'topsoil', name:'THE TOPSOIL',
    tw:1024, th:320, tile:8, chunk:16,
    origin:{ x:0, y:768 },
    floorTy:0,
    fields:['heat'],
    strata:[
      /* No `relief` row: this band's own row 0 is buried under the surface
         band's rock, so there is no ground line here to make undulate. */
      { kind:'layer', sub:'stone',  fromTy:0,  toTy:320 },
      /* THE HIDDEN HOLLOWS, and the reason this band is worth digging into
         sideways rather than only downward. `bias` < 1 skews the centre draw
         toward `toTy`, so density rises with depth -- 0.85 makes the deepest
         rows about 1.7x as dense as row 20 while still putting rooms within
         reach of a shaft that has only just crossed the band seam. A harsher
         bias (0.55 was tried) empties the first 30 rows entirely, which is
         the depth a player first digs sideways at.

         `fromTy:4` is the seam margin, not the "top 8 rows below topsoil"
         exclusion -- that rule is about the SOIL (this band has none; its
         ceiling is the surface band's rock) and it is the surface band's own
         hollow row, at `fromTy:38`, 11 rows under the soil, that honours it.
         The 2-row ceiling rule in `rules/generate.js` is what actually keeps a
         hollow off this band's own top rows. */
      { kind:'hollows', fromTy:4, toTy:320, dens:44.5, r:[1.6, 3.8], steps:[2, 4], bias:0.85 },
      /* `dens` is attempts per 10,000 tiles of each row's own window -- see the
         surface band's copper row for why the field is a density and not a
         count. All four were solved against the measurement rather than
         divided out of the old counts, because the hollow-lining pass does
         not scale with this number: over 200 seeds the band carries copper
         0.762%, tin 0.624%, granite 0.429% and adamant 0.271% of its tiles
         against the 0.755/0.622/0.434/0.264% the tuned 128-column world
         carried. docs/SPEC.md section 16.5 holds the table.
         `line:true` opts a row into hollow-wall lining, and the DEEPEST such
         row whose window holds a hollow claims it -- so the jackpot behind a
         fall in the dark is graded by depth: copper shallow, then tin, then
         granite, then adamant. Note that lining is opted in by the FLAG and
         not by `dens`, so a row still lines its hollows at any density. */
      { kind:'blobs', sub:'copper', fromTy:4,  toTy:180, dens:15.1, r:[1.6, 3.8], line:true },
      { kind:'blobs', sub:'tin',    fromTy:60, toTy:320, dens:7.81, r:[1.6, 3.8], line:true },
      /* Deeper strata for the pick-tier gate: granite uncommon below
         the copper/tin bands, adamant rarer still and deeper again, so the
         tier gate has somewhere meaningful to bite once a bronze pickaxe
         cannot break either. */
      { kind:'blobs', sub:'granite', fromTy:120, toTy:320, dens:7.42, r:[1.4, 3.0], line:true },
      { kind:'blobs', sub:'adamant', fromTy:220, toTy:320, dens:11.72, r:[1.2, 2.4], line:true }
    ],
    look:{ sky:'abyB', tint:'irD', ambient:0.6 } }
];

export const BAND = Object.freeze(Object.fromEntries(
  BANDS.map(b => [b.id, Object.freeze(b)])));

/* Declaration order is top-to-bottom, and it is the order `model/world.js`
   allocates in, so `ord` is depth rank. Nothing assumes ord 0 means anything
   other than "first row in this file". */
export const BAND_IDS = Object.freeze(BANDS.map(b => b.id));

/* The band the player starts in. One row carries `spawn:true`; if none or more
   than one does, that is a content error the resolver catches. */
export const SPAWN_BAND = BANDS.find(b => b.spawn)?.id ?? BAND_IDS[0];

/* Every field name any band declares, for the resolver and for `model/fields.js`. */
export const FIELDS = Object.freeze([...new Set(BANDS.flatMap(b => b.fields))]);

/* Every strata `kind` in use, so a generator can assert it handles all of them
   rather than skipping an unknown row in silence. */
export const STRATA_KINDS = Object.freeze(
  [...new Set(BANDS.flatMap(b => b.strata.map(s => s.kind)))]);
