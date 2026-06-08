// Every panel's slider/controls row sits ABOVE its canvases (top-left), so the
// control position is consistent across panels (modes/reverse already did).
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

test('controls sit above the canvases in every panel', async ({ page }) => {
  await ready(page);

  for (const panel of ['#modes-panel', '#forward-panel', '#train-panel', '#reverse-panel']) {
    const controls = await page.locator(`${panel} .controls`).first().boundingBox();
    const firstCanvas = await page.locator(`${panel} canvas`).first().boundingBox();
    expect(controls.y).toBeLessThan(firstCanvas.y); // controls above the canvas
  }
});
