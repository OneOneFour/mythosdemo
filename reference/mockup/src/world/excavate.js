import { R, lineTo } from '../core/canvas.js';
import { P } from '../core/palette.js';
import { hash2 } from '../core/rng.js';


/* ---------- what rock am I in ---------- */
export function rockOf(y) {
  if (y < 356)  return { edge: P.soil,   dark: '#2b1e12', rub: P.soil    };
  if (y < 640)  return { edge: P.limeC,  dark: '#453f36', rub: P.limeD   };
  if (y < 1010) return { edge: P.ochreC, dark: '#33210f', rub: P.ochreD  };
  if (y < 1330) return { edge: P.aquC,   dark: '#0d1e2b', rub: P.aquC    };
  if (y < 1740) return { edge: P.basC,   dark: '#180a0c', rub: P.basD    };
  if (y < 2180) return { edge: '#221c2e', dark: '#06050b', rub: P.abyB   };
  return { edge: P.hadC, dark: '#030207', rub: P.hadB };
}


/* --- carve a void out of the strata, with a ragged edge --- */
export function carve(g, v) {
  if (v.kind === 'open') return;      // daylight needs no excavating
  const rk = rockOf(v.y + v.h / 2);
  for (let y = v.y; y < v.y + v.h; y++) {
    const jl = ((hash2(v.x, y) * 3) | 0) - 1;
    const jr = ((hash2(v.x + v.w, y) * 3) | 0) - 1;
    R(g, v.x + jl, y, v.w + jr - jl, 1, rk.dark);
  }
  // lip highlight along roof and floor so the void reads as cut, not painted
  for (let x = v.x; x < v.x + v.w; x++) {
    const jt = ((hash2(x, v.y) * 3) | 0) - 1;
    R(g, x, v.y + jt, 1, 2, rk.edge);
    if (v.kind !== 'shaft' && v.kind !== 'lift') {
      const jb = ((hash2(x, v.y + v.h) * 3) | 0) - 1;
      R(g, x, v.y + v.h + jb - 2, 1, 2, rk.edge);
      if (hash2(x, 91) < 0.30) R(g, x, v.y + v.h + jb - 3, 1, 1, rk.rub);
    }
  }
  // stalactite fringe on drift roofs
  if (v.kind === 'drift')
    for (let x = v.x; x < v.x + v.w; x += 3) {
      const d = (hash2(x, 77) * 5) | 0;
      if (d > 2) R(g, x, v.y + 1, 2, d, rk.edge);
    }
}


/* --- timbering, ladders, floor planking --- */
export function shore(g, v) {
  if (v.kind === 'open') return;
  const rk = rockOf(v.y + v.h / 2);
  if (v.kind === 'shaft') {
    for (let y = v.y; y < v.y + v.h; y += 13) {          // wall sets
      R(g, v.x - 2, y, 2, 13, P.woodC);
      R(g, v.x + v.w, y, 2, 13, P.woodC);
      R(g, v.x - 2, y, v.w + 4, 2, P.woodB);
    }
    for (let y = v.y + 4; y < v.y + v.h; y += 7)          // ladder
      R(g, v.x + 1, y, v.w - 2, 1, P.woodA);
    R(g, v.x - 5, v.y - 3, v.w + 10, 5, P.woodA);         // collar at the mouth
    R(g, v.x - 5, v.y - 3, v.w + 10, 1, '#a67c48');
  } else if (v.kind === 'lift') {
    for (let y = v.y; y < v.y + v.h; y += 26) {
      R(g, v.x - 3, y, 3, 26, P.woodB);
      R(g, v.x + v.w, y, 3, 26, P.woodB);
      R(g, v.x - 3, y, 3, 2, P.woodA);
      R(g, v.x + v.w, y, 3, 2, P.woodA);
    }
    R(g, v.x + 13, v.y, 2, v.h, P.irC);                   // guide rails
    R(g, v.x + 29, v.y, 2, v.h, P.irC);
  } else {                                                 // drift
    const fy = v.y + v.h;
    R(g, v.x, fy - 3, v.w, 3, P.woodC);                    // floor planking
    for (let x = v.x; x < v.x + v.w; x += 9) R(g, x, fy - 3, 1, 3, P.woodD);
    for (let x = v.x + 14; x < v.x + v.w - 10; x += 34) {  // roof props
      R(g, x, v.y + 3, 3, v.h - 6, P.woodB);
      R(g, x, v.y + 3, 3, 2, P.woodA);
      R(g, x - 3, v.y + 3, 9, 2, P.woodB);
      lineTo(g, x - 2, v.y + 7, x + 5, v.y + 3, P.woodC, 1);
    }
    for (let i = 0; i < v.w / 5; i++) {                    // loose rubble
      const rx = v.x + hash2(i, v.y) * v.w;
      R(g, rx, fy - 4 - ((hash2(i, 5) * 2) | 0), 2, 2, rk.rub);
    }
  }
}
