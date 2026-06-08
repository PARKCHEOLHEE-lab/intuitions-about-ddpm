// Forward diffusion panel is a 1×3 figure like the reverse panel:
// [static x0 data | animated x_t trajectories | distribution q(x_t)].
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

// KR1: a static x0 (clean data) scatter is the first figure of the forward
// panel; it shows the full 200-point dataset and does NOT change as the
// timestep slider moves (only the trajectories/distribution animate).
test('KR1: forward panel has a static x0 figure that does not move with the slider', async ({ page }) => {
  await ready(page);

  const endpoint = page.locator('#forward-endpoint');
  await expect(endpoint).toBeVisible();
  await expect(endpoint).toHaveAttribute('data-point-count', '200');

  const slider = page.locator('#t-slider');
  await slider.fill('0');
  await slider.dispatchEvent('input');
  const sum0 = await endpoint.getAttribute('data-cloud-sum');

  // the animated trajectory canvas DOES change; the x0 endpoint must NOT
  const max = parseInt((await slider.getAttribute('max')) || '0', 10);
  await slider.fill(String(max));
  await slider.dispatchEvent('input');
  expect(await endpoint.getAttribute('data-cloud-sum')).toBe(sum0); // static

  // all three forward figures are present, in order
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('#forward-panel .two-panel canvas')].map((c) => c.id)
  );
  expect(ids).toEqual(['forward-endpoint', 'forward-scatter', 'forward-density']);
});

// KR (default position): on first load the forward slider sits at the LAST
// frame (t = num_timesteps - 1 = pure noise), mirroring the reverse panel —
// not at t=0. No slider interaction before the assertion.
test('forward slider defaults to the final timestep (t=399) on load', async ({ page }) => {
  await ready(page);

  const slider = page.locator('#t-slider');
  const max = parseInt((await slider.getAttribute('max')) || '0', 10);
  expect(max).toBeGreaterThanOrEqual(2);
  await expect(slider).toHaveValue(String(max));
  await expect(page.locator('#t-value')).toHaveText(String(max));
});
