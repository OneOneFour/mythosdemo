import { defineConfig } from '@playwright/test';

/* Visual regression for a pixel-art game.
   The renderer is deterministic by construction — seeded RNG, integer-only
   pixels, nearest-neighbour upscale, and a bitmap font drawn with fillRect
   instead of fillText — so screenshots are bit-exact and every difference is
   a real change rather than antialiasing noise. */
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
      /* BOTH numbers are needed for bit-exactness, and `maxDiffPixels` alone
         is not enough. Playwright's `threshold` is a per-pixel YIQ distance a
         difference must exceed before pixelmatch counts the pixel at all, and
         it defaults to 0.2 — wide enough to swallow an 11-unit shift in a
         near-black pixel. Phase 17g1 measured what that hid: `fc3a40e` gave
         the bellows relic a sprite and moved 100 pixels of
         `hollow-relic-unlit`, the suite stayed green, and a later blanket
         re-accept wrote the drift into the reference image. Raise neither
         without a written reason. */
      threshold: 0,
      maxDiffPixels: 0,
      animations: 'disabled',
      scale: 'css'
    }
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } }
  ]
});
