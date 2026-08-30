/* Keyboard -> player.cmd. STUB (leaf): the listener bodies. `shell` is the
   only layer allowed to know a browser exists. */

import { player } from '../model/player.js';

export function bind() {
  /* addEventListener('keydown', e => set(e.code, 1)) */
}

export function set(code, v) {
  const c = player.cmd;
  if (code === 'ArrowLeft') c.left = v;
  else if (code === 'ArrowRight') c.right = v;
  else if (code === 'ArrowUp') c.up = v;
  else if (code === 'Space') c.dig = v;
}
