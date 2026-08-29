import { W } from '../core/canvas.js';
import { WORLD_H } from './config.js';
import { carve, shore } from './excavate.js';
import { VOIDS } from './layout.js';
import { drawAbyss, drawAquifer, drawBasalt, drawHades, drawHeavens, drawLimestone, drawOchre, drawSurface } from './strata.js';
import { drawRails, liftStructure, servicePipes, stationBodies, surfaceWorks } from './structures.js';

export let world = null;                // pre-rendered static strip


/* ============================================================
   STATIC BUILD — carve first, then build inside the carved space
   ============================================================ */
export function buildWorld() {
  world = document.createElement('canvas');
  world.width = W; world.height = WORLD_H;
  const g = world.getContext('2d');
  g.imageSmoothingEnabled = false;

  drawHeavens(g);
  drawSurface(g);
  drawLimestone(g);
  drawOchre(g);
  drawAquifer(g);
  drawBasalt(g);
  drawAbyss(g);
  drawHades(g);

  for (const v of VOIDS) carve(g, v);        // remove rock
  for (const v of VOIDS) shore(g, v);        // hold the roof up
  liftStructure(g);
  drawRails(g);
  stationBodies(g);
  servicePipes(g);
  surfaceWorks(g);
}
