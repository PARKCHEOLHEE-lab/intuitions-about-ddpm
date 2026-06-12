// The middle training figure (#snapshots-canvas) renders its content shifted
// slightly LEFT within the canvas, so the generated samples (whose clipped
// outliers otherwise lean right) sit left of the ground-truth canvas's content.
const { test, expect } = require('@playwright/test');

// mass-centroid (mean x) of pixels matching `pick`, as a fraction of canvas width
async function centroidX(page, id, pick) {
  return page.evaluate(({ id, pick }) => {
    const c = document.getElementById(id);
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sx = 0, n = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4, R = d[i], G = d[i + 1], B = d[i + 2];
      const ink = R < 245 || G < 245 || B < 245;
      const green = G > 100 && R < G - 30 && B < G - 30;
      if ((pick === 'green' ? green : ink) ) { sx += x; n++; }
    }
    return n ? sx / n / c.width : 0.5;
  }, { id, pick });
}

test('snapshots canvas content is shifted left of the ground-truth content', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const slider = page.locator('#snapshot-slider');
  await slider.fill(String(parseInt((await slider.getAttribute('max')) || '0', 10)));
  await slider.dispatchEvent('input');
  await page.waitForTimeout(200);

  const gt = await centroidX(page, 'train-groundtruth', 'ink');     // clean dino
  const snap = await centroidX(page, 'snapshots-canvas', 'green');  // generated samples

  // the generated samples sit clearly left of the ground-truth content
  expect(snap).toBeLessThan(gt - 0.02);
});
