// The Training figure now carries THREE panels (ground-truth / samples / loss),
// so it spans the full width like the forward/reverse 1×3 figures rather than
// the capped modes 1×2 — a training canvas renders at the same width as a
// forward canvas (both are uncapped three-up rows).
const { test, expect } = require('@playwright/test');

test('training 1×3 canvases match the forward 1×3 canvas size', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const trainW = (await page.locator('#train-groundtruth').boundingBox()).width;
  const forwardW = (await page.locator('#forward-endpoint').boundingBox()).width;
  expect(Math.abs(trainW - forwardW)).toBeLessThanOrEqual(2); // same rendered width
});
