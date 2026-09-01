/* LAYER data — BANDS: one row per depth band, top to bottom. Frozen.
   Imports `data` only. May be imported by `data`, `model`, `rules`, `view`.

   ============================================================================
   THE DEFECT THIS FILE EXISTS TO FIX. In the previous codebase `WORLD_TW` and
   `WORLD_TH` were module constants and the typed arrays were allocated at
   import, so world size was fixed before `newRun()` got a say. That was the
   single biggest structural blocker in the old code, and it is why more than
   one depth band was impossible.

   Here a band is a ROW -- see docs/DEVELOPER_GUIDE.md#bands-and-worldgen.
   Every tile query takes the band record as its first argument, and band
   ordinals are never assumed to be zero.
   ============================================================================

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
               no-op -- `tools/resolve.mjs` checks it.
     strata    worldgen instructions, by `kind`. Adding a kind costs engine
               code once; adding a layer or a vein costs one row here.
     look      band-scale appearance. `view/` is the only reader. */

export const BANDS = [

  /* ---- ASTRAL --------------------------------------------------------------
     Narrower than the surface and inset, so it reads as a platform in the sky
     rather than a mirror of the ground. No heat: nothing burns up here, which
     is a content statement made by omitting one array entry. ---- */
  { id:'astral', name:'THE MINOR HEAVENS',
    tw:96, th:40, tile:8, chunk:16,
    origin:{ x:128, y:0 },
    floorTy:30,
    fields:[],
    strata:[
      { kind:'layer', sub:'stone', fromTy:30, toTy:40 }
    ],
    look:{ sky:'skyHi', tint:'marbleA', ambient:1.0 } },

  /* ---- SURFACE -------------------------------------------------------------
     Spawn. `floorTy` is the ground line inside this band; `spawnTx` is the
     column the player starts in. Both are band-local -- nothing in the project
     converts them to a world constant. ---- */
  { id:'surface', name:'THE SUN\'S FLOOR',
    tw:128, th:56, tile:8, chunk:16,
    origin:{ x:0, y:320 },
    floorTy:20, spawnTx:42, spawn:true,
    fields:['heat'],
    strata:[
      /* THE HEIGHT MAP, and it must be the first row: every boundary below
         offsets by it. Relief runs UPWARD from `floorTy` only, never below --
         `rules/generate.js`'s own comment states why (an AIR tile at or below
         `floorTy` is excavated rock as far as `view/paint.js` is concerned, so
         a valley floor would fill its own sky with cave shading). The spawn
         shelf is pinned flat at 0 and blended out either side. */
      { kind:'relief', amp:6 },
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
         forbids most of them; the deep rooms are `topsoil`'s job. */
      { kind:'hollows', fromTy:38, toTy:56, count:16, r:[1.4, 2.6], steps:[2, 3], bias:1 },
      /* `toTy` must reach past the ground line or a trunk's base scan never
         finds solid ground -- it did not, for any seed, until this was 22:
         rows 16-19 were air, so `trees()`'s scan for the first solid tile
         always fell through and every column was skipped. The window now has
         to span every height the relief row can produce (`floorTy - amp` at a
         hilltop, `floorTy` in a valley) PLUS the row a ragged lip may have
         carved, hence 10..28 rather than 16..22. `chance` raised alongside the
         original fix, once trees could exist at all, so 12ish logs is not a
         fistfight between the first ladder and the first smelt (`log` is the
         only fuel). */
      { kind:'trees', sub:'timber', fromTy:10, toTy:28, chance:0.06, height:[3, 5] },
      /* `count` is up from 14 and `r` slightly wider because a cruciform
         cluster is roughly half the cells a same-radius disc was: the total
         copper in the band is held near where it was, deliberately, since
         docs/SPEC.md section 5's first trial asks for 10 raw copper and
         section 15's furnace bill for 12 more. */
      { kind:'blobs', sub:'copper', fromTy:26, toTy:56, count:26, r:[1.6, 3.4], line:true },
      /* The guaranteed first vein, so the first two minutes cannot fail to
         find copper. `near:'spawn'` is resolved by worldgen, not here. `dy:6`
         with `n:3` overlapping stars puts the vein's top at row 25 even on the
         unluckiest arm roll -- a 5-tile dig, which is the beat docs/SPEC.md
         section 5 promises -- and makes it a body rather than a plus sign. */
      { kind:'vein',  sub:'copper', near:'spawn', dy:6, r:3.6, n:3 }
    ],
    look:{ sky:'skyLo', tint:'soilA', ambient:0.95 } },

  /* ---- TOPSOIL -------------------------------------------------------------
     The first digging band, and the deep one. Same tile size and width as the
     surface so a shaft continues cleanly across the seam; that is a content
     choice, not a constraint. ---- */
  { id:'topsoil', name:'THE TOPSOIL',
    tw:128, th:320, tile:8, chunk:16,
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
      { kind:'hollows', fromTy:4, toTy:320, count:180, r:[1.6, 3.8], steps:[2, 4], bias:0.85 },
      /* `count` up across the board because a cruciform cluster is about half
         the cells the same-radius disc was; see the surface band's copper row.
         `line:true` opts a row into hollow-wall lining, and the DEEPEST such
         row whose window holds a hollow claims it -- so the jackpot behind a
         fall in the dark is graded by depth: copper shallow, then tin, then
         granite, then adamant. */
      { kind:'blobs', sub:'copper', fromTy:4,  toTy:180, count:160, r:[1.6, 3.8], line:true },
      { kind:'blobs', sub:'tin',    fromTy:60, toTy:320, count:126, r:[1.6, 3.8], line:true },
      /* Deeper strata for Phase 2c's pick-tier gate: granite uncommon below
         the copper/tin bands, adamant rarer still and deeper again, so the
         tier gate has somewhere meaningful to bite once a bronze pickaxe
         cannot break either. */
      { kind:'blobs', sub:'granite', fromTy:120, toTy:320, count:78, r:[1.4, 3.0], line:true },
      { kind:'blobs', sub:'adamant', fromTy:220, toTy:320, count:40, r:[1.2, 2.4], line:true }
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
