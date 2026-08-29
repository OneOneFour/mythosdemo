import { resize } from './core/canvas.js';
import { buildWorld } from './world/build.js';
import { layoutContent } from './world/layout.js';

export function rebuild() { resize(); layoutContent(); buildWorld(); }
