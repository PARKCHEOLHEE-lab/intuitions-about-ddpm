// Training viewer: step through training snapshots recorded at a UNIFORM
// 200-step interval (0, 200, 400, ... through the final optimizer step).
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

// Many snapshots are reachable (200-step interval over ~95k steps → max well
// past 300), the canvas is the full 200-point dataset, and each snapshot
// advances the training step by exactly 200 (not the old ~2400 jump / 1-step).
test('KR1: 200-step snapshots reachable, step advances by 200, 200 points', async ({ page }) => {
  await ready(page);

  const slider = page.locator('#snapshot-slider');
  await expect(slider).toBeEnabled();
  const max = parseInt((await slider.getAttribute('max')) || '0', 10);
  expect(max).toBeGreaterThanOrEqual(300); // ~475 snapshots at a 200-step interval

  const canvas = page.locator('#snapshots-canvas');
  await expect(canvas).toHaveAttribute('data-point-count', '200');

  // index 0 → step 0 (untrained); index 1 → step 200 (uniform 200-step interval)
  await slider.fill('0');
  await slider.dispatchEvent('input');
  await expect(page.locator('#train-step')).toHaveText('0');
  const sum0 = await canvas.getAttribute('data-cloud-sum');

  await slider.fill('1');
  await slider.dispatchEvent('input');
  await expect(page.locator('#train-step')).toHaveText('200');

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
