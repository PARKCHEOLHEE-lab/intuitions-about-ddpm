// All canvases are horizontally centered in their containers, and each figure's
// caption sits BELOW its canvas, center-aligned (not top-left).
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

function centerX(b) { return b.x + b.width / 2; }

// KR1: the standalone training canvas and the capped transport block are
// centered within their container (center-x matches, within a small tolerance).
test('KR1: canvases are horizontally centered in their column', async ({ page }) => {
  await ready(page);

  // standalone training snapshot canvas vs its .viz container
  const snap = await page.locator('#snapshots-canvas').boundingBox();
  const viz = await page.locator('#train-panel .viz').boundingBox();
  expect(Math.abs(centerX(snap) - centerX(viz))).toBeLessThanOrEqual(2);

  // the capped transport (modes) block vs the modes panel column
  const modes = await page.locator('#modes-panel .two-panel').boundingBox();
  const mcol = await page.locator('#modes-panel .viz').boundingBox();
  expect(Math.abs(centerX(modes) - centerX(mcol))).toBeLessThanOrEqual(2);
});

// KR2: the merged paper-style caption sits BELOW the figure row and is centered.
test('KR2: the merged caption is below the canvases and centered', async ({ page }) => {
  await ready(page);

  const cap = page.locator('#forward-panel p.hint');
  const row = page.locator('#forward-panel .two-panel');

  const capBox = await cap.boundingBox();
  const rowBox = await row.boundingBox();
  // caption is rendered BELOW the whole canvas row
  expect(capBox.y).toBeGreaterThan(rowBox.y + rowBox.height - 1);

  // caption text is centered
  const align = await cap.evaluate((el) => getComputedStyle(el).textAlign);
  expect(align).toBe('center');
});
