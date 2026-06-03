// KR5/KR2 — reverse sampling viewer: x_0 final cluster + a step-scrubable
// trajectory (noise → dino), from precomputed reverse.json.
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

// Both panels render on load: the x_0 result cluster and the trajectory.
test('KR5: renders x_0 final cluster and trajectory on load', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#reverse-x0')).toHaveAttribute('data-point-count', '200');
  await expect(page.locator('#reverse-traj')).toHaveAttribute('data-point-count', '200');
});

// KR2: a step slider scrubs the reverse trajectory — index i shows the state
// after i recorded denoising steps, with a cumulative trail. i=0 is pure noise,
// i=max is the dino, so the cloud changes across the scrub.
test('KR2: reverse step slider scrubs the trajectory (noise → dino)', async ({ page }) => {
  await ready(page);
  const slider = page.locator('#reverse-step-slider');
  const traj = page.locator('#reverse-traj');
  await expect(slider).toBeEnabled();

  const max = parseInt((await slider.getAttribute('max')) || '0', 10);
  expect(max).toBeGreaterThanOrEqual(2);

  await slider.fill('0');
  await slider.dispatchEvent('input');
  await expect(traj).toHaveAttribute('data-trail-steps', '1'); // index 0 → 1 frame (pure noise)
  const sum0 = await traj.getAttribute('data-cloud-sum');

  await slider.fill(String(max));
  await slider.dispatchEvent('input');
  await expect(traj).toHaveAttribute('data-trail-steps', String(max + 1));
  await expect(traj).toHaveAttribute('data-point-count', '200');
  expect(await traj.getAttribute('data-cloud-sum')).not.toBe(sum0); // noise vs dino
});

// The reverse trail can be visually smoothed (cosmetic) via an on/off toggle.
test('reverse trail has a smoothing on/off toggle that re-renders', async ({ page }) => {
  await ready(page);
  const toggle = page.locator('#reverse-smooth');
  const traj = page.locator('#reverse-traj');
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeChecked(); // smoothing on by default
  await expect(traj).toHaveAttribute('data-trail-smoothed', 'true');

  await toggle.uncheck();
  await expect(traj).toHaveAttribute('data-trail-smoothed', 'false'); // re-rendered raw
});

// Smoothing averages the trail polyline only — the actual x_t dots are untouched.
test('smoothing changes the trail polyline but not the dots', async ({ page }) => {
  await ready(page);
  const slider = page.locator('#reverse-step-slider');
  const toggle = page.locator('#reverse-smooth');
  const traj = page.locator('#reverse-traj');

  const max = parseInt((await slider.getAttribute('max')) || '0', 10);
  await slider.fill(String(Math.floor(max / 2))); // a mid frame with a long trail
  await slider.dispatchEvent('input');

  await expect(toggle).toBeChecked(); // smoothing on
  const trailOn = await traj.getAttribute('data-trail-sum');
  const dotsOn = await traj.getAttribute('data-cloud-sum');

  await toggle.uncheck(); // smoothing off (raw random walk)
  const trailOff = await traj.getAttribute('data-trail-sum');
  const dotsOff = await traj.getAttribute('data-cloud-sum');

  expect(trailOn).not.toBe(trailOff); // the drawn trail polyline is averaged
  expect(dotsOn).toBe(dotsOff); // the actual x_t dots are unchanged
});

// The reverse-panel canvases must be the same pixel size as the forward viewer.
test('reverse canvases match the forward canvas size', async ({ page }) => {
  await ready(page);
  const fw = page.locator('#forward-scatter');
  const w = await fw.getAttribute('width');
  const h = await fw.getAttribute('height');
  for (const id of ['#reverse-x0', '#reverse-traj']) {
    expect(await page.locator(id).getAttribute('width')).toBe(w);
    expect(await page.locator(id).getAttribute('height')).toBe(h);
  }
});

// Like the forward viewer, the reverse slider reports the diffusion timestep t,
// not an opaque frame index. t starts high (pure noise) and ends at 0 (the dino).
test('reverse slider shows the diffusion timestep t (high → 0)', async ({ page }) => {
  await ready(page);
  const slider = page.locator('#reverse-step-slider');
  const label = page.locator('#reverse-step');

  await slider.fill('0');
  await slider.dispatchEvent('input');
  const t0 = parseInt((await label.textContent()) || '', 10);

  const max = parseInt((await slider.getAttribute('max')) || '0', 10);
  await slider.fill(String(max));
  await slider.dispatchEvent('input');
  const tmax = parseInt((await label.textContent()) || '', 10);

  expect(t0).toBeGreaterThan(tmax); // t decreases as denoising proceeds
  expect(tmax).toBe(0); // final frame is x_0 at t=0
  expect(t0).toBeGreaterThan(100); // first frame is high-t noise
});

// On first load the reverse slider sits at the NOISE start (t = num_timesteps-1
// = 399), like the forward panel — not at the t=0 result. No interaction first.
test('reverse slider defaults to the noise start (t=399) on load', async ({ page }) => {
  await ready(page);
  const t = parseInt((await page.locator('#reverse-step').textContent()) || '', 10);
  expect(t).toBe(399);
});
