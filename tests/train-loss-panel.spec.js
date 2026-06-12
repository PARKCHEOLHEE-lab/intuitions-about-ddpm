// Training module: the 1x3 figure adds a loss-convergence panel (#train-loss)
// as the third figure. It is scrub-synced to the SAME slider as the samples
// panel — the marker's reported step tracks #train-step — and adding it must not
// disturb the existing samples canvas (#snapshots-canvas).
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

test('KR3: 1x3 training figure — loss panel tracks the slider; samples unaffected', async ({ page }) => {
  await ready(page);

  const slider = page.locator('#snapshot-slider');
  const loss = page.locator('#train-loss');
  const samples = page.locator('#snapshots-canvas');

  // the third panel exists and is populated with the per-checkpoint loss curve
  await expect(loss).toHaveCount(1, { timeout: 8000 });
  await expect(loss).toHaveAttribute('data-loss-count', /^[1-9][0-9]*$/);

  // scrubbing keeps the loss marker's reported step in lock-step with #train-step
  for (const idx of ['0', '1', '5']) {
    await slider.fill(idx);
    await slider.dispatchEvent('input');
    const step = (await page.locator('#train-step').textContent()).trim();
    await expect(loss).toHaveAttribute('data-current-step', step);
  }

  // behavior preservation: the samples canvas still renders the full 200-point
  // cloud and is still driven by the slider (distinct sums at the two ends) —
  // the loss panel did not take over or freeze it.
  await expect(samples).toHaveAttribute('data-point-count', '200');
  const max = parseInt((await slider.getAttribute('max')) || '0', 10);
  await slider.fill('0');
  await slider.dispatchEvent('input');
  const sum0 = await samples.getAttribute('data-cloud-sum');
  await slider.fill(String(max));
  await slider.dispatchEvent('input');
  expect(await samples.getAttribute('data-cloud-sum')).not.toBe(sum0);
});
