// The Training 1×2 figure is sized to match the modes ("Sampling trajectories")
// 1×2: both two-panel blocks share the same 46rem cap, so a training canvas
// renders at the same width as a modes canvas.
const { test, expect } = require('@playwright/test');

test('training 1×2 canvases match the modes 1×2 canvas size', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const trainW = (await page.locator('#train-groundtruth').boundingBox()).width;
  const modesW = (await page.locator('#modes-endpoints').boundingBox()).width;
  expect(Math.abs(trainW - modesW)).toBeLessThanOrEqual(2); // same rendered width
});
