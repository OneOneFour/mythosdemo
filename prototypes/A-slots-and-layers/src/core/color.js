/* core — colour arithmetic only. Knows no palette names and no materials. */

export const hex2rgb = h => {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
};

export function mix(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return `rgb(${(A[0] + (B[0] - A[0]) * t) | 0},${(A[1] + (B[1] - A[1]) * t) | 0},${(A[2] + (B[2] - A[2]) * t) | 0})`;
}
