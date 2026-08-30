import { P } from '../core/palette.js';


/* ============================================================
   MATERIALS

   One table. `solid` decides collision, `hard` decides how long a
   pickaxe takes, `drop` is what mining it yields, and the colours
   are what the chunk painter uses. Tile ids are stored as bytes,
   so this table may hold at most 256 entries.
   ============================================================ */
export const AIR = 0;

export const MAT = [
  /* 0 */ { id:'air',    solid:false, hard:0,   drop:null,
            a:null, b:null, c:null, name:'AIR' },

  /* 1 */ { id:'soil',   solid:true,  hard:0.30, drop:'soil',
            a:'#8d6842', b:P.soil,    c:'#5e4229', name:'SOIL' },

  /* 2 */ { id:'grass',  solid:true,  hard:0.30, drop:'soil',
            a:P.grassA,  b:P.grassB,  c:P.grassC, name:'TURF' },

  /* 3 */ { id:'seam',   solid:true,  hard:0.15, drop:'soil',
            a:'#a98a5e', b:'#8d7048', c:'#6b5333', name:'SOFT SEAM' },

  /* 4 */ { id:'lime',   solid:true,  hard:0.75, drop:'stone',
            a:P.limeA,   b:P.limeB,   c:P.limeD,  name:'LIMESTONE' },

  /* 5 */ { id:'copper', solid:true,  hard:0.95, drop:'copper',
            a:P.cuA,     b:P.cuB,     c:P.cuD,    name:'COPPER VEIN' },

  /* 6 */ { id:'granite',solid:true,  hard:2.40, drop:'stone',
            a:P.irB,     b:P.irC,     c:P.irD,    name:'GRANITE' },

  /* 7 */ { id:'ladder', solid:false, hard:0.10, drop:'timber',
            a:P.woodA,   b:P.woodB,   c:P.woodC,  name:'LADDER', climb:true },

  /* 8 */ { id:'timber', solid:true,  hard:0.35, drop:'timber',
            a:P.woodB,   b:P.woodC,   c:P.woodD,  name:'TIMBER' },

  /* 9 */ { id:'leaves', solid:false, hard:0.10, drop:'timber',
            a:P.vdB,     b:P.vdC,     c:P.vdD,    name:'OLIVE LEAVES' }
];

/* id lookup by name, so generation code reads as words not numbers */
export const T = {};
MAT.forEach((m, i) => { T[m.id] = i; });

export const isSolid = id => MAT[id].solid === true;
export const isClimb = id => MAT[id].climb === true;
export const hardOf  = id => MAT[id].hard;
