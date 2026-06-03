// Training viewer: step through the densely-sampled training snapshots. The
// early region (≤ step 300) is recorded at a 1-step interval so the fast initial
// shape formation is visible; the rest is coarse.
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

// Many snapshots are reachable (dense early region → max well past 300), the
// canvas is the full 200-point dataset, and the EARLY snapshots advance the
// training step by exactly 1 (the dense 1-step interval, not the old ~2400 jump).
test('KR1: dense snapshots reachable, early steps advance by 1, 200 points', async ({ page }) => {
  await ready(page);

  const slider = page.locator('#snapshot-slider');
  await expect(slider).toBeEnabled();
  const max = parseInt((await slider.getAttribute('max')) || '0', 10);
  expect(max).toBeGreaterThanOrEqual(300); // dense region 0..300 + coarse beyond

  const canvas = page.locator('#snapshots-canvas');
  await expect(canvas).toHaveAttribute('data-point-count', '200');

  // index 0 → step 0 (untrained); index 1 → step 1 (1-step dense interval)
  await slider.fill('0');
  await slider.dispatchEvent('input');
  await expect(page.locator('#train-step')).toHaveText('0');
  const sum0 = await canvas.getAttribute('data-cloud-sum');

  await slider.fill('1');
  await slider.dispatchEvent('input');
  await expect(page.locator('#train-step')).toHaveText('1');

  // stepping all the way to the end changes the rendered cloud (later training)
  await slider.fill(String(max));
  await slider.dispatchEvent('input');
  expect(await canvas.getAttribute('data-cloud-sum')).not.toBe(sum0);
  await expect(canvas).toHaveAttribute('data-point-count', '200');
});

// KR1: snapshots are standardized (~±2.6), so the canvas must fit its view to
// the data — otherwise the dino is clipped to a central blob (the old bug).
test('KR1: training snapshot canvas fits view to data (not clipped at 1.15)', async ({ page }) => {
  await ready(page);
  const canvas = page.locator('#snapshots-canvas');
  const slider = page.locator('#snapshot-slider');
  await slider.fill('39');
  await slider.dispatchEvent('input');
  const v = parseFloat((await canvas.getAttribute('data-view')) || '0');
  expect(v).toBeGreaterThan(1.5);
  await expect(canvas).toHaveAttribute('data-point-count', '200');
});

// The step count for the selected snapshot is shown (from training.json steps[]).
test('KR4: step count for selected snapshot is shown', async ({ page }) => {
  await ready(page);
  const slider = page.locator('#snapshot-slider');
  await slider.fill('39');
  await slider.dispatchEvent('input');
  await expect(page.locator('#train-step')).not.toHaveText('—');
  const step = parseInt((await page.locator('#train-step').textContent()) || '0', 10);
  expect(step).toBeGreaterThan(0);
});
