import { defineConfig } from '@playwright/test';

/* Visual regression for a pixel-art game.
   The renderer is deterministic by construction — seeded RNG, integer-only
   pixels, nearest-neighbour upscale, and a bitmap font drawn with fillRect
   instead of fillText — so screenshots are bit-exact and the diff threshold
   is zero. Any nonzero diff is a real change, not antialiasing noise. */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  webServer: {
    command: 'node tools/serve.mjs',
    url: 'http://localhost:5173/',
    reuseExistingServer: true,
    stdout: 'ignore'
  },
  use: {
    baseURL: 'http://localhost:5173',
    deviceScaleFactor: 1
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 0,          // bit-exact; raise only with a written reason
      animations: 'disabled',
      scale: 'css'
    }
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } }
  ]
});
