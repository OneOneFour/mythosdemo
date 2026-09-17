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
      /* Both numbers are needed for bit-exactness. `threshold` is a per-pixel
         YIQ distance a difference must exceed before pixelmatch counts it at
         all, and its 0.2 default is wide enough to swallow an 11-unit shift in
         a near-black pixel. Raise neither without a written reason. */
      threshold: 0,
      maxDiffPixels: 0,
      animations: 'disabled',
      scale: 'css'
    }
  },
  /* One project. The game is keyboard-and-mouse only, with no touch handling
     in `src/`, so a second device project would re-photograph every scene
     without testing an input path. The 200x180 buffer floor is a desktop
     condition, asserted through `narrowFloor` rather than photographed. */
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } }
  ]
});
