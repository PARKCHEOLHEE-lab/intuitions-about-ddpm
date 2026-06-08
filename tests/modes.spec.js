// Intro "trajectory transport" figure: a few colored trajectories animate from
// noise (x_T) to the data modes (x_0), scrubbable by timestep.
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

test('intro modes panel animates colored transport trajectories', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#modes-panel')).toBeVisible();

  // LEFT panel (static): the full endpoint clouds — 20 x_T noise starts (red) and
  // the four x_0 mode clusters (12 points each = 48), all solid crosses.
  const endpoints = page.locator('#modes-endpoints');
  await expect(endpoints).toBeVisible();
  await expect(endpoints).toHaveAttribute('data-point-count', '48'); // 4 modes x 12
  await expect(endpoints).toHaveAttribute('data-start-count', '20'); // x_T cloud
  await expect(endpoints).toHaveAttribute('data-marker', 'cross');
  const center = (await endpoints.getAttribute('data-center')) || '0,0';
  expect(center).not.toBe('0,0');
  expect(parseInt((await endpoints.getAttribute('data-mode-count')) || '0', 10)).toBeGreaterThanOrEqual(2);

  // RIGHT panel: faint backdrop = 20 x_T + HALF the x_0 mode points (4 x 6 = 24)
  // = 44, so the trajectory panel is less cluttered than the left overview.
  const canvas = page.locator('#modes-canvas');
  await expect(canvas).toHaveAttribute('data-point-count', '9'); // 3 starts x 3 runs
  await expect(canvas).toHaveAttribute('data-backdrop-count', '44');
  expect(parseInt((await canvas.getAttribute('data-mode-count')) || '0', 10)).toBeGreaterThanOrEqual(2);

  // the slider scrubs the trajectory animation (noise -> modes)
  const slider = page.locator('#modes-slider');
  await expect(slider).toBeEnabled();
  const max = parseInt((await slider.getAttribute('max')) || '0', 10);
  expect(max).toBeGreaterThanOrEqual(2);

  await slider.fill('0');
  await slider.dispatchEvent('input');
  await expect(canvas).toHaveAttribute('data-trail-steps', '1'); // only x_T at frame 0

  await slider.fill(String(max));
  await slider.dispatchEvent('input');
  await expect(canvas).toHaveAttribute('data-trail-steps', String(max + 1));
});

// The transport paths default to SMOOTHED (Chaikin on) for a clean read; a toggle
// lets you turn it off to inspect the raw stochastic polyline.
test('transport trail smoothing toggle defaults on', async ({ page }) => {
  await ready(page);
  const canvas = page.locator('#modes-canvas');
  // default: smoothing ON -> Chaikin-smoothed trajectory polyline
  await expect(canvas).toHaveAttribute('data-trail-smoothed', 'true');

  const toggle = page.locator('#modes-smooth');
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeChecked();

  await toggle.uncheck();
  await expect(canvas).toHaveAttribute('data-trail-smoothed', 'false'); // re-rendered raw
});

// Reference style: the LEFT panel shows x_T solid red; the RIGHT panel shows the
// full clouds (incl. x_T) faintly as a backdrop, with only the selected paths bold.
test('left x_T is solid red; right panel draws a faint cloud backdrop', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#modes-endpoints')).toHaveAttribute('data-start-color', '#dc2626');
  const backdrop = parseInt((await page.locator('#modes-canvas').getAttribute('data-backdrop-count')) || '0', 10);
  expect(backdrop).toBeGreaterThan(0); // faint x_T + x_0 clouds behind the paths
});

// The SELECTED x_T starts (the ones we actually trace) are drawn solid on the
// right panel — same opacity as the left — so you see WHERE the paths begin,
// while the rest of the x_T cloud stays faint in the backdrop.
test('right panel draws the selected x_T starts solid', async ({ page }) => {
  await ready(page);
  const canvas = page.locator('#modes-canvas');
  const n = parseInt((await canvas.getAttribute('data-solid-start-count')) || '0', 10);
  expect(n).toBe(3); // 3 fixed selected starts (modes.starts)
});

// Performance: with 400-frame trajectories, smoothing every raw control point
// blows up the drawn vertex count (~control x 2^iters). Downsampling the control
// points first bounds it regardless of frame count, keeping the slider snappy.
test('smoothed trail vertex count stays bounded at the final (400-frame) step', async ({ page }) => {
  await ready(page);
  const canvas = page.locator('#modes-canvas');
  const slider = page.locator('#modes-slider');
  const max = parseInt((await slider.getAttribute('max')) || '0', 10);
  expect(max).toBeGreaterThanOrEqual(399); // full 400-frame trajectory

  await page.locator('#modes-smooth').check(); // smoothing on
  await slider.fill(String(max));
  await slider.dispatchEvent('input');

  // per-path drawn polyline vertices: bounded by ~maxControlPoints x 2^iters
  // (default 256 ctrl x 8 = 2048), NOT the ~3200 from Chaikin over all 400 raw
  // control points — i.e. the downsample is active and caps the work.
  const v = parseInt((await canvas.getAttribute('data-trail-vertices')) || '0', 10);
  expect(v).toBeGreaterThan(0);
  expect(v).toBeLessThanOrEqual(2048);
});

// The already-drawn early part of a smoothed trail must NOT reshape as the
// slider advances — control points sit on a fixed (index-independent) grid.
test('smoothed early trail shape stays stable as the slider advances', async ({ page }) => {
  await ready(page);
  const canvas = page.locator('#modes-canvas');
  const slider = page.locator('#modes-slider');
  const max = parseInt((await slider.getAttribute('max')) || '0', 10);
  await page.locator('#modes-smooth').check(); // smoothing on

  await slider.fill(String(Math.floor(max / 2)));
  await slider.dispatchEvent('input');
  const headMid = await canvas.getAttribute('data-trail-head');

  await slider.fill(String(max));
  await slider.dispatchEvent('input');
  const headMax = await canvas.getAttribute('data-trail-head');

  expect(headMid).toBe(headMax); // early curve identical at half vs full extent
});

// At the final step (t=0) each path has reached its x_0, so the current points
// are drawn as x crosses (matching the x_0 mode symbol); mid-steps stay dots.
test('transport current points become crosses at the final step', async ({ page }) => {
  await ready(page);
  const canvas = page.locator('#modes-canvas');
  const slider = page.locator('#modes-slider');
  const max = parseInt((await slider.getAttribute('max')) || '0', 10);

  await slider.fill(String(max));
  await slider.dispatchEvent('input');
  await expect(canvas).toHaveAttribute('data-current-marker', 'cross'); // x_0 reached -> x

  await slider.fill('0');
  await slider.dispatchEvent('input');
  await expect(canvas).toHaveAttribute('data-current-marker', 'dot'); // mid-transport -> dot
});
