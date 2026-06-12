// The Training panel is a 1×3 figure: the FIRST canvas shows the ground-truth
// clean x0 (the target the model learns to reproduce) and stays static as the
// snapshot slider moves; the SECOND is the generated-sample snapshots canvas;
// the THIRD is the training-loss convergence curve.
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

test('training panel is a 1×3 [ground truth | snapshots | loss] figure', async ({ page }) => {
  await ready(page);

  // three canvases in the figure: ground truth, snapshots, then the loss curve
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('#train-panel .two-panel canvas')].map((c) => c.id)
  );
  expect(ids).toEqual(['train-groundtruth', 'snapshots-canvas', 'train-loss']);

  // the ground-truth canvas renders the full clean dataset (200 points)
  const gt = page.locator('#train-groundtruth');
  await expect(gt).toHaveAttribute('data-point-count', '200');

  // it is the GROUND TRUTH: it does NOT change as the snapshot slider advances
  const slider = page.locator('#snapshot-slider');
  await slider.fill('0');
  await slider.dispatchEvent('input');
  const sum0 = await gt.getAttribute('data-cloud-sum');
  const max = parseInt((await slider.getAttribute('max')) || '0', 10);
  await slider.fill(String(max));
  await slider.dispatchEvent('input');
  expect(await gt.getAttribute('data-cloud-sum')).toBe(sum0); // static ground truth
});
