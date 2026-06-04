// The RIGHT training figure (#snapshots-canvas, the generated samples) shows a
// FAINT ground-truth overlay behind the points, so you can see how close the
// samples land to the target. The ghost is excluded from the cloud-sum, so the
// generated cloud still changes across snapshots.
const { test, expect } = require('@playwright/test');

test('snapshots canvas overlays a faint 200-point ground truth', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const canvas = page.locator('#snapshots-canvas');
  // a ground-truth ghost (the full 200-point clean dataset) is drawn behind
  await expect(canvas).toHaveAttribute('data-ghost-count', '200');

  // the generated cloud itself still animates (ghost not counted in cloud-sum)
  const slider = page.locator('#snapshot-slider');
  await slider.fill('0');
  await slider.dispatchEvent('input');
  const sum0 = await canvas.getAttribute('data-cloud-sum');
  const max = parseInt((await slider.getAttribute('max')) || '0', 10);
  await slider.fill(String(max));
  await slider.dispatchEvent('input');
  expect(await canvas.getAttribute('data-cloud-sum')).not.toBe(sum0);
  // ghost persists across snapshots
  await expect(canvas).toHaveAttribute('data-ghost-count', '200');
});

test('snapshots samples are green; gt overlay is faint purple', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const canvas = page.locator('#snapshots-canvas');
  await expect(canvas).toHaveAttribute('data-color', '#16a34a');       // generated samples: reverse green
  await expect(canvas).toHaveAttribute('data-ghost-color', '#6d28d9'); // gt overlay: faint purple
});
