import { PILES } from '../world/layout.js';


/* ---------- piles ---------- */
export function pileAdd(i, k) {
  const p = PILES[i]; if (!p) return;
  p.n = Math.min(p.cap, p.n + (k || 1));
}

export function pileTake(i, k) {
  const p = PILES[i]; if (!p) return false;
  k = k || 1;
  if (p.n < k) return false;
  p.n -= k; return true;
}

export function pileFor(s) {
  const map = { A: 'ore1', B: 'fuel', C: 'ore2', D: 'ore3', E: 'wash', F: 'deep' };
  return PILES.findIndex(p => p.id === map[s.id]);
}

export function floorType(s) {
  if (s.kind === 'spoil') return 'lava';
  if (s.id === 'E') return 'stone';
  return 'stone';
}
