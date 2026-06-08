// KR3 — forward diffusion viewer: scrub precomputed frames by index.
// The page is now a pure-JS viewer of precomputed JSON (no Pyodide).
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
  await expect(page.locator('#t-slider')).toBeEnabled();
}

// Scrubbing the slider by frame index actually changes the rendered cloud, and
// every frame is the full 500-point dataset.
test('KR3: slider scrubs precomputed frames and the cloud changes', async ({ page }) => {
  await ready(page);

  const slider = page.locator('#t-slider');
  const canvas = page.locator('#forward-scatter');

  await slider.fill('0');
  await slider.dispatchEvent('input');
  const sum0 = await canvas.getAttribute('data-cloud-sum');
  await expect(canvas).toHaveAttribute('data-point-count', '200');

  // slider max must be frames.length - 1, not a hardcoded T.
  const max = parseInt((await slider.getAttribute('max')) || '0', 10);
  expect(max).toBeGreaterThanOrEqual(2);

  await slider.fill(String(max));
  await slider.dispatchEvent('input');
  const sumHi = await canvas.getAttribute('data-cloud-sum');

  expect(sumHi).not.toBe(sum0);
  await expect(canvas).toHaveAttribute('data-point-count', '200');
});

// KR1: scrubbing leaves a cumulative per-point trajectory trail (frames 0..i),
// while the current x_t points stay rendered (500) and the cloud still changes.
test('KR1: forward scrub leaves a cumulative per-point trail', async ({ page }) => {
  await ready(page);
  const slider = page.locator('#t-slider');
  const canvas = page.locator('#forward-scatter');

  await slider.fill('0');
  await slider.dispatchEvent('input');
  await expect(canvas).toHaveAttribute('data-trail-steps', '1'); // index 0 → 1 frame in trail
  await expect(canvas).toHaveAttribute('data-point-count', '200');
  const sum0 = await canvas.getAttribute('data-cloud-sum');

  await slider.fill('20');
  await slider.dispatchEvent('input');
  await expect(canvas).toHaveAttribute('data-trail-steps', '21'); // index 20 → 21 frames
  await expect(canvas).toHaveAttribute('data-point-count', '200');
  expect(await canvas.getAttribute('data-cloud-sum')).not.toBe(sum0);
});

// KR2: the original t=0 dino stays as a faint persistent ghost at every
// position (including high t, where x_t is mostly noise).
test('KR2: original t=0 data persists as a ghost at any slider position', async ({ page }) => {
  await ready(page);
  const slider = page.locator('#t-slider');
  const canvas = page.locator('#forward-scatter');

  await slider.fill('0');
  await slider.dispatchEvent('input');
  await expect(canvas).toHaveAttribute('data-ghost-count', '200');

  const max = parseInt((await slider.getAttribute('max')) || '0', 10);
  await slider.fill(String(max));
  await slider.dispatchEvent('input');
  await expect(canvas).toHaveAttribute('data-ghost-count', '200'); // still there at high t
});

// #t-value shows the diffusion timestep ts[i], recorded at EVERY timestep so the
// slider snaps by exactly 1 (ts[i] == i). The old sparse linspace gave ts[1]==10.
test('KR3: t-value snaps by one timestep per slider step', async ({ page }) => {
  await ready(page);
  const slider = page.locator('#t-slider');

  await slider.fill('0');
  await slider.dispatchEvent('input');
  await expect(page.locator('#t-value')).toHaveText('0'); // ts[0] == 0

  // one slider step advances t by exactly 1 (would be 10 under the old data)
  await slider.fill('1');
  await slider.dispatchEvent('input');
  await expect(page.locator('#t-value')).toHaveText('1');

  // last frame is the noisiest timestep num_timesteps - 1, == the slider max index
  const max = parseInt((await slider.getAttribute('max')) || '0', 10);
  await slider.fill(String(max));
  await slider.dispatchEvent('input');
  await expect(page.locator('#t-value')).toHaveText(String(max));
});
